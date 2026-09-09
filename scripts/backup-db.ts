import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

const here = path.dirname(fileURLToPath(import.meta.url))
const SERVER_DIR = path.join(here, '..', 'server')
const DB_PATH = process.env.DB_PATH ?? path.join(SERVER_DIR, 'msd-vd2-scope.db')
const BACKUPS_DIR = path.join(SERVER_DIR, 'backups')

if (!fs.existsSync(DB_PATH)) {
  console.error(`No database found at ${DB_PATH}. Start the server once to create it.`)
  process.exit(1)
}

fs.mkdirSync(BACKUPS_DIR, { recursive: true })

// 2026-09-09T14-32-05 — filesystem-safe and lexically sortable.
const stamp = new Date().toISOString().replace(/\..+$/, '').replace(/:/g, '-')
const filename = `msd-vd2-scope-${stamp}.db`
const target = path.join(BACKUPS_DIR, filename)

// VACUUM INTO, not copyFileSync: in WAL mode recent commits live in the -wal
// file, so copying the .db alone produces a snapshot that is missing data —
// silently, and it still opens as a valid database.
const db = new Database(DB_PATH, { readonly: true })
try {
  db.prepare('VACUUM INTO ?').run(target)
} finally {
  db.close()
}

// Prove the snapshot is readable rather than trusting that it is.
const verify = new Database(target, { readonly: true })
let tables: number
try {
  const row = verify
    .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table'")
    .get() as { n: number }
  tables = row.n
} finally {
  verify.close()
}

const bytes = fs.statSync(target).size
const size =
  bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / 1024 / 1024).toFixed(2)} MB`
const count = fs.readdirSync(BACKUPS_DIR).filter((f) => f.endsWith('.db')).length

console.log(`Backup written: ${filename}`)
console.log(`Size:           ${size}`)
console.log(`Tables:         ${tables}`)
console.log(`Total backups:  ${count}`)
