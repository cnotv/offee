import type {
  AppStatus,
  ChatRequest,
  Citation,
  DocumentAssignment,
  DocumentDetail,
  DocumentSummary,
  FieldSuggestion,
  FormFillRequest,
  FormFillResult,
  FormInspection,
  ModelUsed,
  Persona,
  PersonaInput,
  Profile,
  ProfileInput,
  ProfileReading,
  ReplyRequest,
  ReviewRequest,
  ReviewTemplate,
  RunDetail,
  RunSummary,
  StoredItem,
  StoredItemKey,
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
  forms: { inspection: FormInspection | null; values: FieldSuggestion[]; result: FormFillResult | null }
}

export type WorkflowPage = keyof WorkflowPages

export type PageActivity = {
  busy: boolean
  error: string | null
}

/** Something slow the person started, running wherever they are in the app until it ends or they stop it. */
export type OperationKind = 'chat' | 'reply' | 'translate' | 'review' | 'transcribe' | 'extract' | 'form' | 'form-save' | 'profile' | 'document'

export type Operation = {
  id: string
  kind: OperationKind
  label: string
  startedAt: number
}

/** Recent durations of each operation on this machine, in milliseconds, oldest first. */
export type DurationHistory = Partial<Record<OperationKind, number[]>>

/** How long an operation will likely take, and whether that comes from this machine or a typical range. */
export type Estimate = { basis: 'history' | 'typical'; label: string }

/** A made up document shipped with the app to try a workflow with. */
export type SampleFile = {
  path: string
  name: string
  type: string
  /** A picture of the page, since the Mac window has no PDF viewer; null for a text file. */
  pageImagePath: string | null
}

/** A page opened again from the run log, with what it holds. */
export type Continuation = { [Page in WorkflowPage]: { page: Page; state: WorkflowPages[Page] } }[WorkflowPage]

/** A document in demo mode's library, with the text a real server would keep to search. */
export type DemoDocument = DocumentDetail

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
  readProfileDocument: (file: File, signal: AbortSignal) => Promise<ProfileReading>
  personas: () => Promise<Persona[]>
  createPersona: (input: PersonaInput) => Promise<Persona>
  updatePersona: (id: string, input: PersonaInput) => Promise<Persona>
  deletePersona: (id: string) => Promise<void>
  documents: () => Promise<DocumentSummary[]>
  document: (id: string) => Promise<DocumentDetail>
  uploadDocument: (file: File, assignment: DocumentAssignment, signal: AbortSignal) => Promise<DocumentSummary>
  assignDocument: (id: string, assignment: DocumentAssignment) => Promise<void>
  deleteDocument: (id: string) => Promise<void>
  extractText: (file: File, signal: AbortSignal) => Promise<ExtractedText>
  chat: (request: ChatRequest, signal: AbortSignal) => Promise<WorkflowResult>
  reply: (request: ReplyRequest, signal: AbortSignal) => Promise<WorkflowResult>
  translate: (request: TranslateRequest, signal: AbortSignal) => Promise<WorkflowResult>
  reviewTemplates: () => Promise<ReviewTemplate[]>
  review: (request: ReviewRequest, signal: AbortSignal) => Promise<WorkflowResult>
  transcribe: (file: File, signal: AbortSignal) => Promise<TranscriptionResult>
  inspectForm: (file: File, context: WorkflowContext, signal: AbortSignal) => Promise<FormInspection>
  fillForm: (request: FormFillRequest) => Promise<FormFillResult>
  runs: () => Promise<RunSummary[]>
  run: (id: string) => Promise<RunDetail>
  runConversation: (id: string) => Promise<RunDetail[]>
  fileUrl: (id: string) => string
  storedData: () => Promise<StoredItem[]>
  deleteStoredItems: (items: StoredItemKey[]) => Promise<void>
  deleteAllStoredData: () => Promise<void>
}
