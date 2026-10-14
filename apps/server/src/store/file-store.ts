import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'

const fileRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  mime_type: z.string(),
  content: z.instanceof(Uint8Array),
})

export type StoredFile = {
  id: string
  name: string
  mimeType: string
  content: Uint8Array
}

export type FileStore = ReturnType<typeof createFileStore>

/**
 * Keeps uploaded forms and produced documents, so they are downloaded through the browser
 * and never written anywhere the host can see.
 * @param database The open database.
 * @param now The clock.
 * @returns The store.
 */
export const createFileStore = (database: DatabaseSync, now: () => number) => ({
  put: (file: Omit<StoredFile, 'id'>): string => {
    const id = randomUUID()
    database.prepare('INSERT INTO files (id, name, mime_type, content, created_at) VALUES (?, ?, ?, ?, ?)').run(id, file.name, file.mimeType, file.content, now())
    return id
  },
  get: (id: string): StoredFile | undefined => {
    const row = database.prepare('SELECT id, name, mime_type, content FROM files WHERE id = ?').get(id)
    if (row === undefined) return undefined
    const parsed = fileRowSchema.parse(row)
    return { id: parsed.id, name: parsed.name, mimeType: parsed.mime_type, content: parsed.content }
  },
})
