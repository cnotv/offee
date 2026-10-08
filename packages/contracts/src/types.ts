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

export type WorkflowKind = 'chat' | 'reply' | 'translate' | 'review' | 'transcribe' | 'form'

export type WorkflowContext = {
  profileId: string | null
  personaId: string | null
}

export type ChatTurn = {
  role: 'user' | 'assistant'
  content: string
}

export type ChatRequest = WorkflowContext & {
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
  input: string
  output: string
  outbound: OutboundRecord[]
}

export type GatewayRefusal = 'sealed' | 'denied' | 'timeout' | 'unknown-destination' | 'missing-key'

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
