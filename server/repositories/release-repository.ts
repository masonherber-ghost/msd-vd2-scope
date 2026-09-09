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
let selectOne: Statement | undefined
let upsert: Statement | undefined
let countAll: Statement | undefined
let insertOne: Statement | undefined
let deleteOne: Statement | undefined
let selectDependents: Statement | undefined
let maxOrder: Statement | undefined

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

export function getRelease(id: string): ReleaseRow | undefined {
  selectOne ??= db.prepare(`SELECT ${COLUMNS} FROM releases WHERE id = ?`)
  return selectOne.get(id) as ReleaseRow | undefined
}

export function createRelease(row: {
  id: string
  label: string
  name: string
  description: string
}): ReleaseRow {
  maxOrder ??= db.prepare('SELECT IFNULL(MAX(display_order), 0) AS n FROM releases')
  const displayOrder = (maxOrder.get() as { n: number }).n + 1

  insertOne ??= db.prepare(`
    INSERT INTO releases (id, label, name, description, display_order,
                          in_mapping_source, in_sequencing_source, source)
    VALUES (@id, @label, @name, @description, @display_order, 0, 0, 'manual')
    RETURNING ${COLUMNS}
  `)
  return insertOne.get({ ...row, display_order: displayOrder }) as ReleaseRow
}

export function updateRelease(
  id: string,
  patch: { label?: string; name?: string; description?: string },
): ReleaseRow | undefined {
  const fields = Object.keys(patch) as (keyof typeof patch)[]
  if (fields.length === 0) return getRelease(id)
  // Column names come from the schema's key list, never from user input.
  const assignments = fields.map((field) => `${field} = @${field}`).join(', ')
  return db
    .prepare(
      `UPDATE releases SET ${assignments}, source = 'manual', updated_at = datetime('now')
        WHERE id = @id RETURNING ${COLUMNS}`,
    )
    .get({ ...patch, id }) as ReleaseRow | undefined
}

/** What would break if this release went (R-9.4). */
export function countReleaseDependents(id: string): {
  features: number
  capabilities: number
} {
  selectDependents ??= db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM pwc_features WHERE release_id = ?) AS features,
      (SELECT COUNT(*) FROM capabilities WHERE release_id = ?) AS capabilities
  `)
  return selectDependents.get(id, id) as { features: number; capabilities: number }
}

export function deleteRelease(id: string): number {
  deleteOne ??= db.prepare('DELETE FROM releases WHERE id = ?')
  return deleteOne.run(id).changes
}
