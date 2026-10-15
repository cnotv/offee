import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import type { StoredItem, StoredItemKind } from '@offee/contracts'
import { storedItemKindSchema } from './schemas.ts'

// Each kind's table, the column that names an item, and what counts towards its size.
const sources: Record<StoredItemKind, { table: string; title: string; bytes: string }> = {
  profile: { table: 'profiles', title: "json_extract(data, '$.label')", bytes: 'length(data) + coalesce(length(certificate), 0)' },
  persona: { table: 'personas', title: "json_extract(data, '$.name')", bytes: 'length(data)' },
  document: { table: 'documents', title: 'title', bytes: 'length(text)' },
  file: { table: 'files', title: 'name', bytes: 'length(content)' },
  run: { table: 'runs', title: 'title', bytes: 'length(input) + length(output) + length(outbound)' },
}

const listQuery = Object.entries(sources)
  .map(([kind, source]) => `SELECT '${kind}' AS kind, id, coalesce(${source.title}, '') AS title, ${source.bytes} AS bytes, created_at FROM ${source.table}`)
  .join(' UNION ALL ')

const itemRowSchema = z.object({ kind: storedItemKindSchema, id: z.string(), title: z.string(), bytes: z.number(), created_at: z.number() })

export type StoredData = ReturnType<typeof createStoredData>

/**
 * Everything Offee keeps, across its stores, to see and delete in one place.
 * @param database The open database.
 * @returns The listing and the deletions.
 */
export const createStoredData = (database: DatabaseSync) => ({
  list: (): StoredItem[] =>
    database
      .prepare(`${listQuery} ORDER BY created_at DESC`)
      .all()
      .map((row) => {
        const parsed = itemRowSchema.parse(row)
        return { kind: parsed.kind, id: parsed.id, title: parsed.title, bytes: parsed.bytes, createdAt: parsed.created_at }
      }),
  remove: (kind: StoredItemKind, id: string): boolean => {
    if (kind === 'document') database.prepare('DELETE FROM chunks WHERE document_id = ?').run(id)
    return database.prepare(`DELETE FROM ${sources[kind].table} WHERE id = ?`).run(id).changes > 0
  },
  removeAll: (): void => {
    database.exec(['chunks', ...Object.values(sources).map((source) => source.table)].map((table) => `DELETE FROM ${table};`).join(' '))
    // Deleted rows otherwise stay readable in the file's free pages until they are reused.
    database.exec('VACUUM')
  },
})
