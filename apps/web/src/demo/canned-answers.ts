import type { Profile, ReviewTemplate } from '@offee/contracts'
import type { ChatAnswer, DemoDocument } from '@/lib/types'

// Words this short or this common match nearly every sentence, so they say nothing about relevance.
const shortestUsefulWordLength = 4
const commonWords = new Set(['what', 'when', 'where', 'which', 'does', 'have', 'this', 'that', 'with', 'from', 'there', 'about', 'they', 'your'])

// A trailing s is dropped so "close" finds "closes" and "Friday" finds "Fridays".
const meaningfulWords = (text: string): string[] =>
  (text.toLowerCase().match(/\p{L}+/gu) ?? [])
    .filter((word) => word.length >= shortestUsefulWordLength && !commonWords.has(word))
    .map((word) => word.replace(/s$/, ''))

const sentencesOf = (text: string): string[] =>
  text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== '')

type ScoredSentence = { document: DemoDocument; sentence: string; score: number }

const scoreSentence = (questionWords: string[], document: DemoDocument, sentence: string): ScoredSentence => {
  const sentenceWords = new Set(meaningfulWords(sentence))
  return { document, sentence, score: questionWords.filter((word) => sentenceWords.has(word)).length }
}

/**
 * Demo mode's stand-in for the model: the sentence of the documents that shares the most words
 * with the question, cited, or a plain statement that the documents do not say.
 * @param question What was asked.
 * @param documents The documents the chosen profile and persona may use.
 * @returns The answer and the document it came from.
 */
export const answerFromDocuments = (question: string, documents: DemoDocument[]): ChatAnswer => {
  const questionWords = meaningfulWords(question)
  const best = documents
    .flatMap((document) => sentencesOf(document.text).map((sentence) => scoreSentence(questionWords, document, sentence)))
    .reduce<ScoredSentence | null>((leader, candidate) => (candidate.score > (leader?.score ?? 0) ? candidate : leader), null)
  if (best === null) {
    return { text: 'The documents you can use here do not say. In demo mode answers come from the sample documents only.', citations: [] }
  }
  return {
    text: `${best.sentence} [1]`,
    citations: [{ documentId: best.document.id, documentTitle: best.document.title, excerpt: best.sentence }],
  }
}

/**
 * Demo mode's draft reply: a short, polite answer signed with the profile's first name.
 * @param guidance What the reply should say, if anything was given.
 * @param profile The profile replying, if one is chosen.
 * @returns The draft.
 */
export const draftReply = (guidance: string, profile: Profile | undefined): string => {
  const middle = guidance.trim() === '' ? 'I will look into it and come back to you by the end of the week.' : guidance.trim()
  const signature = profile === undefined ? '' : `\n${profile.firstName}`
  return `Hello,\n\nThank you for your message. ${middle}\n\nBest regards,${signature}`
}

/**
 * Demo mode cannot translate, so it says so and keeps the text, rather than inventing a translation.
 * @param text The text to translate.
 * @param targetLanguage The language asked for.
 * @returns The note and the original text.
 */
export const describeDemoTranslation = (text: string, targetLanguage: string): string =>
  `Demo mode has no model, so the text below is unchanged. On your machine the local model translates it into ${targetLanguage}.\n\n${text}`

/**
 * Demo mode's review: each of the template's sections in turn takes the next sentence of the source.
 * @param source The notes or transcript to review.
 * @param template The review's sections.
 * @returns The review in Markdown.
 */
export const reviewFromSentences = (source: string, template: ReviewTemplate): string => {
  const sentences = sentencesOf(source)
  return template.sections.map((section, index) => `## ${section}\n${sentences[index] ?? 'Nothing in the source.'}`).join('\n\n')
}

export const demoTranscript =
  'We agreed to move the launch to the third of March. Anna owns the press release, and Marco updates the budget by Friday.'
