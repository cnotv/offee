import { DatabaseSync } from 'node:sqlite'

const schema = `
  CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    certificate TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS personas (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    text TEXT NOT NULL,
    profile_id TEXT,
    persona_id TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE VIRTUAL TABLE IF NOT EXISTS chunks USING fts5(
    document_id UNINDEXED,
    ordinal UNINDEXED,
    content,
    tokenize = 'unicode61 remove_diacritics 2'
  );
  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    content BLOB NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    workflow TEXT NOT NULL,
    title TEXT NOT NULL,
    model TEXT,
    input TEXT NOT NULL,
    output TEXT NOT NULL,
    outbound TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`

/**
 * Opens the database and creates any missing table.
 * @param filePath The SQLite file, or ':memory:' in tests.
 * @returns The open database.
 */
export const openDatabase = (filePath: string): DatabaseSync => {
  const database = new DatabaseSync(filePath)
  database.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
  database.exec(schema)
  return database
}
