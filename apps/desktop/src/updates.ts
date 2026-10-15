import { z } from 'zod'
import type { AppPhase, AvailableUpdate, InstallKind, Release } from './types.ts'

const repository = 'cnotv/offee'
// The API's asset address, not the public download link: after the rolling release is
// recreated, the public link can redirect to the deleted file for a while.
const downloadPrefix = `https://api.github.com/repos/${repository}/releases/assets/`

/** Where the Mac app runs from when it was dragged to Applications as the release notes say. */
export const macAppBundle = '/Applications/Offee.app'

const releaseSchema = z.object({
  target_commitish: z.string().min(1),
  assets: z.array(
    z.object({
      name: z.string(),
      url: z.string(),
      digest: z.string().nullable().optional(),
    }),
  ),
})

/**
 * Reads GitHub's answer for a release, keeping only what an update needs.
 * @param value The parsed JSON body.
 * @returns The release, or null when it is not one.
 */
export const parseRelease = (value: unknown): Release | null => {
  const parsed = releaseSchema.safeParse(value)
  if (!parsed.success) return null
  return {
    commit: parsed.data.target_commitish,
    assets: parsed.data.assets.map((asset) => ({ name: asset.name, url: asset.url, digest: asset.digest ?? null })),
  }
}

/**
 * The rolling pre-release that carries this platform's build.
 * @param platform `process.platform`.
 * @returns The release tag, or null where no build is published.
 */
export const releaseTagFor = (platform: string): string | null => {
  if (platform === 'darwin') return 'mac-preview'
  if (platform === 'linux') return 'linux-preview'
  return null
}

/**
 * The release's page, for updates the app cannot install itself.
 * @param tag The release tag.
 * @returns Its URL on GitHub.
 */
export const releasePageFor = (tag: string): string => `https://github.com/${repository}/releases/tag/${tag}`

/**
 * Decides how to update from where the app runs.
 * @param where Whether the app is packaged, the platform, its executable, and whether
 * `/Applications` is writable by this user.
 * @returns How an update is installed.
 */
export const installKindFor = (where: { packaged: boolean; platform: string; execPath: string; applicationsWritable: boolean }): InstallKind => {
  if (!where.packaged) return 'source'
  if (where.platform === 'darwin') {
    return where.execPath === `${macAppBundle}/Contents/MacOS/Offee` && where.applicationsWritable ? 'replace-app' : 'open-disk-image'
  }
  if (where.platform === 'linux') return where.execPath.startsWith('/opt/Offee/') ? 'deb' : 'release-page'
  return 'source'
}

/**
 * The release file built for this computer, named as the packaging workflows name it.
 * @param platform `process.platform`.
 * @param arch `process.arch`.
 * @param kind How the app was installed.
 * @returns The file name.
 */
export const assetNameFor = (platform: string, arch: string, kind: InstallKind): string => {
  if (platform === 'darwin') return `Offee-${arch}.dmg`
  return kind === 'deb' ? `Offee-linux-${arch}.deb` : `Offee-linux-${arch}.tar.gz`
}

const sha256Digest = /^sha256:[0-9a-f]{64}$/

/**
 * Compares the running build with the release. The publishing workflow never moves a release
 * back to an older commit, so any other commit is newer.
 * @param buildCommit The commit this app was built from.
 * @param release The release GitHub reports.
 * @param assetName The file this computer needs.
 * @returns The update, or null when this is the newest build. The asset is null when it cannot
 * be downloaded safely: missing, without a SHA-256, or hosted outside the project's releases.
 */
export const updateFor = (buildCommit: string, release: Release, assetName: string): AvailableUpdate | null => {
  if (release.commit === buildCommit) return null
  const asset = release.assets.find((candidate) => candidate.name === assetName)
  const digest = asset?.digest ?? null
  const safe = asset !== undefined && asset.url.startsWith(downloadPrefix) && digest !== null && sha256Digest.test(digest)
  return { commit: release.commit, asset: safe ? { name: asset.name, url: asset.url, digest } : null }
}

/**
 * Whether a download is the file GitHub described.
 * @param expected The asset's digest, `sha256:<hex>`.
 * @param actualHex The SHA-256 of the downloaded bytes, in hex.
 * @returns True when they match.
 */
export const digestMatches = (expected: string, actualHex: string): boolean => expected === `sha256:${actualHex}`

/**
 * The launcher command that brings Offee up. A new app carries a new launcher and compose
 * files, so the images are rebuilt once, the first time it starts.
 * @param builtCommit The commit the images were last built from, or null when unknown.
 * @param buildCommit The commit this app was built from.
 * @param packaged Whether this is a packaged app; from source, `offee update` is run by hand.
 * @returns `update` or `start`.
 */
export const startCommandFor = (builtCommit: string | null, buildCommit: string, packaged: boolean): 'update' | 'start' =>
  packaged && builtCommit !== buildCommit ? 'update' : 'start'

/**
 * Whether quitting the app stops the VM. A VM that was never created or is already stopped is
 * left alone, and so is one the app quits only to restart into an update: the new app's
 * `offee update` takes it over, and a stop running alongside would take it down under it.
 * @param phase What the app was doing when it quit.
 * @param restartingForUpdate Whether the app quits to relaunch into a newly installed version.
 * @returns True when the VM should stop.
 */
export const stopsVmOnQuit = (phase: AppPhase, restartingForUpdate: boolean): boolean =>
  !restartingForUpdate && phase !== 'needs-setup' && phase !== 'stopped'
