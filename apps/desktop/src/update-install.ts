import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { digestMatches } from './updates.ts'
import type { ReleaseAsset } from './types.ts'

const runProgram = promisify(execFile)

/**
 * Asks GitHub for a release. Runs on the host, only when someone asks for an update; nothing
 * from the VM takes part.
 * @param tag The release tag.
 * @returns The response body, still to be parsed.
 */
export const fetchRelease = async (tag: string): Promise<unknown> => {
  const response = await fetch(`https://api.github.com/repos/cnotv/offee/releases/tags/${tag}`, {
    headers: { accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`GitHub answered ${response.status} for the ${tag} release`)
  return response.json()
}

/**
 * Downloads a release file and keeps it only when its SHA-256 matches GitHub's digest.
 * @param asset The file to download.
 * @param directory An empty directory for it.
 * @returns Where the verified file is.
 */
export const downloadVerified = async (asset: ReleaseAsset, directory: string): Promise<string> => {
  const response = await fetch(asset.url, { headers: { accept: 'application/octet-stream' }, signal: AbortSignal.timeout(15 * 60_000) })
  if (!response.ok) throw new Error(`The download answered ${response.status}; the release may be being replaced, so check again in a few minutes`)
  // ponytail: the whole file in memory (about 150 MB); stream it if the packages grow much larger.
  const bytes = Buffer.from(await response.arrayBuffer())
  if (!digestMatches(asset.digest, createHash('sha256').update(bytes).digest('hex'))) {
    throw new Error(`${asset.name} does not match the checksum GitHub gives for it; nothing was installed`)
  }
  const path = join(directory, asset.name)
  await writeFile(path, bytes)
  return path
}

/**
 * Deletes an app bundle, if there is one. Electron's fs reads an .asar archive as a folder, so
 * fs.rm never unlinks app.asar and then fails to remove Resources; rm sees the real file.
 * @param bundle The bundle's path.
 */
export const removeBundle = async (bundle: string): Promise<void> => {
  await runProgram('rm', ['-rf', bundle])
}

/**
 * Puts the app from a disk image in place of the running one. The new bundle is copied next to
 * the old one first, so swapping them is two renames in one folder, undone if the second fails.
 * @param diskImage The verified disk image.
 * @param workDirectory A directory to mount it in.
 * @param appBundle The running app's bundle.
 */
export const replaceMacApp = async (diskImage: string, workDirectory: string, appBundle: string): Promise<void> => {
  const mountPoint = join(workDirectory, 'mount')
  const staged = join(dirname(appBundle), '.Offee-update.app')
  const previous = join(dirname(appBundle), '.Offee-previous.app')
  await removeBundle(staged)
  await runProgram('hdiutil', ['attach', '-nobrowse', '-readonly', '-mountpoint', mountPoint, diskImage])
  try {
    await runProgram('ditto', [join(mountPoint, 'Offee.app'), staged])
  } finally {
    await runProgram('hdiutil', ['detach', mountPoint, '-force'])
  }
  await runProgram('codesign', ['--verify', '--deep', '--strict', staged])
  await removeBundle(previous)
  await rename(appBundle, previous)
  try {
    await rename(staged, appBundle)
  } catch (error) {
    await rename(previous, appBundle)
    throw error
  }
  await removeBundle(previous)
}

/**
 * Installs a Debian package over the running app. pkexec asks for the password in the
 * desktop's own dialog; the app never sees it.
 * @param packagePath The verified package.
 */
export const installDebianPackage = async (packagePath: string): Promise<void> => {
  await runProgram('pkexec', ['apt-get', 'install', '-y', packagePath])
}
