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
let selectOne: Statement | undefined
let upsert: Statement | undefined
let insertOne: Statement | undefined
let deleteOne: Statement | undefined
let selectDependents: Statement | undefined
let maxOrder: Statement | undefined
let renumber: Statement | undefined

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

export function getPhase(id: string): PhaseRow | undefined {
  selectOne ??= db.prepare(`SELECT ${COLUMNS} FROM phases WHERE id = ?`)
  return selectOne.get(id) as PhaseRow | undefined
}

export function createPhase(row: {
  id: string
  name: string
  epic_ref: string
  epic_description: string
}): PhaseRow {
  maxOrder ??= db.prepare('SELECT IFNULL(MAX(display_order), 0) AS n FROM phases')
  const displayOrder = (maxOrder.get() as { n: number }).n + 1

  insertOne ??= db.prepare(`
    INSERT INTO phases (id, name, epic_ref, epic_description, display_order, source)
    VALUES (@id, @name, @epic_ref, @epic_description, @display_order, 'manual')
    RETURNING ${COLUMNS}
  `)
  return insertOne.get({ ...row, display_order: displayOrder }) as PhaseRow
}

export function updatePhase(
  id: string,
  patch: { name?: string; epic_ref?: string; epic_description?: string },
): PhaseRow | undefined {
  const fields = Object.keys(patch) as (keyof typeof patch)[]
  if (fields.length === 0) return getPhase(id)
  const assignments = fields.map((field) => `${field} = @${field}`).join(', ')
  return db
    .prepare(
      `UPDATE phases SET ${assignments}, source = 'manual', updated_at = datetime('now')
        WHERE id = @id RETURNING ${COLUMNS}`,
    )
    .get({ ...patch, id }) as PhaseRow | undefined
}

export function countPhaseDependents(id: string): {
  features: number
  capabilities: number
} {
  selectDependents ??= db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM pwc_features WHERE phase_id = ?) AS features,
      (SELECT COUNT(*) FROM capabilities WHERE phase_id = ?) AS capabilities
  `)
  return selectDependents.get(id, id) as { features: number; capabilities: number }
}

export function deletePhase(id: string): number {
  deleteOne ??= db.prepare('DELETE FROM phases WHERE id = ?')
  return deleteOne.run(id).changes
}

/** Rewrites display_order to a contiguous 1..n in current order (R-9.3). */
export function renumberPhases(): void {
  renumber ??= db.prepare(`
    WITH ordered AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY display_order, id) AS rn FROM phases
    )
    UPDATE phases SET display_order = (SELECT rn FROM ordered WHERE ordered.id = phases.id)
  `)
  renumber.run()
}

/**
 * Moves a phase one step and renumbers, in one transaction. Swapping two
 * display_order values directly would leave a gap if either write failed.
 */
export function movePhase(id: string, direction: 'up' | 'down'): boolean {
  return db.transaction(() => {
    renumberPhases()
    const phase = getPhase(id)
    if (!phase) return false

    const neighbour = db
      .prepare(
        direction === 'up'
          ? `SELECT ${COLUMNS} FROM phases WHERE display_order < ?
              ORDER BY display_order DESC LIMIT 1`
          : `SELECT ${COLUMNS} FROM phases WHERE display_order > ?
              ORDER BY display_order ASC LIMIT 1`,
      )
      .get(phase.display_order) as PhaseRow | undefined
    if (!neighbour) return false

    const swap = db.prepare(
      "UPDATE phases SET display_order = ?, updated_at = datetime('now') WHERE id = ?",
    )
    swap.run(neighbour.display_order, phase.id)
    swap.run(phase.display_order, neighbour.id)
    renumberPhases()
    return true
  })()
}
