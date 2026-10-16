import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { addPlacedFields, readTextLines } from '../forms/flat-form.ts'
import { decryptPdf, readFormFields } from '../forms/pdf-form.ts'

// Development only, started by `bin/offee-dev forms`: runs every step Offee takes on a PDF before
// it asks a model, so a form that breaks the PDF code shows in seconds rather than after a release.

const pdfsIn = async (path: string): Promise<string[]> =>
  (await stat(path)).isDirectory()
    ? (await readdir(path)).filter((name) => name.toLowerCase().endsWith('.pdf')).map((name) => join(path, name))
    : [path]

const checkForm = async (path: string): Promise<string> => {
  const content = await decryptPdf(new Uint8Array(await readFile(path)))
  const fields = await readFormFields(content)
  if (fields.length > 0) return `${fields.length} fields`
  const lines = await readTextLines(content)
  const [firstLine] = lines
  if (firstLine === undefined) return 'no fields and no text: Offee finds no place to fill in'
  // One field placed by hand stands in for the model's placements, to try adding fields to this PDF.
  await readFormFields(await addPlacedFields(content, [{ line: firstLine.id, kind: 'text', position: 'below', name: '' }], lines))
  return `no fields, ${lines.length} text lines for the model to place fields on`
}

const paths = (await Promise.all(process.argv.slice(2).map(pdfsIn))).flat()
if (paths.length === 0) {
  console.error('Usage: bin/offee-dev forms <pdf or folder>...')
  process.exit(1)
}

// One at a time, so a folder of large PDFs is not all in memory at once.
const failures = await paths.reduce<Promise<number>>(async (failed, path) => {
  const failedSoFar = await failed
  try {
    console.log(`OK    ${path}: ${await checkForm(path)}`)
    return failedSoFar
  } catch (error) {
    console.log(`FAIL  ${path}: ${error instanceof Error ? error.message : String(error)}`)
    return failedSoFar + 1
  }
}, Promise.resolve(0))
console.log(`${paths.length - failures} of ${paths.length} PDFs passed`)
process.exitCode = failures === 0 ? 0 : 1
