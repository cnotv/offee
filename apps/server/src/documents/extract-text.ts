import mammoth from 'mammoth'
import PostalMime from 'postal-mime'
import { extractText as extractPdfText, getDocumentProxy } from 'unpdf'
import type { ReadScan } from './read-scan.ts'
import { readScanWithTesseract } from './read-scan.ts'

export type ExtractedText = {
  text: string
  mimeType: string
}

const docxMimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/**
 * Works out a file's kind from its name when the browser sent a generic type.
 * @param fileName The uploaded file's name.
 * @param declaredType The type the browser declared.
 * @returns The type to treat the file as.
 */
export const resolveMimeType = (fileName: string, declaredType: string): string => {
  const extension = fileName.toLowerCase().split('.').at(-1) ?? ''
  const byExtension: Record<string, string> = {
    pdf: 'application/pdf',
    docx: docxMimeType,
    eml: 'message/rfc822',
    mbox: 'application/mbox',
    md: 'text/markdown',
    txt: 'text/plain',
    csv: 'text/csv',
    json: 'application/json',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    tif: 'image/tiff',
    tiff: 'image/tiff',
  }
  return byExtension[extension] ?? (declaredType === '' ? 'application/octet-stream' : declaredType)
}

const describeAddress = (address: { name?: string; address?: string } | undefined): string =>
  address === undefined ? '' : [address.name, address.address === undefined ? undefined : `<${address.address}>`].filter(Boolean).join(' ')

const extractEmail = async (content: Uint8Array): Promise<string> => {
  const email = await PostalMime.parse(content)
  const header = [
    `From: ${describeAddress(email.from)}`,
    `To: ${(email.to ?? []).map(describeAddress).join(', ')}`,
    `Date: ${email.date ?? ''}`,
    `Subject: ${email.subject ?? ''}`,
  ].join('\n')
  return `${header}\n\n${(email.text ?? '').trim()}`
}

const scannedImageTypes = new Set(['image/png', 'image/jpeg', 'image/tiff'])

/**
 * Reads the text out of an uploaded file. PDF, DOCX and email are parsed, a scanned PDF and a
 * photo of a page are read with OCR; anything else must be text.
 * @param fileName The file's name.
 * @param declaredType The type the browser declared.
 * @param content The file's bytes.
 * @param readScan Reads a scan's text; Tesseract unless a test replaces it.
 * @returns The text and the type it was read as; throws for a kind it cannot read.
 */
export const extractText = async (
  fileName: string,
  declaredType: string,
  content: Uint8Array,
  readScan: ReadScan = readScanWithTesseract,
): Promise<ExtractedText> => {
  const mimeType = resolveMimeType(fileName, declaredType)
  if (mimeType === 'application/pdf') {
    const pdf = await getDocumentProxy(new Uint8Array(content))
    const { text } = await extractPdfText(pdf, { mergePages: true })
    // A scan is pictures of pages with no text layer.
    if (text.trim() !== '') return { text: text.trim(), mimeType }
    return { text: (await readScan('pdf', content)).trim(), mimeType }
  }
  if (scannedImageTypes.has(mimeType)) return { text: (await readScan('image', content)).trim(), mimeType }
  if (mimeType === docxMimeType) {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(content) })
    return { text: value.trim(), mimeType }
  }
  if (mimeType === 'message/rfc822') return { text: await extractEmail(content), mimeType }
  if (mimeType.startsWith('text/') || mimeType === 'application/json' || mimeType === 'application/mbox') {
    return { text: new TextDecoder().decode(content).trim(), mimeType }
  }
  throw new Error(`Offee cannot read ${fileName} yet: use PDF, DOCX, EML, a photo or scan (PNG, JPEG, TIFF), or a text file`)
}
