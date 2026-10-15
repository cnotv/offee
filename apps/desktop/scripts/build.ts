import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Resvg } from '@resvg/resvg-js'
import { build as bundle } from 'esbuild'
import { build as buildPage } from 'vite'
import { appIconSource } from './packaging.ts'

// Main and preload are bundled with their dependencies, so the packaged app needs no
// node_modules. The settings page is built by Vite like the web app.

const root = join(import.meta.dirname, '..')
const dist = join(root, 'dist')

await bundle({
  entryPoints: [join(root, 'src', 'main.ts')],
  outfile: join(dist, 'main.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['electron'],
})

// A sandboxed preload must be a single CommonJS file, whatever the source is written as.
await bundle({
  entryPoints: [join(root, 'src', 'preload.ts')],
  outfile: join(dist, 'preload.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
})

await buildPage({ configFile: join(root, 'control', 'vite.config.ts'), logLevel: 'warn' })

// The menu bar icon, as a macOS template image at 1x and 2x.
const traySvg = readFileSync(join(root, 'assets', 'tray.svg'))
mkdirSync(join(dist, 'assets'), { recursive: true })
const renderTray = (size: number, fileName: string) =>
  writeFileSync(join(dist, 'assets', fileName), new Resvg(traySvg, { fitTo: { mode: 'width', value: size } }).render().asPng())
renderTray(18, 'trayTemplate.png')
renderTray(36, 'trayTemplate@2x.png')
// Linux panels take a coloured icon, the app's own.
writeFileSync(
  join(dist, 'assets', 'tray.png'),
  new Resvg(readFileSync(appIconSource), { fitTo: { mode: 'width', value: 32 } }).render().asPng(),
)

process.stdout.write('desktop: built into dist/\n')
