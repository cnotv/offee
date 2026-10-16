import { spawnSync } from 'node:child_process'
import { mkdirSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { sign as signApp } from '@electron/osx-sign'
import { z } from 'zod'
import { buildDirectory, lockDownElectron, packageApp, prepareBuildDirectory, renderAppIcon, runCommand } from './packaging.ts'

// Runs on macOS (CI's macOS runner): packages Offee.app for Apple Silicon, locks Electron
// down with fuses, signs it and wraps it in a disk image. Run `pnpm build` first.
// With a Developer ID Application certificate in the keychain named by OFFEE_SIGN_KEYCHAIN, the
// app is signed with the hardened runtime and the disk image is notarized and stapled, so macOS
// opens it without a warning. Without one (forks, local builds) the signature is ad hoc.

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

const signingKeychain = process.env.OFFEE_SIGN_KEYCHAIN
const developerIdentity = 'Developer ID Application'

// Apple Silicon runs only signed code; without a Developer ID the signature is ad hoc.
if (signingKeychain === undefined) runCommand('codesign', ['--force', '--deep', '--sign', '-', appBundle])
else
  await signApp({
    app: appBundle,
    platform: 'darwin',
    keychain: signingKeychain,
    identity: developerIdentity,
    // Chromium's helpers keep the entitlements osx-sign gives them. The app itself needs only JIT
    // for V8, not the camera, microphone, location and photos osx-sign grants by default.
    optionsForFile: (filePath) =>
      filePath.includes(').app') ? {} : { hardenedRuntime: true, entitlements: ['com.apple.security.cs.allow-jit'] },
  })
runCommand('codesign', ['--verify', '--deep', '--strict', appBundle])

const staging = join(buildDirectory, 'dmg')
mkdirSync(staging)
runCommand('cp', ['-R', appBundle, staging])
symlinkSync('/Applications', join(staging, 'Applications'))
const diskImage = join(buildDirectory, 'Offee-arm64.dmg')
runCommand('hdiutil', ['create', '-volname', 'Offee', '-srcfolder', staging, '-ov', '-format', 'UDZO', diskImage])

// Notarizing the disk image covers the app inside it; the stapled ticket lets the first launch
// pass Gatekeeper even offline.
if (signingKeychain !== undefined) {
  const notary = z
    .object({ APPLE_ID: z.string().min(1), APPLE_APP_SPECIFIC_PASSWORD: z.string().min(1), APPLE_TEAM_ID: z.string().min(1) })
    .parse(process.env)
  const credentials = ['--apple-id', notary.APPLE_ID, '--password', notary.APPLE_APP_SPECIFIC_PASSWORD, '--team-id', notary.APPLE_TEAM_ID]
  runCommand('codesign', ['--sign', developerIdentity, '--keychain', signingKeychain, '--timestamp', diskImage])
  // Read whatever the submission printed, even when it exits with an error, to fetch Apple's log.
  const submitted = spawnSync('xcrun', ['notarytool', 'submit', diskImage, ...credentials, '--wait', '--output-format', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  const submission = z.object({ id: z.string(), status: z.string() }).parse(JSON.parse(submitted.stdout))
  if (submission.status !== 'Accepted') {
    runCommand('xcrun', ['notarytool', 'log', submission.id, ...credentials])
    throw new Error(`Notarization ${submission.id} ended ${submission.status}`)
  }
  runCommand('xcrun', ['stapler', 'staple', diskImage])
  runCommand('spctl', ['--assess', '--type', 'open', '--context', 'context:primary-signature', '--verbose', diskImage])
}

process.stdout.write(`desktop: ${diskImage}\n`)
