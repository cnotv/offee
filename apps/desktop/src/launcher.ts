import { spawn } from 'node:child_process'
import { pathWithHomebrew, progressAsLines } from './window-policy.ts'
import type { LauncherResult } from './types.ts'

export type LauncherOptions = {
  launcherPath: string
  onOutput?: (text: string) => void
  stdin?: string
  signal?: AbortSignal
}

const stopProcessGroup = (pid: number | undefined): void => {
  if (pid === undefined) return
  try {
    process.kill(-pid, 'SIGTERM')
  } catch {
    // The launcher has already finished.
  }
}

/**
 * Runs `bin/offee` with the arguments given. Values reach it through its environment and
 * standard input only, never its arguments, so a key never shows in a process listing.
 * @param args The launcher command and its arguments.
 * @param options Where the launcher is, where its output goes, what to send on stdin, and a
 * signal that stops it.
 * @returns The exit code and everything it printed.
 */
export const runLauncher = (args: string[], options: LauncherOptions): Promise<LauncherResult> =>
  new Promise((resolve) => {
    const child = spawn(options.launcherPath, args, {
      env: { ...process.env, PATH: pathWithHomebrew(process.env.PATH), OFFEE_YES: '1', OFFEE_NO_BROWSER: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
      // Its own process group, so stopping it also stops the docker and sleep commands it runs.
      detached: true,
    })
    options.signal?.addEventListener('abort', () => stopProcessGroup(child.pid), { once: true })
    const chunks: string[] = []
    const collect = (data: Buffer) => {
      const text = progressAsLines(data.toString('utf8'))
      chunks.push(text)
      options.onOutput?.(text)
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.on('error', (error) => {
      collect(Buffer.from(`${error.message}\n`))
      resolve({ exitCode: 1, output: chunks.join('') })
    })
    child.on('close', (code) => resolve({ exitCode: code ?? 1, output: chunks.join('') }))
    // A launcher that exits before reading its input closes the pipe; that is not an error
    // worth stopping the app for.
    child.stdin.on('error', () => undefined)
    child.stdin.end(options.stdin ?? '')
  })
