import { z } from 'zod'
import type { ProfileDetails } from '@offee/contracts'
import { parseJsonObject } from './form-answer.ts'

const textKeys = ['firstName', 'lastName', 'role', 'organization', 'email', 'phone', 'street', 'postalCode', 'city', 'country'] as const

// A field the document does not give is left out by the model or comes back empty; either reads as empty.
const optionalText = z.string().trim().max(500).catch('')

const detailsSchema: z.ZodType<ProfileDetails> = z.object({
  firstName: optionalText,
  lastName: optionalText,
  role: optionalText,
  organization: optionalText,
  email: optionalText,
  phone: optionalText,
  street: optionalText,
  postalCode: optionalText,
  city: optionalText,
  country: optionalText,
  languages: z.array(z.string().trim().min(1).max(50)).max(20).catch([]),
  facts: z.string().trim().max(20_000).catch(''),
})

/**
 * The JSON schema the local model answers in when it reads a document about a person.
 * @returns The schema.
 */
export const profileDetailsSchema = (): Record<string, unknown> => ({
  type: 'object',
  properties: {
    ...Object.fromEntries(textKeys.map((key) => [key, { type: 'string' }])),
    languages: { type: 'array', items: { type: 'string' } },
    facts: { type: 'string' },
  },
  required: [...textKeys, 'languages', 'facts'],
})

/**
 * Reads the model's answer into profile details.
 * @param modelAnswer The model's raw answer.
 * @returns The details, or null when the answer holds nothing about the person.
 */
export const profileDetailsFromModelAnswer = (modelAnswer: string): ProfileDetails | null => {
  const parsed = detailsSchema.safeParse(parseJsonObject(modelAnswer))
  if (!parsed.success) return null
  const details = parsed.data
  const empty = textKeys.every((key) => details[key] === '') && details.languages.length === 0 && details.facts === ''
  return empty ? null : details
}
