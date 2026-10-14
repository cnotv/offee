/** Where the Offee window's session sends everything that is not loopback: nowhere. */
export const unreachableProxy = 'http://0.0.0.0:1'

export const offeeOrigin = 'http://127.0.0.1:8470'

/**
 * Whether the Offee window may go to a URL: only pages of the app inside the VM.
 * @param url Where a page wants to navigate.
 * @returns True for the app's own origin.
 */
export const isOffeeUrl = (url: string): boolean => {
  try {
    return new URL(url).origin === offeeOrigin
  } catch {
    return false
  }
}

/**
 * Whether the Offee window may load a URL at all. The page comes from inside the VM but runs
 * on the Mac, which has a network: without this, a compromised app could send data out with a
 * plain fetch or image request, around the gateway. Its own CSP cannot be trusted for this,
 * since the same app serves it.
 * @param url The URL of any request the page makes.
 * @returns True only for the app's own origin and in-page data.
 */
export const isAllowedRequestUrl = (url: string): boolean =>
  isOffeeUrl(url) || url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('devtools:')

/**
 * Which browser permissions a page may use. The Offee page needs only to copy text; the
 * control window needs none.
 * @param permission The permission Electron asks about.
 * @returns True when granted.
 */
export const isPermissionAllowed = (permission: string): boolean => permission === 'clipboard-sanitized-write'

/**
 * GUI apps on macOS start without the shell's PATH, so Homebrew's tools would not be found.
 * @param currentPath The PATH the app was started with.
 * @returns A PATH that also reaches Homebrew on Apple Silicon and Intel.
 */
export const pathWithHomebrew = (currentPath: string | undefined): string =>
  [...new Set(['/opt/homebrew/bin', '/usr/local/bin', ...(currentPath ?? '/usr/bin:/bin:/usr/sbin:/sbin').split(':')])]
    .filter((entry) => entry !== '')
    .join(':')

/**
 * Turns progress lines that redraw in place into separate lines for a log view.
 * @param text The raw output; the launcher prints no colour codes when not on a terminal.
 * @returns Text with every carriage return made a line break.
 */
export const progressAsLines = (text: string): string => text.replace(/\r(?!\n)/g, '\n')
