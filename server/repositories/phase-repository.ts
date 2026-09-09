import type { Statement } from 'better-sqlite3'
import { db } from '../database.js'

export type PhaseRow = {
  id: string
  name: string
  epic_ref: string
  epic_description: string
  display_order: number
  source: string
  created_at: string
  updated_at: string
}

const COLUMNS = `id, name, epic_ref, epic_description, display_order,
  source, created_at, updated_at`

let selectAll: Statement | undefined
let upsert: Statement | undefined

export function getAllPhases(): PhaseRow[] {
  selectAll ??= db.prepare(`SELECT ${COLUMNS} FROM phases ORDER BY display_order`)
  return selectAll.all() as PhaseRow[]
}

export function upsertImportedPhase(row: {
  id: string
  name: string
  epic_ref: string
  epic_description: string
  display_order: number
}): void {
  upsert ??= db.prepare(`
    INSERT INTO phases (id, name, epic_ref, epic_description, display_order, source)
    VALUES (@id, @name, @epic_ref, @epic_description, @display_order, 'mapping')
    ON CONFLICT (id) DO UPDATE SET
      name             = excluded.name,
      epic_ref         = excluded.epic_ref,
      epic_description = excluded.epic_description,
      display_order    = excluded.display_order,
      updated_at       = datetime('now')
    WHERE phases.source != 'manual'
  `)
  upsert.run(row)
}
