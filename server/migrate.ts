import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { db } from './database.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = path.join(here, 'migrations')

/**
 * Applies every .sql file in migrations/ in filename order — filename order
 * IS apply order. Each runs inside a transaction and is recorded, so a
 * restart re-applies nothing.
 */
export function runMigrations(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const applied = new Set(
    db.prepare('SELECT name FROM migrations').all().map((r) => (r as { name: string }).name),
  )

  const files = fs.existsSync(MIGRATIONS_DIR)
    ? fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
    : []

  const pending = files.filter((f) => !applied.has(f))

  if (pending.length === 0) {
    console.log('[db] Migrations up to date')
    return
  }

  const record = db.prepare('INSERT INTO migrations (name) VALUES (?)')

  for (const file of pending) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
    db.transaction(() => {
      db.exec(sql)
      record.run(file)
    })()
    console.log(`[db] Applied migration ${file}`)
  }

  console.log(`[db] ${pending.length} migration(s) applied`)
}
