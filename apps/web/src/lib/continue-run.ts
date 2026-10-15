import type { RunDetail } from '@offee/contracts'
import type { ChatExchange, Continuation, ShownResult, WorkflowPages } from './types'

/**
 * The pages as they are before anything is typed.
 * @param newConversationId Makes the id of a new chat conversation.
 * @returns Every workflow page, empty.
 */
export const emptyWorkflowPages = (newConversationId: () => string): WorkflowPages => ({
  chat: { conversationId: newConversationId(), exchanges: [], message: '', pendingQuestion: null },
  reply: { thread: '', guidance: '', result: null },
  translate: { text: '', targetLanguage: 'English', glossary: '', result: null },
  review: { templateId: 'meeting', source: '', result: null },
})

const shownResult = (run: RunDetail): ShownResult => ({ runId: run.id, text: run.output, citations: [], model: run.model, outputFileId: null })

const exchangeOf = (run: RunDetail): ChatExchange => ({ question: run.input, answer: shownResult(run) })

const translationTitlePrefix = 'Translation into '

/**
 * Which page continues a run and what it opens with. A chat reopens its whole conversation; a
 * reply, translation or review reopens its input and result to adjust and run again; a
 * transcript becomes the source of a review. A filled form has nothing to continue.
 * @param conversation The run to continue, preceded by the earlier runs of its chat conversation.
 * @param empty The pages before anything is typed, for the settings a run does not record.
 * @returns The page and its state, or null when the run cannot be continued.
 */
export const continuationOf = (conversation: RunDetail[], empty: WorkflowPages): Continuation | null => {
  const run = conversation.at(-1)
  if (run === undefined) return null
  switch (run.workflow) {
    case 'chat':
      return {
        page: 'chat',
        state: { conversationId: run.conversationId ?? empty.chat.conversationId, exchanges: conversation.map(exchangeOf), message: '', pendingQuestion: null },
      }
    case 'reply':
      return { page: 'reply', state: { thread: run.input, guidance: '', result: shownResult(run) } }
    case 'translate':
      return {
        page: 'translate',
        state: {
          text: run.input,
          targetLanguage: run.title.startsWith(translationTitlePrefix) ? run.title.slice(translationTitlePrefix.length) : empty.translate.targetLanguage,
          glossary: '',
          result: shownResult(run),
        },
      }
    case 'review':
      return { page: 'review', state: { templateId: empty.review.templateId, source: run.input, result: shownResult(run) } }
    case 'transcribe':
      return { page: 'review', state: { templateId: empty.review.templateId, source: run.output, result: null } }
    case 'form':
    case 'profile':
      return null
  }
}

/**
 * Whether a run can be continued, before loading it.
 * @param workflow The run's workflow.
 * @returns True for every workflow but forms and reading a profile from a document.
 */
export const canContinue = (workflow: RunDetail['workflow']): boolean => workflow !== 'form' && workflow !== 'profile'
