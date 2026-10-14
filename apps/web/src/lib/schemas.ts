import { z } from 'zod'

// The API's answers, parsed before the UI uses them.

export const profileSchema = z.object({
  id: z.string(),
  label: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  role: z.string(),
  organization: z.string(),
  email: z.string(),
  phone: z.string(),
  street: z.string(),
  postalCode: z.string(),
  city: z.string(),
  country: z.string(),
  languages: z.array(z.string()),
  tone: z.string(),
  facts: z.string(),
  signatureImage: z.string().nullable(),
  hasCertificate: z.boolean(),
  createdAt: z.number(),
})

export const personaSchema = z.object({
  id: z.string(),
  name: z.string(),
  instructions: z.string(),
  modelPreference: z.enum(['local', 'remote']),
  createdAt: z.number(),
})

export const documentSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  mimeType: z.string(),
  characterCount: z.number(),
  profileId: z.string().nullable(),
  personaId: z.string().nullable(),
  createdAt: z.number(),
})

export const modelUsedSchema = z.object({ kind: z.enum(['local', 'remote']), name: z.string(), fallbackReason: z.string().nullable() })

export const citationSchema = z.object({ documentId: z.string(), documentTitle: z.string(), excerpt: z.string() })

export const workflowResultSchema = z.object({
  runId: z.string(),
  text: z.string(),
  citations: z.array(citationSchema),
  model: modelUsedSchema,
  outputFileId: z.string().nullable(),
})

export const transcriptionResultSchema = z.object({ runId: z.string(), text: z.string() })

export const reviewTemplateSchema = z.object({ id: z.string(), name: z.string(), sections: z.array(z.string()) })

export const fieldSuggestionSchema = z.object({ name: z.string(), value: z.string(), source: z.enum(['profile', 'model', 'none']) })

export const formInspectionSchema = z.object({
  formFileId: z.string(),
  fileName: z.string(),
  fields: z.array(
    z.object({
      name: z.string(),
      kind: z.enum(['text', 'checkbox', 'dropdown', 'radio', 'signature', 'other']),
      options: z.array(z.string()),
    }),
  ),
  suggestions: z.array(fieldSuggestionSchema),
  model: modelUsedSchema.nullable(),
})

export const formFillResultSchema = z.object({ runId: z.string(), outputFileId: z.string(), signed: z.boolean() })

export const appStatusSchema = z.object({
  gateway: z.object({ mode: z.enum(['sealed', 'ask', 'open']), openUntil: z.number().nullable(), pendingCount: z.number() }).nullable(),
  chatModel: z.string().nullable(),
  transcriptionReady: z.boolean(),
  remoteModel: z.string(),
})

export const outboundRecordSchema = z.object({
  destination: z.string(),
  sentAt: z.number(),
  outcome: z.enum(['sent', 'refused']),
  detail: z.string(),
})

export const runSummarySchema = z.object({
  id: z.string(),
  workflow: z.enum(['chat', 'reply', 'translate', 'review', 'transcribe', 'form']),
  title: z.string(),
  model: modelUsedSchema.nullable(),
  leftMachine: z.boolean(),
  createdAt: z.number(),
})

export const runDetailSchema = runSummarySchema.extend({
  input: z.string(),
  output: z.string(),
  outbound: z.array(outboundRecordSchema),
})

export const extractedTextSchema = z.object({ text: z.string() })

export const errorBodySchema = z.object({ error: z.string() })
