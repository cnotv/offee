import type {
  AppStatus,
  ChatRequest,
  Citation,
  DocumentAssignment,
  DocumentSummary,
  FormFillRequest,
  FormFillResult,
  FormInspection,
  ModelUsed,
  Persona,
  PersonaInput,
  Profile,
  ProfileInput,
  ReplyRequest,
  ReviewRequest,
  ReviewTemplate,
  RunDetail,
  RunSummary,
  TranscriptionResult,
  TranslateRequest,
  WorkflowContext,
  WorkflowResult,
} from '@offee/contracts'

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

/** A document in demo mode's library, with the text a real server would keep to search. */
export type DemoDocument = DocumentSummary & { text: string }

/** Demo mode's answer to a chat question, drawn from the sample documents. */
export type ChatAnswer = { text: string; citations: Citation[] }

export type ExtractedText = { text: string }

/** Every call the UI makes: to the Offee server, or to the in-page stand-in in demo mode. */
export type OffeeApi = {
  status: () => Promise<AppStatus>
  profiles: () => Promise<Profile[]>
  createProfile: (input: ProfileInput) => Promise<Profile>
  updateProfile: (id: string, input: ProfileInput) => Promise<Profile>
  deleteProfile: (id: string) => Promise<void>
  personas: () => Promise<Persona[]>
  createPersona: (input: PersonaInput) => Promise<Persona>
  updatePersona: (id: string, input: PersonaInput) => Promise<Persona>
  deletePersona: (id: string) => Promise<void>
  documents: () => Promise<DocumentSummary[]>
  uploadDocument: (file: File, assignment: DocumentAssignment) => Promise<DocumentSummary>
  assignDocument: (id: string, assignment: DocumentAssignment) => Promise<void>
  deleteDocument: (id: string) => Promise<void>
  extractText: (file: File) => Promise<ExtractedText>
  chat: (request: ChatRequest) => Promise<WorkflowResult>
  reply: (request: ReplyRequest) => Promise<WorkflowResult>
  translate: (request: TranslateRequest) => Promise<WorkflowResult>
  reviewTemplates: () => Promise<ReviewTemplate[]>
  review: (request: ReviewRequest) => Promise<WorkflowResult>
  transcribe: (file: File) => Promise<TranscriptionResult>
  inspectForm: (file: File, context: WorkflowContext) => Promise<FormInspection>
  fillForm: (request: FormFillRequest) => Promise<FormFillResult>
  runs: () => Promise<RunSummary[]>
  run: (id: string) => Promise<RunDetail>
  runConversation: (id: string) => Promise<RunDetail[]>
  fileUrl: (id: string) => string
}
