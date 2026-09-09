import type { Statement } from 'better-sqlite3'
import { db } from '../database.js'

export type AssumptionRow = {
  id: number
  pwc_feature_id: string
  position: number
  text: string
  source: string
  created_at: string
  updated_at: string
}

const COLUMNS = 'id, pwc_feature_id, position, text, source, created_at, updated_at'

let selectAll: Statement | undefined
let selectByFeature: Statement | undefined
let insertOne: Statement | undefined
let deleteImportedForFeature: Statement | undefined
let renumber: Statement | undefined
let selectOne: Statement | undefined
let updateText: Statement | undefined
let deleteOne: Statement | undefined
let maxPosition: Statement | undefined

export function getAllAssumptions(): AssumptionRow[] {
  selectAll ??= db.prepare(
    `SELECT ${COLUMNS} FROM assumptions ORDER BY pwc_feature_id, position`,
  )
  return selectAll.all() as AssumptionRow[]
}

export function getAssumptionsForFeature(featureId: string): AssumptionRow[] {
  selectByFeature ??= db.prepare(
    `SELECT ${COLUMNS} FROM assumptions WHERE pwc_feature_id = ? ORDER BY position`,
  )
  return selectByFeature.all(featureId) as AssumptionRow[]
}

export function createAssumption(row: {
  pwc_feature_id: string
  position: number
  text: string
  source: string
}): AssumptionRow {
  insertOne ??= db.prepare(`
    INSERT INTO assumptions (pwc_feature_id, position, text, source)
    VALUES (@pwc_feature_id, @position, @text, @source)
    RETURNING ${COLUMNS}
  `)
  return insertOne.get(row) as AssumptionRow
}

/**
 * Import replaces a feature's imported assumptions wholesale, because they are
 * an ordered list with no stable natural key. Manually added ones are left
 * alone (R-11.4) and then renumbered so positions stay contiguous (R-9.3).
 */
export function replaceImportedAssumptions(
  featureId: string,
  texts: string[],
): void {
  deleteImportedForFeature ??= db.prepare(
    `DELETE FROM assumptions WHERE pwc_feature_id = ? AND source != 'manual'`,
  )
  deleteImportedForFeature.run(featureId)

  let position = 0
  for (const text of texts) {
    position += 1
    createAssumption({
      pwc_feature_id: featureId,
      position,
      text,
      source: 'mapping',
    })
  }
  renumberAssumptions(featureId)
}

/** Rewrites positions to a contiguous 1..n in current order (R-9.3). */
export function renumberAssumptions(featureId: string): void {
  renumber ??= db.prepare(`
    WITH ordered AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY position, id) AS rn
        FROM assumptions
       WHERE pwc_feature_id = ?
    )
    UPDATE assumptions
       SET position = (SELECT rn FROM ordered WHERE ordered.id = assumptions.id)
     WHERE pwc_feature_id = ?
  `)
  renumber.run(featureId, featureId)
}

export function getAssumption(id: number): AssumptionRow | undefined {
  selectOne ??= db.prepare(`SELECT ${COLUMNS} FROM assumptions WHERE id = ?`)
  return selectOne.get(id) as AssumptionRow | undefined
}

/** Appends a manual assumption to the end of its feature's list. */
export function appendAssumption(featureId: string, text: string): AssumptionRow {
  maxPosition ??= db.prepare(
    'SELECT IFNULL(MAX(position), 0) AS n FROM assumptions WHERE pwc_feature_id = ?',
  )
  const position = (maxPosition.get(featureId) as { n: number }).n + 1
  return createAssumption({
    pwc_feature_id: featureId,
    position,
    text,
    source: 'manual',
  })
}

export function updateAssumptionText(id: number, text: string): AssumptionRow | undefined {
  updateText ??= db.prepare(`
    UPDATE assumptions
       SET text = ?, source = 'manual', updated_at = datetime('now')
     WHERE id = ?
    RETURNING ${COLUMNS}
  `)
  return updateText.get(text, id) as AssumptionRow | undefined
}

/** Deletes and closes the gap, so positions stay contiguous (R-9.3). */
export function deleteAssumption(id: number): boolean {
  return db.transaction(() => {
    const row = getAssumption(id)
    if (!row) return false
    deleteOne ??= db.prepare('DELETE FROM assumptions WHERE id = ?')
    deleteOne.run(id)
    renumberAssumptions(row.pwc_feature_id)
    return true
  })()
}

/**
 * Moves an assumption one step within its feature. Renumbering first means
 * the swap cannot be thrown off by a pre-existing gap, and the whole thing is
 * one transaction so a half-applied reorder cannot survive.
 */
export function moveAssumption(id: number, direction: 'up' | 'down'): boolean {
  return db.transaction(() => {
    const row = getAssumption(id)
    if (!row) return false
    renumberAssumptions(row.pwc_feature_id)

    const current = getAssumption(id)
    if (!current) return false

    const neighbour = db
      .prepare(
        direction === 'up'
          ? `SELECT ${COLUMNS} FROM assumptions
              WHERE pwc_feature_id = ? AND position < ?
              ORDER BY position DESC LIMIT 1`
          : `SELECT ${COLUMNS} FROM assumptions
              WHERE pwc_feature_id = ? AND position > ?
              ORDER BY position ASC LIMIT 1`,
      )
      .get(current.pwc_feature_id, current.position) as AssumptionRow | undefined
    if (!neighbour) return false

    const swap = db.prepare(
      "UPDATE assumptions SET position = ?, updated_at = datetime('now') WHERE id = ?",
    )
    swap.run(neighbour.position, current.id)
    swap.run(current.position, neighbour.id)
    renumberAssumptions(current.pwc_feature_id)
    return true
  })()
}
