import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { approvalPromptFor, parsePendingReply, parseStatusReply, requestsToAsk, switchLabel } from './gateway-replies.ts'
import { describeFailure } from './setup-messages.ts'
import { trayEntries } from './tray-menu.ts'
import { removeBundle } from './update-install.ts'
import { assetNameFor, digestMatches, installKindFor, parseRelease, releaseTagFor, startCommandFor, updateFor } from './updates.ts'
import { layoutViews, toolbarHeight } from './window-layout.ts'
import { isAllowedRequestUrl, isOffeeUrl, isPermissionAllowed, pathWithHomebrew, progressAsLines } from './window-policy.ts'

const request = (id: string, createdAt: number) => ({
  id,
  destination: 'anthropic',
  url: 'https://api.anthropic.com/v1/messages',
  createdAt,
  bodyBytes: 1234,
  bodyPreview: '{"model":"claude-opus-5-5"}',
})

describe('reading the gateway', () => {
  it('reads the status and the waiting requests from the JSON line, ignoring other output', () => {
    expect(parseStatusReply('warning: something\n{"ok":true,"status":{"mode":"ask","openUntil":null,"pendingCount":1}}\n')).toEqual({
      mode: 'ask',
      openUntil: null,
      pendingCount: 1,
    })
    expect(parseStatusReply('Error: No such container: offee-gateway-1')).toBeNull()
    expect(parsePendingReply(JSON.stringify({ ok: true, pending: [request('a', 1)] }))).toHaveLength(1)
    expect(parsePendingReply('{"ok":true,"pending":[{"id":1}]}')).toEqual([])
  })

  it('asks about each request once, oldest first', () => {
    expect(requestsToAsk([request('b', 2), request('a', 1), request('c', 3)], new Set(['c'])).map((entry) => entry.id)).toEqual(['a', 'b'])
  })

  it('shows where a request goes and exactly what it carries', () => {
    const prompt = approvalPromptFor(request('a', 1))
    expect(prompt.message).toBe('Send this request to anthropic?')
    expect(prompt.detail).toContain('https://api.anthropic.com/v1/messages')
    expect(prompt.detail).toContain('1,234 bytes')
    expect(prompt.detail).toContain('{"model":"claude-opus-5-5"}')
  })

  it('labels the switch', () => {
    expect(switchLabel(null, 0)).toBe('Not running')
    expect(switchLabel({ mode: 'ask', openUntil: null, pendingCount: 2 }, 0)).toBe('Ask (2 waiting)')
    expect(switchLabel({ mode: 'open', openUntil: 10 * 60_000, pendingCount: 0 }, 60_000)).toBe('Open, 9 min left')
  })
})

describe('the menu bar', () => {
  const labels = (entries: ReturnType<typeof trayEntries>) => entries.flatMap((entry) => (entry.type === 'separator' ? [] : [entry.label]))

  it('offers the switch only while running', () => {
    const running = trayEntries('running', { mode: 'sealed', openUntil: null, pendingCount: 0 }, 0)
    expect(labels(running)).toContain('Ask before each request')
    expect(running.find((entry) => entry.type === 'action' && entry.label === 'Sealed')).toMatchObject({ checked: true })
    expect(labels(trayEntries('needs-setup', null, 0))).not.toContain('Ask before each request')
  })

  it('offers to review waiting requests', () => {
    expect(labels(trayEntries('running', { mode: 'ask', openUntil: null, pendingCount: 2 }, 0))).toContain('Review 2 waiting request(s)…')
  })

  it('stops a setup, a start or a failed attempt, which can all leave the VM running', () => {
    expect(labels(trayEntries('setting-up', null, 0))).toContain('Cancel setup')
    expect(labels(trayEntries('starting', null, 0))).toContain('Stop Offee')
    expect(labels(trayEntries('failed', null, 0))).toEqual(expect.arrayContaining(['Start Offee', 'Stop Offee']))
    expect(labels(trayEntries('needs-setup', null, 0))).not.toContain('Stop Offee')
  })

  it('checks for updates in any state', () => {
    expect(labels(trayEntries('needs-setup', null, 0))).toContain('Check for updates…')
    expect(labels(trayEntries('running', { mode: 'sealed', openUntil: null, pendingCount: 0 }, 0))).toContain('Check for updates…')
  })

  it('opens Offee only when it runs', () => {
    const openEntry = trayEntries('stopped', null, 0).find((entry) => entry.type === 'action' && entry.label === 'Open Offee')
    expect(openEntry).toMatchObject({ enabled: false })
  })
})

describe('explaining a failed setup', () => {
  it('lists every failed machine check', () => {
    const output = 'Checking this machine\n  ok    32 GB of memory\n  FAIL  Setup needs 25 GB free on disk; there are 12 GB\n  FAIL  cannot reach ghcr.io\noffee: Fix the 2 problem(s) above'
    expect(describeFailure(output, '/log')).toBe('This computer is not ready for Offee yet:\n• Setup needs 25 GB free on disk; there are 12 GB\n• cannot reach ghcr.io')
  })

  it("gives the launcher's own reason, and the log", () => {
    expect(describeFailure('Starting\noffee: Offee is not set up on this machine: its VM is missing. Run setup\n', '/log')).toBe(
      'Offee is not set up on this machine: its VM is missing. Run setup\nThe full log is in /log.',
    )
    expect(describeFailure('compose failed', '/log')).toBe('Something failed. The full log is in /log.')
  })
})

describe('the window policy', () => {
  it('keeps the Offee window on its own origin', () => {
    expect(isOffeeUrl('http://127.0.0.1:8470/forms')).toBe(true)
    expect(isOffeeUrl('http://127.0.0.1:8471/')).toBe(false)
    expect(isOffeeUrl('https://example.com/')).toBe(false)
    expect(isOffeeUrl('file:///etc/passwd')).toBe(false)
    expect(isOffeeUrl('not a url')).toBe(false)
  })

  it('lets the Offee page load nothing from outside its own origin', () => {
    expect(isAllowedRequestUrl('http://127.0.0.1:8470/api/status')).toBe(true)
    expect(isAllowedRequestUrl('data:image/png;base64,AAAA')).toBe(true)
    expect(isAllowedRequestUrl('blob:http://127.0.0.1:8470/1234')).toBe(true)
    expect(isAllowedRequestUrl('https://attacker.example/?secret=1')).toBe(false)
    expect(isAllowedRequestUrl('http://localhost:8470/')).toBe(false)
    expect(isAllowedRequestUrl('wss://attacker.example/')).toBe(false)
  })

  it('grants no browser permission but copying', () => {
    expect(isPermissionAllowed('clipboard-sanitized-write')).toBe(true)
    expect(isPermissionAllowed('media')).toBe(false)
    expect(isPermissionAllowed('geolocation')).toBe(false)
  })

  it('finds Homebrew from an app started without a shell', () => {
    expect(pathWithHomebrew('/usr/bin:/bin')).toBe('/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin')
    expect(pathWithHomebrew(undefined).startsWith('/opt/homebrew/bin:')).toBe(true)
  })

  it('turns redrawn progress into lines', () => {
    expect(progressAsLines('10%\r20%\rdone\r\n')).toBe('10%\n20%\ndone\r\n')
  })
})

describe('updating the app', () => {
  const digest = `sha256:${'a'.repeat(64)}`
  const asset = (name: string, overrides: Record<string, unknown> = {}) => ({
    name,
    url: 'https://api.github.com/repos/cnotv/offee/releases/assets/644377132',
    digest,
    ...overrides,
  })
  const release = (commit: string, assets: unknown[] = [asset('Offee-arm64.dmg')]) => parseRelease({ target_commitish: commit, assets, extra: 'ignored' })
  const newer = 'b'.repeat(40)
  const current = 'c'.repeat(40)

  it('reads only the release it expects from GitHub', () => {
    expect(release(newer)).not.toBeNull()
    expect(parseRelease({ target_commitish: newer })).toBeNull()
    expect(parseRelease({ target_commitish: 42, assets: [] })).toBeNull()
    expect(parseRelease('<html>rate limited</html>')).toBeNull()
  })

  it('offers an update only when the release was built from another commit', () => {
    const latest = release(newer)
    if (latest === null) throw new Error('release did not parse')
    expect(updateFor(newer, latest, 'Offee-arm64.dmg')).toBeNull()
    expect(updateFor(current, latest, 'Offee-arm64.dmg')).toEqual({
      commit: newer,
      asset: { name: 'Offee-arm64.dmg', url: 'https://api.github.com/repos/cnotv/offee/releases/assets/644377132', digest },
    })
  })

  it('downloads nothing without a digest, from another host, or that is missing', () => {
    const elsewhere = release(newer, [asset('Offee-arm64.dmg', { url: 'https://attacker.example/Offee-arm64.dmg' })])
    const undigested = release(newer, [asset('Offee-arm64.dmg', { digest: null })])
    const latest = release(newer)
    if (elsewhere === null || undigested === null || latest === null) throw new Error('release did not parse')
    expect(updateFor(current, elsewhere, 'Offee-arm64.dmg')?.asset).toBeNull()
    expect(updateFor(current, undigested, 'Offee-arm64.dmg')?.asset).toBeNull()
    expect(updateFor(current, latest, 'Offee-linux-x64.deb')?.asset).toBeNull()
  })

  it('accepts a download only when its SHA-256 matches', () => {
    expect(digestMatches(digest, 'a'.repeat(64))).toBe(true)
    expect(digestMatches(digest, 'b'.repeat(64))).toBe(false)
  })

  it('reads the release and the file made for this computer', () => {
    expect(releaseTagFor('darwin')).toBe('mac-preview')
    expect(releaseTagFor('linux')).toBe('linux-preview')
    expect(releaseTagFor('win32')).toBeNull()
    expect(assetNameFor('darwin', 'arm64', 'replace-app')).toBe('Offee-arm64.dmg')
    expect(assetNameFor('linux', 'x64', 'deb')).toBe('Offee-linux-x64.deb')
    expect(assetNameFor('linux', 'arm64', 'deb')).toBe('Offee-linux-arm64.deb')
    expect(assetNameFor('linux', 'arm64', 'release-page')).toBe('Offee-linux-arm64.tar.gz')
  })

  it('installs the way the app was installed', () => {
    const mac = { packaged: true, platform: 'darwin', applicationsWritable: true }
    expect(installKindFor({ ...mac, execPath: '/Applications/Offee.app/Contents/MacOS/Offee' })).toBe('replace-app')
    expect(installKindFor({ ...mac, applicationsWritable: false, execPath: '/Applications/Offee.app/Contents/MacOS/Offee' })).toBe('open-disk-image')
    expect(installKindFor({ ...mac, execPath: '/private/var/folders/x/AppTranslocation/y/d/Offee.app/Contents/MacOS/Offee' })).toBe('open-disk-image')
    const linux = { packaged: true, platform: 'linux', applicationsWritable: false }
    expect(installKindFor({ ...linux, execPath: '/opt/Offee/offee' })).toBe('deb')
    expect(installKindFor({ ...linux, execPath: '/home/someone/Offee-linux-x64/offee' })).toBe('release-page')
    expect(installKindFor({ ...linux, packaged: false, execPath: '/usr/bin/electron' })).toBe('source')
    expect(installKindFor({ ...linux, platform: 'win32', execPath: 'C:\\Offee\\Offee.exe' })).toBe('source')
  })

  it('rebuilds the containers once after the app changed, not on every start', () => {
    expect(startCommandFor(null, current, true)).toBe('update')
    expect(startCommandFor(newer, current, true)).toBe('update')
    expect(startCommandFor(current, current, true)).toBe('start')
    expect(startCommandFor(newer, current, false)).toBe('start')
  })
})

describe('replacing the app bundle', () => {
  it('removes a bundle whose Resources hold an asar archive', async () => {
    const bundle = join(mkdtempSync(join(tmpdir(), 'offee-bundle-')), '.Offee-previous.app')
    mkdirSync(join(bundle, 'Contents', 'Resources'), { recursive: true })
    writeFileSync(join(bundle, 'Contents', 'Resources', 'app.asar'), 'archive')
    await removeBundle(bundle)
    expect(existsSync(bundle)).toBe(false)
    await removeBundle(bundle)
  })
})

describe('the one window', () => {
  const full = { width: 1320, height: 880 }
  const sizes = [
    full,
    { width: 400, height: 300 },
    { width: 200, height: 20 },
  ]

  it('puts the settings bar above Offee without overlapping, at any size', () => {
    sizes.forEach((size) => {
      const layout = layoutViews(size, 'offee', true)
      expect(layout.settings).toEqual({ x: 0, y: 0, width: size.width, height: Math.min(toolbarHeight, size.height) })
      expect(layout.offee).not.toBeNull()
      expect(layout.offee?.y).toBe(layout.settings.height)
      expect((layout.offee?.y ?? 0) + (layout.offee?.height ?? 0)).toBe(size.height)
      expect(layout.offee?.width).toBe(size.width)
    })
  })

  it('gives the settings the whole window when they are chosen or Offee is not open', () => {
    expect(layoutViews(full, 'settings', true)).toEqual({ settings: { x: 0, y: 0, width: 1320, height: 880 }, offee: null })
    expect(layoutViews(full, 'offee', false)).toEqual({ settings: { x: 0, y: 0, width: 1320, height: 880 }, offee: null })
  })
})
