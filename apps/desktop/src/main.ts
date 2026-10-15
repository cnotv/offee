import { spawn } from 'node:child_process'
import { accessSync, appendFileSync, constants, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, session, shell, Tray } from 'electron'
import type { IpcMainInvokeEvent, MenuItemConstructorOptions, WebContents } from 'electron'
import { z } from 'zod'
import { approvalPromptFor, parsePendingReply, parseStatusReply, requestsToAsk } from './gateway-replies.ts'
import { runLauncher } from './launcher.ts'
import { describeFailure } from './setup-messages.ts'
import { trayEntries } from './tray-menu.ts'
import type { AvailableUpdate, ControlState, InstallKind, PendingRequest, SwitchRequest, TrayAction, TrayEntry, UpdateState } from './types.ts'
import { downloadVerified, fetchRelease, installDebianPackage, replaceMacApp } from './update-install.ts'
import { assetNameFor, installKindFor, macAppBundle, parseRelease, releasePageFor, releaseTagFor, startCommandFor, updateFor } from './updates.ts'
import { isAllowedRequestUrl, isOffeeUrl, isPermissionAllowed, offeeOrigin, pathWithHomebrew, unreachableProxy } from './window-policy.ts'

const distDirectory = dirname(fileURLToPath(import.meta.url))
const launcherPath = app.isPackaged ? join(process.resourcesPath, 'offee', 'bin', 'offee') : join(app.getAppPath(), '..', '..', 'bin', 'offee')
const stateDirectory = process.env.OFFEE_HOME ?? join(homedir(), '.offee')
const controlPageUrl = pathToFileURL(join(distDirectory, 'control', 'index.html')).href
const pollMilliseconds = 3000
const logDirectory = app.getPath('logs')
const logFile = join(logDirectory, 'offee.log')
const smokeTest = process.env.OFFEE_SMOKE_TEST === '1'

// Set by scripts/build.ts.
declare const OFFEE_BUILD_COMMIT: string
const buildCommit = OFFEE_BUILD_COMMIT
const builtCommitFile = join(stateDirectory, 'built-commit')

const switchRequestSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('sealed') }),
  z.object({ mode: z.literal('ask') }),
  z.object({ mode: z.literal('open'), minutes: z.number().int().min(1).max(1440) }),
])
const anthropicKeySchema = z.string().trim().min(20).max(500).regex(/^[\x21-\x7e]+$/)

// The app's mutable state lives here and nowhere else.
const runtime: {
  state: ControlState
  tray: Tray | null
  offeeWindow: BrowserWindow | null
  controlWindow: BrowserWindow | null
  askedRequestIds: Set<string>
  reviewing: boolean
  polling: boolean
  errorShown: boolean
  longRunningLauncher: AbortController | null
  availableUpdate: AvailableUpdate | null
} = {
  state: { phase: 'checking', gateway: null, hasAnthropicKey: false, message: null, buildCommit, update: { status: 'idle' } },
  tray: null,
  offeeWindow: null,
  controlWindow: null,
  askedRequestIds: new Set(),
  reviewing: false,
  polling: false,
  errorShown: false,
  longRunningLauncher: null,
  availableUpdate: null,
}

// Everything the launcher prints and every error lands here, so a failure on someone's computer
// can be read afterwards.
const writeLog = (text: string): void => {
  try {
    mkdirSync(logDirectory, { recursive: true })
    appendFileSync(logFile, text.endsWith('\n') ? text : `${text}\n`)
  } catch {
    // Logging must never be what breaks the app.
  }
}

const describeError = (error: unknown): string => (error instanceof Error ? (error.stack ?? error.message) : String(error))

// An unexpected error is logged and shown once, and the app keeps running from the menu bar
// instead of disappearing.
const reportUnexpectedError = (error: unknown): void => {
  writeLog(`${new Date().toISOString()} unexpected error: ${describeError(error)}`)
  if (smokeTest) {
    process.stderr.write(`smoke: unexpected error: ${describeError(error)}\n`)
    app.exit(1)
    return
  }
  if (runtime.errorShown || !app.isReady()) return
  runtime.errorShown = true
  dialog.showErrorBox('Offee ran into a problem', `${error instanceof Error ? error.message : String(error)}\n\nDetails are in ${logFile}`)
}

process.on('uncaughtException', reportUnexpectedError)
process.on('unhandledRejection', reportUnexpectedError)

const isSetUp = (): boolean => existsSync(join(stateDirectory, 'setup-complete'))
const hasAnthropicKey = (): boolean => existsSync(join(stateDirectory, 'keys', 'anthropic'))
const readBuiltCommit = (): string | null => (existsSync(builtCommitFile) ? readFileSync(builtCommitFile, 'utf8').trim() : null)
const recordBuiltCommit = (): void => writeFileSync(builtCommitFile, `${buildCommit}\n`)

const sendLog = (text: string): void => {
  writeLog(text)
  runtime.controlWindow?.webContents.send('offee:log', text)
}

const launcher = (args: string[], stdin?: string) => {
  writeLog(`${new Date().toISOString()} offee ${args[0] ?? ''}`)
  return runLauncher(args, { launcherPath, onOutput: sendLog, ...(stdin === undefined ? {} : { stdin }) })
}

// Setup and start can run for many minutes; only one runs at a time, and stopping Offee or
// quitting the app stops it.
const cancellableLauncher = async (args: string[]) => {
  const controller = new AbortController()
  runtime.longRunningLauncher = controller
  writeLog(`${new Date().toISOString()} offee ${args[0] ?? ''}`)
  const result = await runLauncher(args, { launcherPath, onOutput: sendLog, signal: controller.signal })
  if (runtime.longRunningLauncher === controller) runtime.longRunningLauncher = null
  return { ...result, cancelled: controller.signal.aborted }
}

const cancelLongRunningLauncher = (): void => {
  runtime.longRunningLauncher?.abort()
  runtime.longRunningLauncher = null
}

const quietCallTimeoutMilliseconds = 10_000

// Polling output stays out of the log window, which would otherwise fill with status lines.
// A VM that hangs must not leave a call behind every few seconds, so each one is cut short.
const quietLauncher = (args: string[]) => runLauncher(args, { launcherPath, signal: AbortSignal.timeout(quietCallTimeoutMilliseconds) })

const toMenuItem = (entry: TrayEntry): MenuItemConstructorOptions => {
  if (entry.type === 'separator') return { type: 'separator' }
  if (entry.type === 'label') return { label: entry.label, enabled: false }
  return {
    label: entry.label,
    enabled: entry.enabled,
    ...(entry.checked === undefined ? {} : { type: 'checkbox', checked: entry.checked }),
    click: () => void performTrayAction(entry.action),
  }
}

const refreshTray = (): void => {
  runtime.tray?.setContextMenu(Menu.buildFromTemplate(trayEntries(runtime.state.phase, runtime.state.gateway, Date.now()).map(toMenuItem)))
}

const updateState = (change: Partial<ControlState>): void => {
  runtime.state = { ...runtime.state, ...change, hasAnthropicKey: hasAnthropicKey() }
  runtime.controlWindow?.webContents.send('offee:state', runtime.state)
  refreshTray()
}

// Page failures go to the log: a blank or vanished window is otherwise silent.
const watchForPageFailures = (window: BrowserWindow, name: string): void => {
  const contents = window.webContents
  const record = (text: string) => {
    writeLog(`${new Date().toISOString()} ${name} window: ${text}`)
    if (smokeTest) process.stderr.write(`smoke: ${name} window: ${text}\n`)
  }
  contents.on('did-fail-load', (_event, code, description, url) => record(`failed to load ${url}: ${description} (${code})`))
  contents.on('preload-error', (_event, path, error) => record(`preload ${path} failed: ${describeError(error)}`))
  contents.on('render-process-gone', (_event, details) => record(`renderer gone: ${details.reason} (${details.exitCode})`))
  contents.on('console-message', (event) => {
    if (event.level === 'error' || event.level === 'warning') record(`console ${event.level}: ${event.message} (${event.sourceId}:${event.lineNumber})`)
  })
}

const allowOnlySafePermissions = (target: Electron.Session): void => {
  target.setPermissionRequestHandler((_contents, permission, callback) => callback(isPermissionAllowed(permission)))
  target.setPermissionCheckHandler((_contents, permission) => isPermissionAllowed(permission))
}

// The Offee page comes from inside the VM, so its window gets nothing of the host: no Node,
// no preload, no messages to this process, and it cannot leave its own origin.
const openOffeeWindow = (): void => {
  if (runtime.offeeWindow !== null) {
    runtime.offeeWindow.show()
    return
  }
  const offeeSession = session.fromPartition('persist:offee')
  allowOnlySafePermissions(offeeSession)
  offeeSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !isAllowedRequestUrl(details.url) }))
  // WebRTC and DNS prefetching pass beside webRequest. A proxy that leads nowhere stops both:
  // the page's own origin is loopback, which Chromium never sends through a proxy.
  const sealSession = offeeSession.setProxy({ proxyRules: unreachableProxy })
  const window = new BrowserWindow({
    width: 1320,
    height: 880,
    title: 'Offee',
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, session: offeeSession },
  })
  window.on('closed', () => {
    runtime.offeeWindow = null
  })
  runtime.offeeWindow = window
  watchForPageFailures(window, 'Offee')
  window.webContents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp')
  sealSession
    .then(() => window.loadURL(offeeOrigin))
    .catch((error: unknown) => {
    writeLog(`${new Date().toISOString()} Offee did not answer: ${describeError(error)}`)
    window.close()
    updateState({ phase: 'failed', message: `Offee did not answer at ${offeeOrigin}. Try starting it again; the log is in ${logFile}.` })
    openControlWindow()
  })
}

const openControlWindow = (): void => {
  if (runtime.controlWindow !== null) {
    runtime.controlWindow.show()
    return
  }
  const window = new BrowserWindow({
    width: 680,
    height: 760,
    title: 'Offee settings',
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, preload: join(distDirectory, 'preload.cjs') },
  })
  window.on('closed', () => {
    runtime.controlWindow = null
  })
  runtime.controlWindow = window
  watchForPageFailures(window, 'settings')
  if (smokeTest) window.webContents.once('did-finish-load', () => void reportSmokeTest(window))
  window.loadURL(controlPageUrl).catch(reportUnexpectedError)
}

// CI opens the packaged app with OFFEE_SMOKE_TEST=1: the settings page must render through
// its preload, or the build fails.
const reportSmokeTest = async (window: BrowserWindow): Promise<void> => {
  // React renders after the load event, so give it a moment before reading the page.
  await new Promise((resolve) => setTimeout(resolve, 3000))
  const page: unknown = await window.webContents.executeJavaScript(
    "JSON.stringify({ bridge: typeof window.offeeControl, text: document.body.innerText.slice(0, 300) })",
  )
  const rendered = typeof page === 'string' && page.includes('"bridge":"object"') && page.includes('Set up Offee')
  process.stdout.write(`smoke: settings window ${rendered ? 'rendered' : 'did not render'}: ${String(page)}\n`)
  if (!rendered) {
    app.exit(1)
    return
  }
  // CI serves a stand-in page on the Offee port: the window must load it through its sealed
  // session and still be unable to reach anything else.
  openOffeeWindow()
  runtime.offeeWindow?.webContents.once('did-finish-load', () => void reportOffeeWindowSmokeTest())
}

const reportOffeeWindowSmokeTest = async (): Promise<void> => {
  const page: unknown = await runtime.offeeWindow?.webContents.executeJavaScript(
    "fetch('https://example.com/', { mode: 'no-cors' }).then(() => 'reached', () => 'blocked').then((outside) => JSON.stringify({ outside, text: document.body.innerText.slice(0, 100) }))",
  )
  const sealed = typeof page === 'string' && page.includes('Offee stand-in') && page.includes('"outside":"blocked"')
  process.stdout.write(`smoke: Offee window ${sealed ? 'loaded and sealed' : 'failed'}: ${String(page)}\n`)
  app.exit(sealed ? 0 : 1)
}

const runSetup = async (): Promise<void> => {
  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: 'Set up Offee',
    message: 'Set up Offee on this computer?',
    detail: [
      'This will:',
      '• check this computer (memory, disk space, the network) and clear what an earlier attempt left behind',
      process.platform === 'darwin'
        ? '• install Colima and the Docker command-line tools with Homebrew, if they are missing'
        : '• use the Colima and Docker command-line tools you installed',
      '• create a Linux virtual machine that shares no folder with this computer',
      '• download the local models and images, about 10 GB',
      '',
      'It takes 10 to 30 minutes. Nothing you add to Offee later leaves the machine unless you open the switch.',
    ].join('\n'),
    buttons: ['Cancel', 'Set up'],
    defaultId: 1,
    cancelId: 0,
  })
  if (response !== 1) return
  updateState({ phase: 'setting-up', message: null })
  const result = await cancellableLauncher(['setup'])
  if (result.cancelled) return
  if (result.exitCode === 0) {
    recordBuiltCommit()
    updateState({ phase: 'running', message: null })
    openOffeeWindow()
  } else {
    updateState({ phase: 'failed', message: describeFailure(result.output, logFile) })
    openControlWindow()
  }
}

const start = async (): Promise<void> => {
  updateState({ phase: 'starting', message: null })
  const result = await cancellableLauncher([startCommandFor(readBuiltCommit(), buildCommit, app.isPackaged)])
  if (result.cancelled) return
  if (result.exitCode === 0) {
    recordBuiltCommit()
    updateState({ phase: 'running', message: null })
    openOffeeWindow()
  } else {
    updateState({ phase: 'failed', message: describeFailure(result.output, logFile) })
    openControlWindow()
  }
}

const stop = async (): Promise<void> => {
  updateState({ phase: 'stopping' })
  cancelLongRunningLauncher()
  runtime.offeeWindow?.close()
  await launcher(['stop'])
  updateState({ phase: 'stopped', gateway: null })
}

const setSwitch = async (request: SwitchRequest): Promise<void> => {
  await launcher(request.mode === 'open' ? ['ctl', '--json', 'open', String(request.minutes)] : ['ctl', '--json', request.mode])
  await pollGateway()
}

const askAbout = async (request: PendingRequest): Promise<void> => {
  runtime.askedRequestIds.add(request.id)
  app.focus({ steal: true })
  const prompt = approvalPromptFor(request)
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    title: prompt.title,
    message: prompt.message,
    detail: prompt.detail,
    buttons: ['Deny', 'Send'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  })
  await quietLauncher(['ctl', '--json', response === 1 ? 'approve' : 'deny', request.id])
}

// Each request is answered in a native dialog drawn by this process: a page from the VM can
// neither draw nor click it.
const reviewRequests = async (): Promise<void> => {
  if (runtime.reviewing) return
  runtime.reviewing = true
  try {
    const pending = parsePendingReply((await quietLauncher(['ctl', '--json', 'pending'])).output)
    await requestsToAsk(pending, runtime.askedRequestIds).reduce<Promise<void>>((previous, request) => previous.then(() => askAbout(request)), Promise.resolve())
  } finally {
    runtime.reviewing = false
  }
}

const pollGateway = async (): Promise<void> => {
  if (runtime.state.phase !== 'running' || runtime.polling) return
  runtime.polling = true
  try {
    const gateway = parseStatusReply((await quietLauncher(['ctl', '--json', 'status'])).output)
    updateState({ gateway })
    if (gateway?.mode === 'ask' && gateway.pendingCount > 0) await reviewRequests()
  } finally {
    runtime.polling = false
  }
}

const runSelftest = async (): Promise<void> => {
  const result = await launcher(['selftest'])
  await dialog.showMessageBox({
    type: result.exitCode === 0 ? 'info' : 'error',
    title: 'Isolation check',
    message: result.exitCode === 0 ? 'All isolation checks passed' : 'Some isolation checks failed',
    detail: result.output.trim(),
  })
}

const saveAnthropicKey = async (key: string): Promise<void> => {
  await launcher(['key', 'anthropic'], `${key}\n`)
  updateState({})
  await pollGateway()
}

const isWritable = (path: string): boolean => {
  try {
    accessSync(path, constants.W_OK)
    return true
  } catch {
    return false
  }
}

const installKind = (): InstallKind =>
  installKindFor({ packaged: app.isPackaged, platform: process.platform, execPath: process.execPath, applicationsWritable: isWritable('/Applications') })

const setUpdate = (update: UpdateState): void => updateState({ update })

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error))

// Asked for by a click, never in the background; the request goes from this computer to GitHub
// and is written to the log.
const checkForUpdate = async (): Promise<void> => {
  const tag = releaseTagFor(process.platform)
  const kind = installKind()
  if (tag === null || kind === 'source') {
    setUpdate({ status: 'notice', message: 'This copy runs from source: update it with git pull, then offee update.' })
    return
  }
  setUpdate({ status: 'checking' })
  writeLog(`${new Date().toISOString()} update: asking GitHub for the ${tag} release`)
  try {
    const release = parseRelease(await fetchRelease(tag))
    if (release === null) throw new Error('GitHub sent a release Offee cannot read')
    runtime.availableUpdate = updateFor(buildCommit, release, assetNameFor(process.platform, process.arch, kind))
    setUpdate(runtime.availableUpdate === null ? { status: 'current' } : { status: 'available', commit: runtime.availableUpdate.commit })
  } catch (error) {
    writeLog(`${new Date().toISOString()} update: check failed: ${describeError(error)}`)
    setUpdate({ status: 'notice', message: `Could not check for updates: ${errorMessage(error)}` })
  }
}

const confirmInstall = async (): Promise<boolean> => {
  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: 'Update Offee',
    message: 'Install the newest Offee?',
    detail: 'Offee stops and the app restarts. The first start afterwards rebuilds the containers, which takes a few minutes. Your documents and settings stay.',
    buttons: ['Cancel', 'Install'],
    defaultId: 1,
    cancelId: 0,
  })
  return response === 1
}

const relaunch = (): void => {
  app.relaunch()
  app.quit()
}

const installUpdate = async (): Promise<void> => {
  const update = runtime.availableUpdate
  const tag = releaseTagFor(process.platform)
  if (update === null || tag === null || ['setting-up', 'starting', 'stopping'].includes(runtime.state.phase)) return
  const kind = installKind()
  if (kind === 'release-page' || update.asset === null) {
    await shell.openExternal(releasePageFor(tag))
    return
  }
  if (!(await confirmInstall())) return
  setUpdate({ status: 'installing' })
  try {
    const directory = await mkdtemp(join(tmpdir(), 'offee-update-'))
    writeLog(`${new Date().toISOString()} update: downloading ${update.asset.url}`)
    const file = await downloadVerified(update.asset, directory)
    writeLog(`${new Date().toISOString()} update: ${update.asset.name} matches ${update.asset.digest}`)
    if (kind === 'open-disk-image') {
      await shell.openPath(file)
      setUpdate({ status: 'notice', message: 'Drag Offee to Applications, replacing the old one, then open it again.' })
      return
    }
    if (kind === 'replace-app') await replaceMacApp(file, directory, macAppBundle)
    if (kind === 'deb') await installDebianPackage(file)
    writeLog(`${new Date().toISOString()} update: installed ${update.commit}, restarting`)
    relaunch()
  } catch (error) {
    writeLog(`${new Date().toISOString()} update: install failed: ${describeError(error)}`)
    setUpdate({ status: 'notice', message: `The update was not installed: ${errorMessage(error)}` })
  }
}

const performTrayAction = async (action: TrayAction): Promise<void> => {
  if (action.kind === 'open-offee') openOffeeWindow()
  if (action.kind === 'open-control') openControlWindow()
  if (action.kind === 'switch') await setSwitch(action.request)
  if (action.kind === 'review-requests') {
    runtime.askedRequestIds.clear()
    await reviewRequests()
  }
  if (action.kind === 'start') await start()
  if (action.kind === 'stop') await stop()
  if (action.kind === 'show-log') shell.showItemInFolder(logFile)
  if (action.kind === 'check-update') {
    openControlWindow()
    await checkForUpdate()
  }
  if (action.kind === 'quit') app.quit()
}

// Only the bundled settings page may call in, never the Offee page.
const fromControlPage = (event: IpcMainInvokeEvent): boolean => event.senderFrame?.url === controlPageUrl

const handle = (channel: string, work: (event: IpcMainInvokeEvent, payload: unknown) => Promise<unknown>): void => {
  ipcMain.handle(channel, async (event, payload: unknown) => {
    if (!fromControlPage(event)) throw new Error('Not allowed')
    return work(event, payload)
  })
}

const registerControlHandlers = (): void => {
  handle('offee:get-state', async () => runtime.state)
  handle('offee:setup', runSetup)
  handle('offee:start', start)
  handle('offee:stop', stop)
  handle('offee:switch', async (_event, payload) => setSwitch(switchRequestSchema.parse(payload)))
  handle('offee:save-key', async (_event, payload) => saveAnthropicKey(anthropicKeySchema.parse(payload)))
  handle('offee:selftest', runSelftest)
  handle('offee:open-offee', async () => openOffeeWindow())
  handle('offee:check-update', checkForUpdate)
  handle('offee:install-update', installUpdate)
}

const lockDownWebContents = (contents: WebContents): void => {
  contents.on('will-attach-webview', (event) => event.preventDefault())
  // No new windows, and no hand-off to the default browser either: opening a URL there would
  // carry data out of the VM around the gateway.
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-navigate', (event, url) => {
    const allowed = contents === runtime.offeeWindow?.webContents ? isOffeeUrl(url) : url === controlPageUrl
    if (!allowed) event.preventDefault()
  })
  contents.on('will-redirect', (event, url) => {
    if (!isOffeeUrl(url) && url !== controlPageUrl) event.preventDefault()
  })
}

// macOS tints a black template image to suit the menu bar; Linux panels can be light or dark,
// so they get the coloured app icon.
const createTray = (): void => {
  const icon = nativeImage.createFromPath(join(distDirectory, 'assets', process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png'))
  icon.setTemplateImage(true)
  runtime.tray = new Tray(icon)
  runtime.tray.setToolTip('Offee')
  refreshTray()
}

// Quitting stops the VM in the background so the app can close at once. A setup that failed or
// is still running has a VM too, and possibly a download, so only a VM that was never created or
// is already stopped is left alone.
const stopInBackground = (): void => {
  cancelLongRunningLauncher()
  if (runtime.state.phase === 'needs-setup' || runtime.state.phase === 'stopped') return
  const child = spawn(launcherPath, ['stop'], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, PATH: pathWithHomebrew(process.env.PATH) },
  })
  child.unref()
}

app.on('web-contents-created', (_event, contents) => lockDownWebContents(contents))
app.on('window-all-closed', () => {
  // Offee keeps running from the menu bar.
})
const showWindow = (): void => (runtime.state.phase === 'running' ? openOffeeWindow() : openControlWindow())
app.on('activate', showWindow)
// Many Linux desktops show no tray icon, so opening Offee again is how its windows come back.
app.on('second-instance', showWindow)
app.on('before-quit', stopInBackground)

if (smokeTest) {
  process.stdout.write('smoke: starting\n')
  setTimeout(() => {
    process.stderr.write('smoke: the windows did not finish loading within 40 seconds\n')
    app.exit(1)
  }, 40_000)
}

// No top-level await here: in an ES module main, Electron fires `ready` only after this module
// has finished evaluating, so awaiting it at the top level waits forever.
const startApp = (): void => {
  if (smokeTest) process.stdout.write('smoke: ready\n')
  allowOnlySafePermissions(session.defaultSession)
  registerControlHandlers()
  createTray()
  setInterval(() => void pollGateway(), pollMilliseconds)
  if (isSetUp()) {
    void start()
  } else {
    updateState({ phase: 'needs-setup' })
    openControlWindow()
  }
}

if (app.requestSingleInstanceLock()) {
  app.whenReady().then(startApp).catch(reportUnexpectedError)
} else {
  app.quit()
}
