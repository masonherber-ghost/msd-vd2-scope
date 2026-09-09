import type { Statement } from 'better-sqlite3'
import { db } from '../database.js'

export type ReleaseRow = {
  id: string
  label: string
  name: string
  description: string
  display_order: number
  in_mapping_source: number
  in_sequencing_source: number
  source: string
  created_at: string
  updated_at: string
}

const COLUMNS = `id, label, name, description, display_order,
  in_mapping_source, in_sequencing_source, source, created_at, updated_at`

let selectAll: Statement | undefined
let upsert: Statement | undefined
let countAll: Statement | undefined

export function getAllReleases(): ReleaseRow[] {
  selectAll ??= db.prepare(`SELECT ${COLUMNS} FROM releases ORDER BY display_order`)
  return selectAll.all() as ReleaseRow[]
}

export function countReleases(): number {
  countAll ??= db.prepare('SELECT COUNT(*) AS n FROM releases')
  return (countAll.get() as { n: number }).n
}

/** Additive import: an existing row is refreshed unless it is manual (R-11.4). */
export function upsertImportedRelease(row: {
  id: string
  label: string
  name: string
  description: string
  display_order: number
  in_mapping_source: boolean
  in_sequencing_source: boolean
  source: string
}): void {
  upsert ??= db.prepare(`
    INSERT INTO releases (id, label, name, description, display_order,
                          in_mapping_source, in_sequencing_source, source)
    VALUES (@id, @label, @name, @description, @display_order,
            @in_mapping_source, @in_sequencing_source, @source)
    ON CONFLICT (id) DO UPDATE SET
      label                = excluded.label,
      name                 = excluded.name,
      description          = excluded.description,
      display_order        = excluded.display_order,
      in_mapping_source    = excluded.in_mapping_source,
      in_sequencing_source = excluded.in_sequencing_source,
      source               = excluded.source,
      updated_at           = datetime('now')
    WHERE releases.source != 'manual'
  `)
  upsert.run({
    ...row,
    in_mapping_source: row.in_mapping_source ? 1 : 0,
    in_sequencing_source: row.in_sequencing_source ? 1 : 0,
  })
}
