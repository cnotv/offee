import type { FieldSuggestion, FormField, Profile } from '@offee/contracts'
import type { FieldAliases } from '@offee/field-matching'
import { matchFieldToKey, profileValueFor } from '@offee/field-matching'

/**
 * Fills what the profile answers by rule; the rest is left for the model or the person.
 * @param fields The form's fields.
 * @param profile The profile filling the form.
 * @param aliases The aliases per profile key.
 * @param today Today's date, already formatted.
 * @returns One suggestion per field, in the form's order.
 */
export const suggestFromProfile = (fields: FormField[], profile: Profile, aliases: FieldAliases, today: string): FieldSuggestion[] =>
  fields.map((field) => {
    if (field.kind === 'signature' || field.kind === 'checkbox') return { name: field.name, value: '', source: 'none' }
    const key = matchFieldToKey(field.name, aliases)
    const value = key === undefined ? undefined : profileValueFor(profile, key, today)
    return value === undefined || value === '' ? { name: field.name, value: '', source: 'none' } : { name: field.name, value, source: 'profile' }
  })
