import { mkdirSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { buildDirectory, lockDownElectron, packageApp, prepareBuildDirectory, renderAppIcon, runCommand } from './packaging.ts'

// Runs on macOS (CI's macOS runner): packages Offee.app for Apple Silicon, locks Electron
// down with fuses, signs it ad hoc and wraps it in a disk image. Run `pnpm build` first.

prepareBuildDirectory()

// The app icon from the web app's icon, at every size macOS asks for.
const iconset = join(buildDirectory, 'Offee.iconset')
mkdirSync(iconset)
const iconSource = renderAppIcon(1024, join(buildDirectory, 'icon-1024.png'))
const iconSizes = [16, 32, 128, 256, 512]
iconSizes.forEach((size) => {
  runCommand('sips', ['-z', String(size), String(size), iconSource, '--out', join(iconset, `icon_${size}x${size}.png`)])
  runCommand('sips', ['-z', String(size * 2), String(size * 2), iconSource, '--out', join(iconset, `icon_${size}x${size}@2x.png`)])
})
runCommand('iconutil', ['-c', 'icns', iconset, '-o', join(buildDirectory, 'Offee.icns')])

const appDirectory = await packageApp({
  platform: 'darwin',
  arch: 'arm64',
  icon: join(buildDirectory, 'Offee.icns'),
  appBundleId: 'dev.offee.app',
  appCategoryType: 'public.app-category.productivity',
})
const appBundle = join(appDirectory, 'Offee.app')

await lockDownElectron(appBundle)

// Apple Silicon runs only signed code; without a Developer ID the signature is ad hoc.
runCommand('codesign', ['--force', '--deep', '--sign', '-', appBundle])
runCommand('codesign', ['--verify', '--deep', '--strict', appBundle])

const staging = join(buildDirectory, 'dmg')
mkdirSync(staging)
runCommand('cp', ['-R', appBundle, staging])
symlinkSync('/Applications', join(staging, 'Applications'))
runCommand('hdiutil', ['create', '-volname', 'Offee', '-srcfolder', staging, '-ov', '-format', 'UDZO', join(buildDirectory, 'Offee-arm64.dmg')])

process.stdout.write(`desktop: ${join(buildDirectory, 'Offee-arm64.dmg')}\n`)
