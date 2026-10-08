import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import type { ModelUsed, OutboundRecord, RunDetail, RunSummary, WorkflowKind } from '@offee/contracts'
import { modelUsedSchema, outboundRecordSchema, workflowKindSchema } from './schemas.ts'

const runRowSchema = z.object({
  id: z.string(),
  workflow: workflowKindSchema,
  title: z.string(),
  model: z.string().nullable(),
  input: z.string(),
  output: z.string(),
  outbound: z.string(),
  created_at: z.number(),
})

const storedTextLimit = 200_000

const toDetail = (row: unknown): RunDetail => {
  const parsed = runRowSchema.parse(row)
  const outbound = z.array(outboundRecordSchema).parse(JSON.parse(parsed.outbound))
  return {
    id: parsed.id,
    workflow: parsed.workflow,
    title: parsed.title,
    model: parsed.model === null ? null : modelUsedSchema.parse(JSON.parse(parsed.model)),
    leftMachine: outbound.some((record) => record.outcome === 'sent'),
    createdAt: parsed.created_at,
    input: parsed.input,
    output: parsed.output,
    outbound,
  }
}

const toSummary = (detail: RunDetail): RunSummary => ({
  id: detail.id,
  workflow: detail.workflow,
  title: detail.title,
  model: detail.model,
  leftMachine: detail.leftMachine,
  createdAt: detail.createdAt,
})

export type RunRecord = {
  workflow: WorkflowKind
  title: string
  model: ModelUsed | null
  input: string
  output: string
  outbound: OutboundRecord[]
}

export type RunStore = ReturnType<typeof createRunStore>

/**
 * Records every run: what went in, which model answered, what left the machine, what came out.
 * @param database The open database.
 * @param now The clock.
 * @returns The store.
 */
export const createRunStore = (database: DatabaseSync, now: () => number) => ({
  record: (run: RunRecord): string => {
    const id = randomUUID()
    database
      .prepare('INSERT INTO runs (id, workflow, title, model, input, output, outbound, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(
        id,
        run.workflow,
        run.title.slice(0, 200),
        run.model === null ? null : JSON.stringify(run.model),
        run.input.slice(0, storedTextLimit),
        run.output.slice(0, storedTextLimit),
        JSON.stringify(run.outbound),
        now(),
      )
    return id
  },
  list: (limit = 200): RunSummary[] =>
    database.prepare('SELECT * FROM runs ORDER BY created_at DESC LIMIT ?').all(limit).map(toDetail).map(toSummary),
  get: (id: string): RunDetail | undefined => {
    const row = database.prepare('SELECT * FROM runs WHERE id = ?').get(id)
    return row === undefined ? undefined : toDetail(row)
  },
})
