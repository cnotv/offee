import { execFile } from 'node:child_process'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { inSequence } from '../workflows/in-sequence.ts'

export type ReadScan = (kind: 'pdf' | 'image', content: Uint8Array, signal: AbortSignal) => Promise<string>

const run = promisify(execFile)

// Tesseract tries these together on every page, so a German form with English notes reads well.
const ocrLanguages = 'eng+deu+ita'
const pageResolution = '300'
const largestOutput = 50 * 1024 * 1024

const recognise = async (imagePath: string, signal: AbortSignal): Promise<string> =>
  (await run('tesseract', [imagePath, 'stdout', '-l', ocrLanguages], { maxBuffer: largestOutput, signal })).stdout.trim()

/**
 * Reads the text of a scan with Tesseract, inside the app container: a PDF is turned into page
 * images by pdftoppm first. Both programs come with the image; nothing is downloaded.
 * @param kind Whether the scan is a PDF or a single image.
 * @param content The file's bytes.
 * @param signal Stops the OCR programs when the person stops the operation.
 * @returns The text, pages separated by a blank line.
 */
export const readScanWithTesseract: ReadScan = async (kind, content, signal) => {
  const directory = await mkdtemp(join(tmpdir(), 'offee-ocr-'))
  try {
    const input = join(directory, kind === 'pdf' ? 'scan.pdf' : 'scan')
    await writeFile(input, content)
    if (kind === 'image') return await recognise(input, signal)
    await run('pdftoppm', ['-r', pageResolution, '-png', input, join(directory, 'page')], { signal })
    // pdftoppm pads page numbers to the same width, so name order is page order.
    const pages = (await readdir(directory)).filter((name) => name.startsWith('page-')).toSorted()
    const texts = await inSequence(pages, (page) => recognise(join(directory, page), signal))
    return texts.join('\n\n')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
