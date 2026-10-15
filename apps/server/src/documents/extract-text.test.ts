import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import type { ReadScan } from './read-scan.ts'
import { extractText } from './extract-text.ts'

const pdfWith = async (text: string | null): Promise<Uint8Array> => {
  const document = await PDFDocument.create()
  const page = document.addPage([600, 400])
  if (text !== null) page.drawText(text, { x: 50, y: 300 })
  return document.save()
}

const recordingScanReader = () => {
  const calls: string[] = []
  const readScan: ReadScan = async (kind) => {
    calls.push(kind)
    return '  Text read from the scan  '
  }
  return { calls, readScan }
}

describe('reading text out of uploads', () => {
  it('reads a PDF with a text layer without OCR', async () => {
    const { calls, readScan } = recordingScanReader()
    const extracted = await extractText('letter.pdf', 'application/pdf', await pdfWith('Dear Ms Weber'), readScan)
    expect(extracted.text).toBe('Dear Ms Weber')
    expect(calls).toEqual([])
  })

  it('reads a scanned PDF, which has no text layer, with OCR', async () => {
    const { calls, readScan } = recordingScanReader()
    const extracted = await extractText('scan.pdf', 'application/pdf', await pdfWith(null), readScan)
    expect(extracted).toEqual({ text: 'Text read from the scan', mimeType: 'application/pdf' })
    expect(calls).toEqual(['pdf'])
  })

  it('reads a photo of a document with OCR', async () => {
    const { calls, readScan } = recordingScanReader()
    const extracted = await extractText('id-card.JPG', '', new Uint8Array([1, 2, 3]), readScan)
    expect(extracted).toEqual({ text: 'Text read from the scan', mimeType: 'image/jpeg' })
    expect(calls).toEqual(['image'])
  })
})
