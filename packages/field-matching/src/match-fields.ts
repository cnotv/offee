import { z } from 'zod'
import type { Profile } from '@offee/contracts'

// Shared by the PDF forms on the server and the browser extension, so both read a field the
// same way. One file without relative imports, so every workspace can type-check it as source.

/** A profile as the API sends it, parsed before anything reads it. */
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

// Not a profile key: terms that make a field someone else's, or a date that is not today. A
// field about a death, a birth, a spouse or a foreign address contains aliases such as "datum"
// or "anschrift", yet the profile never answers it.
const leaveToModelKey = 'leaveToModel'

// A label seen again on the same form gets a number ("Vorname 2", see usablePlacedFields), and
// the repeat belongs to another person or entry, like the spouse block of a tax return.
const repeatedLabel = /\s([2-9]|\d{2,})$/

/**
 * Finds the profile key a field asks for: an exact alias wins, otherwise the longest alias
 * the name contains, so "companyname" goes to the organization and not to the name.
 * @param fieldName The field's name.
 * @param aliases The aliases per profile key, and the terms that leave a field to the model.
 * @returns The key, or undefined when nothing matches or the field is left to the model.
 */
export const matchFieldToKey = (fieldName: string, aliases: FieldAliases): string | undefined => {
  const normalized = normalizeFieldName(fieldName)
  if (normalized === '' || repeatedLabel.test(fieldName.trim())) return undefined
  if ((aliases[leaveToModelKey] ?? []).some((term) => normalized.includes(term))) return undefined
  const candidates = Object.entries(aliases)
    .filter(([key]) => key !== leaveToModelKey)
    .flatMap(([key, names]) =>
      names.filter((alias) => normalized === alias || (alias.length >= 4 && normalized.includes(alias))).map((alias) => ({ key, alias })),
    )
  const exact = candidates.find((candidate) => candidate.alias === normalized)
  if (exact !== undefined) return exact.key
  return candidates.toSorted((left, right) => right.alias.length - left.alias.length)[0]?.key
}
