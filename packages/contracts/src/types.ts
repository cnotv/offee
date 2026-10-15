// Types shared by the server, the web app and the gateway. Declarations only.

export type Profile = {
  id: string
  label: string
  firstName: string
  lastName: string
  role: string
  organization: string
  email: string
  phone: string
  street: string
  postalCode: string
  city: string
  country: string
  languages: string[]
  tone: string
  facts: string
  signatureImage: string | null
  hasCertificate: boolean
  createdAt: number
}

export type ProfileInput = Omit<Profile, 'id' | 'hasCertificate' | 'createdAt'>

/** What a document says about the person, ready to check and save into a profile. */
export type ProfileDetails = Pick<
  ProfileInput,
  'firstName' | 'lastName' | 'role' | 'organization' | 'email' | 'phone' | 'street' | 'postalCode' | 'city' | 'country' | 'languages' | 'facts'
>

export type ProfileReading = {
  runId: string
  fileName: string
  details: ProfileDetails
  model: ModelUsed
}

export type ModelPreference = 'local' | 'remote'

export type Persona = {
  id: string
  name: string
  instructions: string
  modelPreference: ModelPreference
  createdAt: number
}

export type PersonaInput = Omit<Persona, 'id' | 'createdAt'>

export type DocumentSummary = {
  id: string
  title: string
  mimeType: string
  characterCount: number
  profileId: string | null
  personaId: string | null
  createdAt: number
}

/** A document with the text Offee keeps for it, for the Library's preview. */
export type DocumentDetail = DocumentSummary & { text: string }

export type DocumentAssignment = {
  profileId: string | null
  personaId: string | null
}

export type Citation = {
  documentId: string
  documentTitle: string
  excerpt: string
}

export type ModelUsed = {
  kind: 'local' | 'remote'
  name: string
  fallbackReason: string | null
}

export type WorkflowKind = 'chat' | 'reply' | 'translate' | 'review' | 'transcribe' | 'form' | 'profile'

export type WorkflowContext = {
  profileId: string | null
  personaId: string | null
}

export type ChatTurn = {
  role: 'user' | 'assistant'
  content: string
}

export type ChatRequest = WorkflowContext & {
  /** Chosen by the page when a conversation starts; every exchange in it carries the same id. */
  conversationId: string
  history: ChatTurn[]
  message: string
}

export type WorkflowResult = {
  runId: string
  text: string
  citations: Citation[]
  model: ModelUsed
  outputFileId: string | null
}

export type ReplyRequest = WorkflowContext & {
  thread: string
  guidance: string
}

export type TranslateRequest = WorkflowContext & {
  text: string
  targetLanguage: string
  glossary: string
}

export type ReviewTemplate = {
  id: string
  name: string
  sections: string[]
}

export type ReviewRequest = WorkflowContext & {
  source: string
  templateId: string
}

export type TranscriptionResult = {
  runId: string
  text: string
}

export type FormFieldKind = 'text' | 'checkbox' | 'dropdown' | 'radio' | 'signature' | 'other'

export type FormField = {
  name: string
  kind: FormFieldKind
  options: string[]
}

export type FieldSuggestionSource = 'profile' | 'model' | 'none'

export type FieldSuggestion = {
  name: string
  value: string
  source: FieldSuggestionSource
}

export type FormInspection = {
  formFileId: string
  fileName: string
  fields: FormField[]
  suggestions: FieldSuggestion[]
  model: ModelUsed | null
}

export type FormFillRequest = {
  formFileId: string
  profileId: string
  values: FieldSuggestion[]
  sign: boolean
}

export type FormFillResult = {
  runId: string
  outputFileId: string
  signed: boolean
}

export type SwitchMode = 'sealed' | 'ask' | 'open'

export type GatewayStatus = {
  mode: SwitchMode
  openUntil: number | null
  pendingCount: number
}

export type AppStatus = {
  gateway: GatewayStatus | null
  chatModel: string | null
  transcriptionReady: boolean
  remoteModel: string
}

export type OutboundRecord = {
  destination: string
  sentAt: number
  outcome: 'sent' | 'refused'
  detail: string
}

export type RunSummary = {
  id: string
  workflow: WorkflowKind
  title: string
  model: ModelUsed | null
  leftMachine: boolean
  createdAt: number
}

export type RunDetail = RunSummary & {
  /** The chat conversation the run belongs to; null for other workflows and older chats. */
  conversationId: string | null
  input: string
  output: string
  outbound: OutboundRecord[]
}

export type GatewayRefusal = 'sealed' | 'denied' | 'timeout' | 'unknown-destination' | 'missing-key' | 'unreachable'

export type GatewayRefusalBody = {
  refusal: GatewayRefusal
  detail: string
}

export type PendingRequest = {
  id: string
  destination: string
  url: string
  createdAt: number
  bodyBytes: number
  bodyPreview: string
}

export type StoredItemKind = 'profile' | 'persona' | 'document' | 'file' | 'run'

/** One thing Offee keeps in its database, for the Stored data page. */
export type StoredItem = {
  kind: StoredItemKind
  id: string
  title: string
  /** Approximate: the stored text and file content, not the database's own overhead. */
  bytes: number
  createdAt: number
}
