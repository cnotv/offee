import { z } from 'zod'
import type { WorkflowContext } from '@offee/contracts'
import {
  appStatusSchema,
  documentDetailSchema,
  documentSummarySchema,
  errorBodySchema,
  extractedTextSchema,
  formFillResultSchema,
  formInspectionSchema,
  personaSchema,
  profileReadingSchema,
  profileSchema,
  reviewTemplateSchema,
  runDetailSchema,
  runSummarySchema,
  transcriptionResultSchema,
  workflowResultSchema,
} from './schemas'
import type { OffeeApi } from './types'

const readBody = async <Output>(response: Response, schema: z.ZodType<Output>): Promise<Output> => {
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const parsedError = errorBodySchema.safeParse(body)
    throw new Error(parsedError.success ? parsedError.data.error : `The request failed with ${response.status}`)
  }
  return schema.parse(body)
}

const getJson = async <Output>(path: string, schema: z.ZodType<Output>): Promise<Output> => readBody(await fetch(path), schema)

// A signal stops the request; the server notices the closed connection and stops the model call it waits on.
const sendJson = async <Output>(method: 'POST' | 'PUT', path: string, body: unknown, schema: z.ZodType<Output>, signal?: AbortSignal): Promise<Output> =>
  readBody(await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal }), schema)

const sendWithoutAnswer = async (method: 'PUT' | 'DELETE', path: string, body?: unknown): Promise<void> => {
  const response = await fetch(path, {
    method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  })
  if (!response.ok) await readBody(response, z.unknown())
}

const upload = async <Output>(path: string, file: File, fields: Record<string, string>, schema: z.ZodType<Output>, signal: AbortSignal): Promise<Output> => {
  const form = new FormData()
  form.set('file', file)
  Object.entries(fields).forEach(([key, value]) => form.set(key, value))
  return readBody(await fetch(path, { method: 'POST', body: form, signal }), schema)
}

const contextFields = (context: WorkflowContext): Record<string, string> => ({
  profileId: context.profileId ?? '',
  personaId: context.personaId ?? '',
})

/** Every call the UI makes to the Offee server. */
export const httpApi: OffeeApi = {
  status: () => getJson('/api/status', appStatusSchema),
  profiles: () => getJson('/api/profiles', z.array(profileSchema)),
  createProfile: (input) => sendJson('POST', '/api/profiles', input, profileSchema),
  updateProfile: (id, input) => sendJson('PUT', `/api/profiles/${id}`, input, profileSchema),
  deleteProfile: (id) => sendWithoutAnswer('DELETE', `/api/profiles/${id}`),
  readProfileDocument: (file, signal) => upload('/api/profiles/read-document', file, {}, profileReadingSchema, signal),
  personas: () => getJson('/api/personas', z.array(personaSchema)),
  createPersona: (input) => sendJson('POST', '/api/personas', input, personaSchema),
  updatePersona: (id, input) => sendJson('PUT', `/api/personas/${id}`, input, personaSchema),
  deletePersona: (id) => sendWithoutAnswer('DELETE', `/api/personas/${id}`),
  documents: () => getJson('/api/documents', z.array(documentSummarySchema)),
  document: (id) => getJson(`/api/documents/${id}`, documentDetailSchema),
  uploadDocument: (file, assignment, signal) => upload('/api/documents', file, contextFields(assignment), documentSummarySchema, signal),
  assignDocument: (id, assignment) => sendWithoutAnswer('PUT', `/api/documents/${id}`, assignment),
  deleteDocument: (id) => sendWithoutAnswer('DELETE', `/api/documents/${id}`),
  extractText: (file, signal) => upload('/api/extract', file, {}, extractedTextSchema, signal),
  chat: (request, signal) => sendJson('POST', '/api/chat', request, workflowResultSchema, signal),
  reply: (request, signal) => sendJson('POST', '/api/workflows/reply', request, workflowResultSchema, signal),
  translate: (request, signal) => sendJson('POST', '/api/workflows/translate', request, workflowResultSchema, signal),
  reviewTemplates: () => getJson('/api/review-templates', z.array(reviewTemplateSchema)),
  review: (request, signal) => sendJson('POST', '/api/workflows/review', request, workflowResultSchema, signal),
  transcribe: (file, signal) => upload('/api/transcribe', file, {}, transcriptionResultSchema, signal),
  inspectForm: (file, context, signal) => upload('/api/forms/inspect', file, contextFields(context), formInspectionSchema, signal),
  fillForm: (request) => sendJson('POST', '/api/forms/fill', request, formFillResultSchema),
  runs: () => getJson('/api/runs', z.array(runSummarySchema)),
  run: (id) => getJson(`/api/runs/${id}`, runDetailSchema),
  runConversation: (id) => getJson(`/api/runs/${id}/conversation`, z.array(runDetailSchema)),
  fileUrl: (id) => `/api/files/${id}`,
}
