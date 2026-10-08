import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'

const headingLevels = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3] as const

const paragraphFor = (line: string): Paragraph => {
  const heading = /^(#{1,3})\s+(.*)$/.exec(line)
  if (heading !== null) {
    const level = headingLevels[(heading[1]?.length ?? 1) - 1] ?? HeadingLevel.HEADING_3
    return new Paragraph({ heading: level, children: [new TextRun(heading[2] ?? '')] })
  }
  const bullet = /^\s*[-*]\s+(.*)$/.exec(line)
  if (bullet !== null) return new Paragraph({ bullet: { level: 0 }, children: [new TextRun(bullet[1] ?? '')] })
  return new Paragraph({ children: [new TextRun(line.replace(/\*\*(.*?)\*\*/g, '$1'))] })
}

/**
 * Turns plain or Markdown-ish text into a Word document: `#` lines become headings, `-` lines
 * bullets, everything else a paragraph.
 * @param title The document's title, its first heading.
 * @param text The body.
 * @returns The DOCX file.
 */
export const textToDocx = async (title: string, text: string): Promise<Uint8Array> => {
  const document = new Document({
    creator: 'Offee',
    title,
    sections: [
      {
        children: [
          new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(title)] }),
          ...text
            .split('\n')
            .filter((line, index, lines) => line.trim() !== '' || (lines[index - 1] ?? '').trim() !== '')
            .map(paragraphFor),
        ],
      },
    ],
  })
  return new Uint8Array(await Packer.toBuffer(document))
}
