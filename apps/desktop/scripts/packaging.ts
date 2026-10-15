import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { FuseV1Options, FuseVersion, flipFuses } from '@electron/fuses'
import { packager } from '@electron/packager'
import type { Options } from '@electron/packager'
import { Resvg } from '@resvg/resvg-js'

// What the Mac and Linux packages share: the launcher tree inside the app, the icon, the
// packager settings and the fuses.

export const desktopRoot = join(import.meta.dirname, '..')
export const repositoryRoot = join(desktopRoot, '..', '..')
export const buildDirectory = join(desktopRoot, 'build')
export const appIconSource = join(repositoryRoot, 'apps', 'web', 'public', 'favicon.svg')

/**
 * Runs a command with its output shown, and throws if it fails.
 * @param command The program.
 * @param args Its arguments.
 * @param cwd Where it runs.
 */
export const runCommand = (command: string, args: string[], cwd = buildDirectory): void => {
  execFileSync(command, args, { cwd, stdio: 'inherit' })
}

/**
 * Empties the build directory and puts everything `offee setup` needs into it, taken from the
 * committed tree.
 * @returns The directory that ships inside the app as its `offee` resource.
 */
export const prepareBuildDirectory = (): string => {
  rmSync(buildDirectory, { recursive: true, force: true })
  mkdirSync(buildDirectory, { recursive: true })
  const resources = join(buildDirectory, 'offee')
  mkdirSync(resources)
  runCommand('git', ['archive', '--format=tar', '-o', join(buildDirectory, 'offee.tar'), 'HEAD'], repositoryRoot)
  runCommand('tar', ['-xf', join(buildDirectory, 'offee.tar'), '-C', resources])
  return resources
}

/**
 * Renders the web app's icon as a square PNG.
 * @param size Width and height in pixels.
 * @param outputPath Where the PNG goes.
 * @returns The output path.
 */
export const renderAppIcon = (size: number, outputPath: string): string => {
  writeFileSync(outputPath, new Resvg(readFileSync(appIconSource), { fitTo: { mode: 'width', value: size } }).render().asPng())
  return outputPath
}

/**
 * Packages the built app for one platform.
 * @param options The platform settings on top of the shared ones.
 * @returns The directory that holds the packaged app.
 */
export const packageApp = async (options: Partial<Options> & Pick<Options, 'platform' | 'arch'>): Promise<string> => {
  const [appDirectory] = await packager({
    dir: desktopRoot,
    name: 'Offee',
    out: join(buildDirectory, 'out'),
    overwrite: true,
    asar: true,
    // Main and preload are bundled, so no node_modules ship.
    prune: false,
    ignore: [/^\/(src|control|scripts|assets|build|node_modules)(\/|$)/, /^\/tsconfig\.json$/],
    extraResource: [join(buildDirectory, 'offee')],
    ...options,
  })
  if (appDirectory === undefined) throw new Error('Packaging produced nothing')
  return appDirectory
}

/**
 * Turns off what the app never needs, so it cannot be used as a general Node runtime.
 * @param appPath The .app bundle on macOS, the executable on Linux.
 */
export const lockDownElectron = async (appPath: string): Promise<void> => {
  await flipFuses(appPath, {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: process.platform === 'darwin',
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
  })
}
