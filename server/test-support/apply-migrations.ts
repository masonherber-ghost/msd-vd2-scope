import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type BetterSqlite3 from 'better-sqlite3'

const here = path.dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = path.join(here, '..', 'migrations')

/**
 * Applies every migration in filename order, exactly as the runner does — so
 * tests exercise the real chain rather than a hand-picked schema file and
 * cannot drift from it.
 */
export function applyAllMigrations(db: BetterSqlite3.Database): void {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort()

  for (const file of files) {
    db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'))
  }
}

/** Drops every table, then re-applies the chain. */
export function resetSchema(db: BetterSqlite3.Database): void {
  db.pragma('foreign_keys = OFF')
  // sqlite_sequence is internal to AUTOINCREMENT and cannot be dropped.
  for (const { name } of db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all() as { name: string }[]) {
    db.exec(`DROP TABLE IF EXISTS "${name}"`)
  }
  db.pragma('foreign_keys = ON')
  applyAllMigrations(db)
}
