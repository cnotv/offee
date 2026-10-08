/**
 * Splits text into passages of roughly the given size, breaking between paragraphs where it
 * can and inside a paragraph only when one is longer than a passage.
 * @param text The document's text.
 * @param targetLength The longest passage, in characters.
 * @returns The passages, in order, none empty.
 */
export const chunkText = (text: string, targetLength = 1200): string[] => {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/[ \t]+/g, ' ').trim())
    .filter((paragraph) => paragraph.length > 0)
    .flatMap((paragraph) => splitLongParagraph(paragraph, targetLength))

  return paragraphs.reduce<string[]>((passages, paragraph) => {
    const last = passages.at(-1)
    if (last !== undefined && last.length + paragraph.length + 2 <= targetLength) {
      return [...passages.slice(0, -1), `${last}\n\n${paragraph}`]
    }
    return [...passages, paragraph]
  }, [])
}

const splitLongParagraph = (paragraph: string, targetLength: number): string[] => {
  if (paragraph.length <= targetLength) return [paragraph]
  const sentences = paragraph.match(/[^.!?]+[.!?]*\s*/g) ?? [paragraph]
  return sentences
    .flatMap((sentence) =>
      sentence.length <= targetLength
        ? [sentence]
        : Array.from({ length: Math.ceil(sentence.length / targetLength) }, (_, index) =>
            sentence.slice(index * targetLength, (index + 1) * targetLength),
          ),
    )
    .reduce<string[]>((pieces, sentence) => {
      const last = pieces.at(-1)
      if (last !== undefined && last.length + sentence.length <= targetLength) return [...pieces.slice(0, -1), last + sentence]
      return [...pieces, sentence]
    }, [])
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0)
}
