import { z } from 'zod'

const shortText = z.string().max(500)

export const profileInputSchema = z.object({
  label: z.string().trim().min(1).max(100),
  firstName: shortText,
  lastName: shortText,
  role: shortText,
  organization: shortText,
  email: shortText,
  phone: shortText,
  street: shortText,
  postalCode: shortText,
  city: shortText,
  country: shortText,
  languages: z.array(z.string().trim().min(1).max(50)).max(20),
  tone: shortText,
  facts: z.string().max(20_000),
  signatureImage: z
    .string()
    .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/)
    .max(2_000_000)
    .nullable(),
})

export const personaInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  instructions: z.string().max(20_000),
  modelPreference: z.enum(['local', 'remote']),
})

export const certificateSchema = z.object({
  p12Base64: z.string().min(1),
  passphrase: z.string().min(1),
})

export const modelUsedSchema = z.object({
  kind: z.enum(['local', 'remote']),
  name: z.string(),
  fallbackReason: z.string().nullable(),
})

export const outboundRecordSchema = z.object({
  destination: z.string(),
  sentAt: z.number(),
  outcome: z.enum(['sent', 'refused']),
  detail: z.string(),
})

export const workflowKindSchema = z.enum(['chat', 'reply', 'translate', 'review', 'transcribe', 'form', 'profile'])

export const storedItemKindSchema = z.enum(['profile', 'persona', 'document', 'file', 'run'])

export const storedItemDeletionSchema = z.object({
  items: z.array(z.object({ kind: storedItemKindSchema, id: z.string().min(1).max(100) })).min(1).max(10_000),
})

export const workflowContextSchema = z.object({
  profileId: z.string().nullable(),
  personaId: z.string().nullable(),
})

export const chatRequestSchema = workflowContextSchema.extend({
  conversationId: z.uuid(),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(50_000) })).max(40),
  message: z.string().trim().min(1).max(50_000),
})

export const replyRequestSchema = workflowContextSchema.extend({
  thread: z.string().trim().min(1).max(200_000),
  guidance: z.string().max(5_000),
})

export const translateRequestSchema = workflowContextSchema.extend({
  text: z.string().trim().min(1).max(500_000),
  targetLanguage: z.string().trim().min(1).max(50),
  glossary: z.string().max(10_000),
})

export const reviewRequestSchema = workflowContextSchema.extend({
  source: z.string().trim().min(1).max(500_000),
  templateId: z.string().min(1),
})

export const documentAssignmentSchema = z.object({
  profileId: z.string().nullable(),
  personaId: z.string().nullable(),
})

export const fieldSuggestionSchema = z.object({
  name: z.string(),
  value: z.string().max(5_000),
  source: z.enum(['profile', 'model', 'none']),
})

export const placedFieldSchema = z.object({
  name: z.string().min(1).max(200),
  line: z.number().int().min(1),
  kind: z.enum(['text', 'checkbox']),
  position: z.enum(['below', 'above', 'right', 'left']),
})

export const formFillRequestSchema = z.object({
  formFileId: z.string().min(1),
  profileId: z.string().min(1),
  // A complete income tax return has over 2,000 fields.
  values: z.array(fieldSuggestionSchema).max(10_000),
  placedFields: z.array(placedFieldSchema).max(10_000),
  sign: z.boolean(),
})
