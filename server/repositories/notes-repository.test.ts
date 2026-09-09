import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// A real in-memory database — repositories are never tested against a mock.
const db = new Database(':memory:')
db.pragma('foreign_keys = ON')

vi.mock('../database.js', () => ({ db }))

const { createNote, getAllNotes } = await import('./notes-repository.js')

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    text       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`

beforeEach(() => {
  db.exec('DROP TABLE IF EXISTS notes')
  db.exec(SCHEMA)
})

describe('notes repository', () => {
  it('returns an empty array when there are no notes', () => {
    expect(getAllNotes()).toEqual([])
  })

  it('round-trips a created note', () => {
    const created = createNote('write the migration')

    expect(created).toMatchObject({ id: expect.any(Number), text: 'write the migration' })
    expect(created.created_at).toBeTruthy()
    expect(getAllNotes()).toHaveLength(1)
  })

  it('returns newest first', () => {
    createNote('first')
    createNote('second')
    createNote('third')

    expect(getAllNotes().map((n) => n.text)).toEqual(['third', 'second', 'first'])
  })

  it('rejects a null text at the database level', () => {
    expect(() => createNote(null as unknown as string)).toThrow()
  })

  it('preserves text exactly, including characters that matter to SQL', () => {
    const hostile = "Robert'); DROP TABLE notes;--"
    createNote(hostile)

    // Parameterised statements: stored verbatim, table intact.
    expect(getAllNotes()[0].text).toBe(hostile)
    expect(getAllNotes()).toHaveLength(1)
  })
})
