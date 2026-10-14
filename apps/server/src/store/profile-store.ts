import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import type { Persona, PersonaInput, Profile, ProfileInput } from '@offee/contracts'
import { certificateSchema, personaInputSchema, profileInputSchema } from './schemas.ts'

export type Certificate = z.infer<typeof certificateSchema>

const profileRowSchema = z.object({
  id: z.string(),
  data: z.string(),
  certificate: z.string().nullable(),
  created_at: z.number(),
})

const personaRowSchema = z.object({ id: z.string(), data: z.string(), created_at: z.number() })

const toProfile = (row: unknown): Profile => {
  const parsedRow = profileRowSchema.parse(row)
  return {
    ...profileInputSchema.parse(JSON.parse(parsedRow.data)),
    id: parsedRow.id,
    hasCertificate: parsedRow.certificate !== null,
    createdAt: parsedRow.created_at,
  }
}

const toPersona = (row: unknown): Persona => {
  const parsedRow = personaRowSchema.parse(row)
  return { ...personaInputSchema.parse(JSON.parse(parsedRow.data)), id: parsedRow.id, createdAt: parsedRow.created_at }
}

export type ProfileStore = ReturnType<typeof createProfileStore>

/**
 * Keeps profiles: the identities the person acts as, with their signing certificate.
 * @param database The open database.
 * @param now The clock.
 * @returns The store.
 */
export const createProfileStore = (database: DatabaseSync, now: () => number) => ({
  list: (): Profile[] => database.prepare('SELECT * FROM profiles ORDER BY created_at').all().map(toProfile),
  get: (id: string): Profile | undefined => {
    const row = database.prepare('SELECT * FROM profiles WHERE id = ?').get(id)
    return row === undefined ? undefined : toProfile(row)
  },
  create: (input: ProfileInput): Profile => {
    const id = randomUUID()
    database.prepare('INSERT INTO profiles (id, data, certificate, created_at) VALUES (?, ?, NULL, ?)').run(id, JSON.stringify(input), now())
    return toProfile(database.prepare('SELECT * FROM profiles WHERE id = ?').get(id))
  },
  update: (id: string, input: ProfileInput): boolean =>
    database.prepare('UPDATE profiles SET data = ? WHERE id = ?').run(JSON.stringify(input), id).changes > 0,
  remove: (id: string): boolean => database.prepare('DELETE FROM profiles WHERE id = ?').run(id).changes > 0,
  readCertificate: (id: string): Certificate | undefined => {
    const row = database.prepare('SELECT certificate FROM profiles WHERE id = ?').get(id)
    const certificate = z.object({ certificate: z.string().nullable() }).parse(row ?? { certificate: null }).certificate
    return certificate === null ? undefined : certificateSchema.parse(JSON.parse(certificate))
  },
  saveCertificate: (id: string, certificate: Certificate): boolean =>
    database.prepare('UPDATE profiles SET certificate = ? WHERE id = ?').run(JSON.stringify(certificate), id).changes > 0,
})

export type PersonaStore = ReturnType<typeof createPersonaStore>

/**
 * Keeps personas: the assistant roles, with their instructions and model preference.
 * @param database The open database.
 * @param now The clock.
 * @returns The store.
 */
export const createPersonaStore = (database: DatabaseSync, now: () => number) => ({
  list: (): Persona[] => database.prepare('SELECT * FROM personas ORDER BY created_at').all().map(toPersona),
  get: (id: string): Persona | undefined => {
    const row = database.prepare('SELECT * FROM personas WHERE id = ?').get(id)
    return row === undefined ? undefined : toPersona(row)
  },
  create: (input: PersonaInput): Persona => {
    const id = randomUUID()
    database.prepare('INSERT INTO personas (id, data, created_at) VALUES (?, ?, ?)').run(id, JSON.stringify(input), now())
    return toPersona(database.prepare('SELECT * FROM personas WHERE id = ?').get(id))
  },
  update: (id: string, input: PersonaInput): boolean =>
    database.prepare('UPDATE personas SET data = ? WHERE id = ?').run(JSON.stringify(input), id).changes > 0,
  remove: (id: string): boolean => database.prepare('DELETE FROM personas WHERE id = ?').run(id).changes > 0,
})
