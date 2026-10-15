import { chmodSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { appIconSource, buildDirectory, desktopRoot, lockDownElectron, packageApp, prepareBuildDirectory, renderAppIcon, runCommand } from './packaging.ts'

// Runs on Linux (CI's Ubuntu runners): packages Offee for the runner's architecture, locks
// Electron down with fuses, and wraps it as a .deb and a .tar.gz. Run `pnpm build` first.

const debianArchitectures = { x64: 'amd64', arm64: 'arm64' } as const
const arch = z.enum(['x64', 'arm64']).parse(process.arch)
const { version } = z.object({ version: z.string() }).parse(JSON.parse(readFileSync(join(desktopRoot, 'package.json'), 'utf8')))
const executableName = 'offee'
const installDirectory = '/opt/Offee'

prepareBuildDirectory()

const appDirectory = await packageApp({ platform: 'linux', arch, executableName })
await lockDownElectron(join(appDirectory, executableName))

const tarball = join(buildDirectory, `Offee-linux-${arch}.tar.gz`)
runCommand('tar', ['-czf', tarball, '-C', join(appDirectory, '..'), `Offee-linux-${arch}`])

const staging = join(buildDirectory, 'deb')
const stagedApp = join(staging, installDirectory)
mkdirSync(join(staging, 'DEBIAN'), { recursive: true })
mkdirSync(join(staging, 'opt'), { recursive: true })
runCommand('cp', ['-R', appDirectory, stagedApp])
// Chromium's sandbox needs this helper setuid root wherever unprivileged user namespaces are
// turned off, as on Ubuntu 24.04. The app keeps its sandbox rather than running without one.
chmodSync(join(stagedApp, 'chrome-sandbox'), 0o4755)

const applications = join(staging, 'usr', 'share', 'applications')
const pngIcons = join(staging, 'usr', 'share', 'icons', 'hicolor', '512x512', 'apps')
const svgIcons = join(staging, 'usr', 'share', 'icons', 'hicolor', 'scalable', 'apps')
const desktopDirectories = [applications, pngIcons, svgIcons]
desktopDirectories.forEach((directory) => mkdirSync(directory, { recursive: true }))
renderAppIcon(512, join(pngIcons, 'offee.png'))
copyFileSync(appIconSource, join(svgIcons, 'offee.svg'))

writeFileSync(
  join(applications, 'offee.desktop'),
  [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Offee',
    'Comment=An office assistant that runs on your own machine, sealed off from it',
    `Exec=${installDirectory}/${executableName}`,
    'Icon=offee',
    'Terminal=false',
    'Categories=Office;',
    'StartupWMClass=Offee',
    '',
  ].join('\n'),
)

// What Electron's Chromium loads; on Ubuntu 24.04 the t64 packages provide these names.
const runtimeLibraries = ['libgtk-3-0', 'libnss3', 'libgbm1', 'libasound2', 'libxss1', 'libxtst6', 'libatspi2.0-0', 'libsecret-1-0', 'xdg-utils']
writeFileSync(
  join(staging, 'DEBIAN', 'control'),
  [
    'Package: offee',
    `Version: ${version}`,
    `Architecture: ${debianArchitectures[arch]}`,
    'Maintainer: cnotv <cnotv@users.noreply.github.com>',
    'Section: office',
    'Priority: optional',
    'Homepage: https://github.com/cnotv/offee',
    `Depends: ${runtimeLibraries.join(', ')}`,
    'Description: Office assistant sealed off from the machine it runs on',
    ' Offee keeps the profiles you act as, the personas that do the work and the documents',
    ' each one may use, and runs office workflows on local models inside a Colima VM.',
    '',
  ].join('\n'),
)

const debianPackage = join(buildDirectory, `Offee-linux-${arch}.deb`)
runCommand('dpkg-deb', ['--root-owner-group', '--build', staging, debianPackage])

process.stdout.write(`desktop: ${tarball}\ndesktop: ${debianPackage}\n`)
