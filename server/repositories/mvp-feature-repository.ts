import type { Statement } from 'better-sqlite3'
import { db } from '../database.js'

export type MvpFeatureRow = {
  id: number
  ref: number
  scope_option: string | null
  title: string
  source: string
  created_at: string
  updated_at: string
}

const COLUMNS = 'id, ref, scope_option, title, source, created_at, updated_at'

let selectAll: Statement | undefined
let selectByRefOption: Statement | undefined
let upsert: Statement | undefined
let selectDependents: Statement | undefined
let selectById: Statement | undefined
let insertOne: Statement | undefined
let deleteOne: Statement | undefined

export function getAllMvpFeatures(): MvpFeatureRow[] {
  selectAll ??= db.prepare(
    `SELECT ${COLUMNS} FROM mvp_features ORDER BY ref, IFNULL(scope_option, '')`,
  )
  return selectAll.all() as MvpFeatureRow[]
}

export function findMvpFeature(
  ref: number,
  scopeOption: string | null,
): MvpFeatureRow | undefined {
  selectByRefOption ??= db.prepare(
    `SELECT ${COLUMNS} FROM mvp_features
      WHERE ref = ? AND IFNULL(scope_option, '') = IFNULL(?, '')`,
  )
  return selectByRefOption.get(ref, scopeOption) as MvpFeatureRow | undefined
}

/**
 * Upsert keyed on (ref, scope_option). The conflict target must use the same
 * IFNULL expression as the unique index, or SQLite cannot match it.
 */
export function upsertImportedMvpFeature(row: {
  ref: number
  scope_option: string | null
  title: string
  source: string
}): void {
  upsert ??= db.prepare(`
    INSERT INTO mvp_features (ref, scope_option, title, source)
    VALUES (@ref, @scope_option, @title, @source)
    ON CONFLICT (ref, IFNULL(scope_option, '')) DO UPDATE SET
      title      = excluded.title,
      source     = excluded.source,
      updated_at = datetime('now')
    WHERE mvp_features.source != 'manual'
  `)
  upsert.run(row)
}

/** Counts what depends on an MVP feature, for the R-9.4 delete guard. */
export function countMvpFeatureDependents(id: number): {
  features: number
  capabilities: number
} {
  selectDependents ??= db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM pwc_feature_mvp_features WHERE mvp_feature_id = ?) AS features,
      (SELECT COUNT(*) FROM capabilities WHERE mvp_feature_id = ?) AS capabilities
  `)
  return selectDependents.get(id, id) as { features: number; capabilities: number }
}

export function getMvpFeatureById(id: number): MvpFeatureRow | undefined {
  selectById ??= db.prepare(`SELECT ${COLUMNS} FROM mvp_features WHERE id = ?`)
  return selectById.get(id) as MvpFeatureRow | undefined
}

export function createMvpFeature(row: {
  ref: number
  scope_option: string | null
  title: string
}): MvpFeatureRow {
  insertOne ??= db.prepare(`
    INSERT INTO mvp_features (ref, scope_option, title, source)
    VALUES (@ref, @scope_option, @title, 'manual')
    RETURNING ${COLUMNS}
  `)
  return insertOne.get(row) as MvpFeatureRow
}

export function updateMvpFeature(
  id: number,
  patch: { title?: string; scope_option?: string | null },
): MvpFeatureRow | undefined {
  const fields = Object.keys(patch) as (keyof typeof patch)[]
  if (fields.length === 0) return getMvpFeatureById(id)
  const assignments = fields.map((field) => `${field} = @${field}`).join(', ')
  return db
    .prepare(
      `UPDATE mvp_features SET ${assignments}, source = 'manual', updated_at = datetime('now')
        WHERE id = @id RETURNING ${COLUMNS}`,
    )
    .get({ ...patch, id }) as MvpFeatureRow | undefined
}

export function deleteMvpFeature(id: number): number {
  deleteOne ??= db.prepare('DELETE FROM mvp_features WHERE id = ?')
  return deleteOne.run(id).changes
}
