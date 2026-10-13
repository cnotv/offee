import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { FuseV1Options, FuseVersion, flipFuses } from '@electron/fuses'
import { packager } from '@electron/packager'
import { Resvg } from '@resvg/resvg-js'

// Runs on macOS (CI's macOS runner): packages Offee.app for Apple Silicon, locks Electron
// down with fuses, signs it ad hoc and wraps it in a disk image. Run `pnpm build` first.

const root = join(import.meta.dirname, '..')
const repository = join(root, '..', '..')
const build = join(root, 'build')
const run = (command: string, args: string[], cwd = build) => execFileSync(command, args, { cwd, stdio: 'inherit' })

rmSync(build, { recursive: true, force: true })
mkdirSync(build, { recursive: true })

// Everything `offee setup` needs travels inside the app, taken from the committed tree.
const resources = join(build, 'offee')
mkdirSync(resources)
run('git', ['archive', '--format=tar', '-o', join(build, 'offee.tar'), 'HEAD'], repository)
run('tar', ['-xf', join(build, 'offee.tar'), '-C', resources])

// The app icon from the web app's icon, at every size macOS asks for.
const iconset = join(build, 'Offee.iconset')
mkdirSync(iconset)
const iconSource = join(build, 'icon-1024.png')
writeFileSync(
  iconSource,
  new Resvg(readFileSync(join(repository, 'apps', 'web', 'public', 'favicon.svg')), { fitTo: { mode: 'width', value: 1024 } }).render().asPng(),
)
const iconSizes = [16, 32, 128, 256, 512]
iconSizes.forEach((size) => {
  run('sips', ['-z', String(size), String(size), iconSource, '--out', join(iconset, `icon_${size}x${size}.png`)])
  run('sips', ['-z', String(size * 2), String(size * 2), iconSource, '--out', join(iconset, `icon_${size}x${size}@2x.png`)])
})
run('iconutil', ['-c', 'icns', iconset, '-o', join(build, 'Offee.icns')])

const [appDirectory] = await packager({
  dir: root,
  name: 'Offee',
  platform: 'darwin',
  arch: 'arm64',
  out: join(build, 'out'),
  overwrite: true,
  asar: true,
  // Main and preload are bundled, so no node_modules ship.
  prune: false,
  ignore: [/^\/(src|control|scripts|assets|build|node_modules)(\/|$)/, /^\/tsconfig\.json$/],
  icon: join(build, 'Offee.icns'),
  extraResource: [resources],
  appBundleId: 'dev.offee.app',
  appCategoryType: 'public.app-category.productivity',
})
if (appDirectory === undefined) throw new Error('Packaging produced nothing')
const appBundle = join(appDirectory, 'Offee.app')

// Turn off what the app never needs, so Offee.app cannot be used as a general Node runtime.
await flipFuses(appBundle, {
  version: FuseVersion.V1,
  resetAdHocDarwinSignature: true,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
})

// Apple Silicon runs only signed code; without a Developer ID the signature is ad hoc.
run('codesign', ['--force', '--deep', '--sign', '-', appBundle])
run('codesign', ['--verify', '--deep', '--strict', appBundle])

const staging = join(build, 'dmg')
mkdirSync(staging)
run('cp', ['-R', appBundle, staging])
symlinkSync('/Applications', join(staging, 'Applications'))
run('hdiutil', ['create', '-volname', 'Offee', '-srcfolder', staging, '-ov', '-format', 'UDZO', join(build, 'Offee-arm64.dmg')])

process.stdout.write(`desktop: ${join(build, 'Offee-arm64.dmg')}\n`)
