import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import type { Citation, DocumentAssignment, DocumentDetail, DocumentSummary, WorkflowContext } from '@offee/contracts'
import { chunkText } from '../knowledge/chunk-text.ts'
import { buildSearchQuery } from '../knowledge/search-query.ts'

const documentRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  mime_type: z.string(),
  character_count: z.number(),
  profile_id: z.string().nullable(),
  persona_id: z.string().nullable(),
  created_at: z.number(),
})

const textRowSchema = z.object({ text: z.string() })

const hitRowSchema = z.object({ document_id: z.string(), title: z.string(), content: z.string() })

const toSummary = (row: unknown): DocumentSummary => {
  const parsed = documentRowSchema.parse(row)
  return {
    id: parsed.id,
    title: parsed.title,
    mimeType: parsed.mime_type,
    characterCount: parsed.character_count,
    profileId: parsed.profile_id,
    personaId: parsed.persona_id,
    createdAt: parsed.created_at,
  }
}

const summaryColumns = 'id, title, mime_type, length(text) AS character_count, profile_id, persona_id, created_at'

// A document with no profile and no persona is shared by all of them; one assigned to a
// profile or a persona is used only when that profile or persona is.
const scopeCondition = `(d.profile_id IS NULL AND d.persona_id IS NULL) OR d.profile_id = :profileId OR d.persona_id = :personaId`

export type DocumentStore = ReturnType<typeof createDocumentStore>

/**
 * Keeps documents and their indexed passages.
 * @param database The open database.
 * @param now The clock.
 * @returns The store.
 */
export const createDocumentStore = (database: DatabaseSync, now: () => number) => ({
  list: (): DocumentSummary[] => database.prepare(`SELECT ${summaryColumns} FROM documents ORDER BY created_at DESC`).all().map(toSummary),
  get: (id: string): DocumentDetail | undefined => {
    const row = database.prepare(`SELECT ${summaryColumns}, text FROM documents WHERE id = ?`).get(id)
    return row === undefined ? undefined : { ...toSummary(row), text: textRowSchema.parse(row).text }
  },
  add: (input: { title: string; mimeType: string; text: string } & DocumentAssignment): DocumentSummary => {
    const id = randomUUID()
    database
      .prepare('INSERT INTO documents (id, title, mime_type, text, profile_id, persona_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, input.title, input.mimeType, input.text, input.profileId, input.personaId, now())
    const insertChunk = database.prepare('INSERT INTO chunks (document_id, ordinal, content) VALUES (?, ?, ?)')
    chunkText(input.text).forEach((content, ordinal) => insertChunk.run(id, ordinal, content))
    return toSummary(database.prepare(`SELECT ${summaryColumns} FROM documents WHERE id = ?`).get(id))
  },
  assign: (id: string, assignment: DocumentAssignment): boolean =>
    database.prepare('UPDATE documents SET profile_id = ?, persona_id = ? WHERE id = ?').run(assignment.profileId, assignment.personaId, id)
      .changes > 0,
  remove: (id: string): boolean => {
    database.prepare('DELETE FROM chunks WHERE document_id = ?').run(id)
    return database.prepare('DELETE FROM documents WHERE id = ?').run(id).changes > 0
  },
  search: (question: string, context: WorkflowContext, limit = 6): Citation[] => {
    const query = buildSearchQuery(question)
    if (query === null) return []
    return database
      .prepare(
        `SELECT c.document_id, d.title, c.content
           FROM chunks c JOIN documents d ON d.id = c.document_id
          WHERE chunks MATCH :query AND (${scopeCondition})
          ORDER BY bm25(chunks)
          LIMIT :limit`,
      )
      .all({ query, profileId: context.profileId ?? '', personaId: context.personaId ?? '', limit })
      .map((row) => {
        const hit = hitRowSchema.parse(row)
        return { documentId: hit.document_id, documentTitle: hit.title, excerpt: hit.content }
      })
  },
})
