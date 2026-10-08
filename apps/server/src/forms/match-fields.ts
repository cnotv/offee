import { z } from 'zod'
import type { FieldSuggestion, FormField, Profile } from '@offee/contracts'

export const fieldAliasesSchema = z.record(z.string(), z.array(z.string().min(2)))

export type FieldAliases = z.infer<typeof fieldAliasesSchema>

/**
 * Reduces a field name to lowercase letters and digits, without accents, so "E-Mail",
 * "e_mail" and "Email" compare equal.
 * @param name The field's name.
 * @returns The normalized name.
 */
export const normalizeFieldName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/g, '')

/**
 * The value a profile key stands for.
 * @param profile The profile.
 * @param key A key from the alias list.
 * @param today Today's date, already formatted.
 * @returns The value, or undefined for a key the profile cannot answer.
 */
export const profileValueFor = (profile: Profile, key: string, today: string): string | undefined => {
  const values: Record<string, string> = {
    fullName: `${profile.firstName} ${profile.lastName}`.trim(),
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
    phone: profile.phone,
    organization: profile.organization,
    role: profile.role,
    street: profile.street,
    postalCode: profile.postalCode,
    city: profile.city,
    country: profile.country,
    date: today,
    place: profile.city === '' ? today : `${profile.city}, ${today}`,
  }
  return values[key]
}

/**
 * Finds the profile key a field asks for: an exact alias wins, otherwise the longest alias
 * the name contains, so "companyname" goes to the organization and not to the name.
 * @param fieldName The field's name.
 * @param aliases The aliases per profile key.
 * @returns The key, or undefined when nothing matches.
 */
export const matchFieldToKey = (fieldName: string, aliases: FieldAliases): string | undefined => {
  const normalized = normalizeFieldName(fieldName)
  if (normalized === '') return undefined
  const candidates = Object.entries(aliases).flatMap(([key, names]) =>
    names.filter((alias) => normalized === alias || (alias.length >= 4 && normalized.includes(alias))).map((alias) => ({ key, alias })),
  )
  const exact = candidates.find((candidate) => candidate.alias === normalized)
  if (exact !== undefined) return exact.key
  return candidates.toSorted((left, right) => right.alias.length - left.alias.length)[0]?.key
}

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
