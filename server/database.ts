import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

const here = path.dirname(fileURLToPath(import.meta.url))

export const DB_PATH = process.env.DB_PATH ?? path.join(here, 'msd-vd2-scope.db')

export const db = new Database(DB_PATH)

// Better concurrent reads.
db.pragma('journal_mode = WAL')
// OFF by default in SQLite — without this, ON DELETE CASCADE silently does
// nothing and you get orphaned child rows.
db.pragma('foreign_keys = ON')
