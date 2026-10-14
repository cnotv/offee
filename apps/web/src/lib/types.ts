import type { Citation, ModelUsed } from '@offee/contracts'

/** An answer shown on a workflow page, fresh from the server or restored from the run log. */
export type ShownResult = {
  runId: string
  text: string
  citations: Citation[]
  model: ModelUsed | null
  outputFileId: string | null
}

export type ChatExchange = {
  question: string
  answer: ShownResult
}

/** What each workflow page holds; it outlives the page, so leaving one loses nothing. */
export type WorkflowPages = {
  chat: { conversationId: string; exchanges: ChatExchange[]; message: string; pendingQuestion: string | null }
  reply: { thread: string; guidance: string; result: ShownResult | null }
  translate: { text: string; targetLanguage: string; glossary: string; result: ShownResult | null }
  review: { templateId: string; source: string; result: ShownResult | null }
}

export type WorkflowPage = keyof WorkflowPages

export type PageActivity = {
  busy: boolean
  error: string | null
}

/** A page opened again from the run log, with what it holds. */
export type Continuation = { [Page in WorkflowPage]: { page: Page; state: WorkflowPages[Page] } }[WorkflowPage]
