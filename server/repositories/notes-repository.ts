import type { Statement } from 'better-sqlite3'
import { db } from '../database.js'

export type Note = {
  id: number
  text: string
  created_at: string
}

const COLUMNS = 'id, text, created_at'

// Prepared lazily: preparing at module load runs before migrations have
// created the table and throws on first boot.
let selectAll: Statement | undefined
let insertOne: Statement | undefined

export function getAllNotes(): Note[] {
  selectAll ??= db.prepare(`SELECT ${COLUMNS} FROM notes ORDER BY id DESC`)
  return selectAll.all() as Note[]
}

export function createNote(text: string): Note {
  insertOne ??= db.prepare(
    `INSERT INTO notes (text) VALUES (?) RETURNING ${COLUMNS}`,
  )
  return insertOne.get(text) as Note
}
