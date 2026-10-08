// Words too common to help find a passage, in the languages profiles most often use.
const stopWords = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one', 'our', 'out', 'has', 'have', 'this', 'that',
  'with', 'what', 'when', 'where', 'which', 'who', 'why', 'how', 'from', 'they', 'will', 'would', 'there', 'their', 'about', 'into',
  'der', 'die', 'das', 'und', 'ist', 'nicht', 'mit', 'ein', 'eine', 'den', 'dem', 'des', 'auf', 'für', 'wie', 'was', 'wer', 'sich',
  'che', 'per', 'con', 'non', 'una', 'del', 'della', 'gli', 'dei', 'come', 'cosa', 'sono', 'nel', 'alla', 'questo', 'quella',
  'les', 'des', 'une', 'pour', 'pas', 'que', 'qui', 'est', 'dans', 'sur', 'avec', 'por', 'los', 'las', 'para', 'como', 'qué',
])

/**
 * Turns a question into a full-text query that matches passages sharing any meaningful word,
 * quoting each word so punctuation in the question cannot change the query's syntax.
 * @param question The person's question or the text to find context for.
 * @returns The FTS5 query, or null when nothing in the question is worth searching for.
 */
export const buildSearchQuery = (question: string): string | null => {
  const words = [
    ...new Set(
      question
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((word) => word.length >= 3 && !stopWords.has(word)),
    ),
  ].slice(0, 30)
  return words.length === 0 ? null : words.map((word) => `"${word}"`).join(' OR ')
}
