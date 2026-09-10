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
let countManualLinks: Statement | undefined
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

/**
 * Drops imported MVP records the sources no longer produce — the case an
 * option merge creates (OV-007/OV-008 fold each bare record onto its Option
 * 1A one). Without this a re-import leaves the bare record behind as an
 * orphan, and the split the merge exists to make would not have happened.
 *
 * Two guards, as with the release sweep: a manual record is never touched,
 * and a record something still depends on is kept and returned so the caller
 * can report it rather than hit a foreign key.
 *
 * "Depends on" deliberately excludes an *imported* feature link. Those cascade
 * on delete, and a link to a record the sources stopped producing is itself
 * stale — F-003's link to the bare 938 is exactly the row OV-007 replaced with
 * a link to 938/1A. A **manual** link still counts: someone made it on purpose.
 */
export function deleteImportedMvpFeaturesNotIn(
  keys: readonly { ref: number; scope_option: string | null }[],
): {
  deleted: { ref: number; scope_option: string | null }[]
  retained: { ref: number; scope_option: string | null; dependents: number }[]
} {
  const keep = new Set(keys.map((k) => `${k.ref}|${k.scope_option ?? ''}`))
  const rows = db
    .prepare(`SELECT ${COLUMNS} FROM mvp_features WHERE source != 'manual'`)
    .all() as MvpFeatureRow[]

  const deleted: { ref: number; scope_option: string | null }[] = []
  const retained: { ref: number; scope_option: string | null; dependents: number }[] = []

  countManualLinks ??= db.prepare(
    `SELECT COUNT(*) AS n FROM pwc_feature_mvp_features
      WHERE mvp_feature_id = ? AND source = 'manual'`,
  )

  for (const row of rows) {
    if (keep.has(`${row.ref}|${row.scope_option ?? ''}`)) continue
    const { capabilities } = countMvpFeatureDependents(row.id)
    const manualLinks = (countManualLinks.get(row.id) as { n: number }).n
    if (capabilities > 0 || manualLinks > 0) {
      retained.push({
        ref: row.ref,
        scope_option: row.scope_option,
        dependents: capabilities + manualLinks,
      })
      continue
    }
    // Imported feature links go with it, by ON DELETE CASCADE.
    deleteMvpFeature(row.id)
    deleted.push({ ref: row.ref, scope_option: row.scope_option })
  }

  return { deleted, retained }
}
