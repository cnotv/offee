import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase } from './database.ts'
import { createRunStore } from './run-store.ts'

const directories: string[] = []

afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })))

const databaseFromTheFirstRelease = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'offee-database-'))
  directories.push(directory)
  const filePath = join(directory, 'offee.db')
  const database = new DatabaseSync(filePath)
  database.exec(`
    CREATE TABLE runs (id TEXT PRIMARY KEY, workflow TEXT NOT NULL, title TEXT NOT NULL, model TEXT, input TEXT NOT NULL,
      output TEXT NOT NULL, outbound TEXT NOT NULL, created_at INTEGER NOT NULL);
    INSERT INTO runs VALUES ('old-chat', 'chat', 'Hello', NULL, 'Hello', 'Hi there', '[]', 1);
  `)
  database.close()
  return filePath
}

describe('a database from before conversations', () => {
  it('gains the conversation column and keeps its runs, each a conversation of its own', () => {
    const database = openDatabase(databaseFromTheFirstRelease())
    const runs = createRunStore(database, () => 2)
    expect(runs.conversationOf('old-chat')?.map((run) => [run.output, run.conversationId])).toEqual([['Hi there', null]])

    const conversationId = '0f8fad5b-d9cb-469f-a165-70867728950e'
    const id = runs.record({ workflow: 'chat', title: 'Next', model: null, input: 'Next', output: 'Answer', outbound: [], conversationId })
    expect(runs.conversationOf(id)?.map((run) => run.input)).toEqual(['Next'])
  })

  it('opens twice without adding the column again', () => {
    const filePath = databaseFromTheFirstRelease()
    openDatabase(filePath).close()
    expect(() => openDatabase(filePath).close()).not.toThrow()
  })
})
