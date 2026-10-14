import { z } from 'zod'
import type {
  ChatRequest,
  DocumentAssignment,
  FormFillRequest,
  PersonaInput,
  ProfileInput,
  ReplyRequest,
  ReviewRequest,
  TranslateRequest,
  WorkflowContext,
} from '@offee/contracts'
import {
  appStatusSchema,
  documentSummarySchema,
  errorBodySchema,
  extractedTextSchema,
  formFillResultSchema,
  formInspectionSchema,
  personaSchema,
  profileSchema,
  reviewTemplateSchema,
  runDetailSchema,
  runSummarySchema,
  transcriptionResultSchema,
  workflowResultSchema,
} from './schemas'

const readBody = async <Output>(response: Response, schema: z.ZodType<Output>): Promise<Output> => {
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const parsedError = errorBodySchema.safeParse(body)
    throw new Error(parsedError.success ? parsedError.data.error : `The request failed with ${response.status}`)
  }
  return schema.parse(body)
}

const getJson = async <Output>(path: string, schema: z.ZodType<Output>): Promise<Output> => readBody(await fetch(path), schema)

const sendJson = async <Output>(method: 'POST' | 'PUT', path: string, body: unknown, schema: z.ZodType<Output>): Promise<Output> =>
  readBody(await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), schema)

const sendWithoutAnswer = async (method: 'PUT' | 'DELETE', path: string, body?: unknown): Promise<void> => {
  const response = await fetch(path, {
    method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  })
  if (!response.ok) await readBody(response, z.unknown())
}

const upload = async <Output>(path: string, file: File, fields: Record<string, string>, schema: z.ZodType<Output>): Promise<Output> => {
  const form = new FormData()
  form.set('file', file)
  Object.entries(fields).forEach(([key, value]) => form.set(key, value))
  return readBody(await fetch(path, { method: 'POST', body: form }), schema)
}

const contextFields = (context: WorkflowContext): Record<string, string> => ({
  profileId: context.profileId ?? '',
  personaId: context.personaId ?? '',
})

/** Every call the UI makes to the Offee server. */
export const api = {
  status: () => getJson('/api/status', appStatusSchema),
  profiles: () => getJson('/api/profiles', z.array(profileSchema)),
  createProfile: (input: ProfileInput) => sendJson('POST', '/api/profiles', input, profileSchema),
  updateProfile: (id: string, input: ProfileInput) => sendJson('PUT', `/api/profiles/${id}`, input, profileSchema),
  deleteProfile: (id: string) => sendWithoutAnswer('DELETE', `/api/profiles/${id}`),
  personas: () => getJson('/api/personas', z.array(personaSchema)),
  createPersona: (input: PersonaInput) => sendJson('POST', '/api/personas', input, personaSchema),
  updatePersona: (id: string, input: PersonaInput) => sendJson('PUT', `/api/personas/${id}`, input, personaSchema),
  deletePersona: (id: string) => sendWithoutAnswer('DELETE', `/api/personas/${id}`),
  documents: () => getJson('/api/documents', z.array(documentSummarySchema)),
  uploadDocument: (file: File, assignment: DocumentAssignment) =>
    upload('/api/documents', file, contextFields(assignment), documentSummarySchema),
  assignDocument: (id: string, assignment: DocumentAssignment) => sendWithoutAnswer('PUT', `/api/documents/${id}`, assignment),
  deleteDocument: (id: string) => sendWithoutAnswer('DELETE', `/api/documents/${id}`),
  extractText: (file: File) => upload('/api/extract', file, {}, extractedTextSchema),
  chat: (request: ChatRequest) => sendJson('POST', '/api/chat', request, workflowResultSchema),
  reply: (request: ReplyRequest) => sendJson('POST', '/api/workflows/reply', request, workflowResultSchema),
  translate: (request: TranslateRequest) => sendJson('POST', '/api/workflows/translate', request, workflowResultSchema),
  reviewTemplates: () => getJson('/api/review-templates', z.array(reviewTemplateSchema)),
  review: (request: ReviewRequest) => sendJson('POST', '/api/workflows/review', request, workflowResultSchema),
  transcribe: (file: File) => upload('/api/transcribe', file, {}, transcriptionResultSchema),
  inspectForm: (file: File, context: WorkflowContext) => upload('/api/forms/inspect', file, contextFields(context), formInspectionSchema),
  fillForm: (request: FormFillRequest) => sendJson('POST', '/api/forms/fill', request, formFillResultSchema),
  runs: () => getJson('/api/runs', z.array(runSummarySchema)),
  run: (id: string) => getJson(`/api/runs/${id}`, runDetailSchema),
  runConversation: (id: string) => getJson(`/api/runs/${id}/conversation`, z.array(runDetailSchema)),
  fileUrl: (id: string) => `/api/files/${id}`,
}
