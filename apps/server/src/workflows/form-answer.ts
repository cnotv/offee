import { z } from 'zod'
import type { FieldSuggestion, FormField } from '@offee/contracts'

/**
 * The JSON schema the local model must answer in: one string per unanswered field.
 * @param fields The fields the profile did not answer.
 * @returns The schema.
 */
export const formSchemaFor = (fields: FormField[]): Record<string, unknown> => ({
  type: 'object',
  properties: {
    fields: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string', enum: fields.map((field) => field.name) }, value: { type: 'string' } },
        required: ['name', 'value'],
      },
    },
  },
  required: ['fields'],
})

const answerSchema = z.object({ fields: z.array(z.object({ name: z.string(), value: z.string() })) })

/**
 * Finds the JSON object in a model's answer, which a remote model may wrap in prose or a fence.
 * @param text The answer.
 * @returns The parsed object, or null.
 */
export const parseJsonObject = (text: string): unknown => {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
}

/**
 * Adds the model's values to the fields the profile left empty. A field the profile answered
 * keeps the profile's value, and a value for a field that does not exist is dropped.
 * @param fromProfile The suggestions made by rule.
 * @param modelAnswer The model's raw answer.
 * @returns The merged suggestions.
 */
export const suggestionsFromModelAnswer = (fromProfile: FieldSuggestion[], modelAnswer: string): FieldSuggestion[] => {
  const parsed = answerSchema.safeParse(parseJsonObject(modelAnswer))
  const modelValues = new Map(parsed.success ? parsed.data.fields.map((field) => [field.name, field.value.trim()]) : [])
  return fromProfile.map((suggestion) => {
    if (suggestion.source !== 'none') return suggestion
    const value = modelValues.get(suggestion.name) ?? ''
    return value === '' ? suggestion : { name: suggestion.name, value, source: 'model' }
  })
}
