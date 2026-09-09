import type { Statement } from 'better-sqlite3'
import { db } from '../database.js'

export type PwcFeatureRow = {
  id: string
  name: string
  foundational_build: string
  release_id: string
  phase_id: string
  source_phase_label: string | null
  capability_note: string | null
  display_order: number
  source: string
  created_at: string
  updated_at: string
}

const COLUMNS = `id, name, foundational_build, release_id, phase_id,
  source_phase_label, capability_note, display_order, source, created_at, updated_at`

let selectAll: Statement | undefined
let selectOne: Statement | undefined
let upsert: Statement | undefined
let insertOne: Statement | undefined
let deleteOne: Statement | undefined
let selectDependents: Statement | undefined
let selectIds: Statement | undefined
let selectMaxOrder: Statement | undefined

export function getAllPwcFeatures(): PwcFeatureRow[] {
  selectAll ??= db.prepare(`SELECT ${COLUMNS} FROM pwc_features ORDER BY display_order`)
  return selectAll.all() as PwcFeatureRow[]
}

export function upsertImportedPwcFeature(row: {
  id: string
  name: string
  foundational_build: string
  release_id: string
  phase_id: string
  source_phase_label: string | null
  capability_note: string | null
  display_order: number
}): void {
  upsert ??= db.prepare(`
    INSERT INTO pwc_features (id, name, foundational_build, release_id, phase_id,
                              source_phase_label, capability_note, display_order, source)
    VALUES (@id, @name, @foundational_build, @release_id, @phase_id,
            @source_phase_label, @capability_note, @display_order, 'mapping')
    ON CONFLICT (id) DO UPDATE SET
      name               = excluded.name,
      foundational_build = excluded.foundational_build,
      release_id         = excluded.release_id,
      phase_id           = excluded.phase_id,
      source_phase_label = excluded.source_phase_label,
      capability_note    = excluded.capability_note,
      display_order      = excluded.display_order,
      updated_at         = datetime('now')
    WHERE pwc_features.source != 'manual'
  `)
  upsert.run(row)
}

/** For the R-9.4 delete guard: what would be lost, and how much. */
export function countPwcFeatureDependents(id: string): {
  assumptions: number
  mvpLinks: number
  capabilityLinks: number
} {
  selectDependents ??= db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM assumptions WHERE pwc_feature_id = ?) AS assumptions,
      (SELECT COUNT(*) FROM pwc_feature_mvp_features WHERE pwc_feature_id = ?) AS mvpLinks,
      (SELECT COUNT(*) FROM pwc_feature_capabilities WHERE pwc_feature_id = ?) AS capabilityLinks
  `)
  return selectDependents.get(id, id, id) as {
    assumptions: number
    mvpLinks: number
    capabilityLinks: number
  }
}

export function getPwcFeature(id: string): PwcFeatureRow | undefined {
  selectOne ??= db.prepare(`SELECT ${COLUMNS} FROM pwc_features WHERE id = ?`)
  return selectOne.get(id) as PwcFeatureRow | undefined
}

/**
 * The next unused F- number. Feature ids are sparse by design — F-004, F-012
 * and others are absent and the gaps carry no meaning — so this fills the
 * lowest gap rather than continuing past the maximum, and is offered as a
 * default the user can override (PRD §6).
 */
export function nextFreeFeatureId(): string {
  selectIds ??= db.prepare('SELECT id FROM pwc_features ORDER BY id')
  const taken = new Set(
    (selectIds.all() as { id: string }[])
      .map((row) => Number(row.id.slice(2)))
      .filter((n) => Number.isInteger(n)),
  )
  let candidate = 1
  while (taken.has(candidate)) candidate += 1
  return `F-${String(candidate).padStart(3, '0')}`
}

/** A manually created feature sorts after the imported ones. */
export function createPwcFeature(row: {
  id: string
  name: string
  foundational_build: string
  release_id: string
  phase_id: string
  capability_note: string | null
}): PwcFeatureRow {
  selectMaxOrder ??= db.prepare(
    'SELECT IFNULL(MAX(display_order), 0) AS n FROM pwc_features',
  )
  const displayOrder = (selectMaxOrder.get() as { n: number }).n + 1

  insertOne ??= db.prepare(`
    INSERT INTO pwc_features (id, name, foundational_build, release_id, phase_id,
                              source_phase_label, capability_note, display_order, source)
    VALUES (@id, @name, @foundational_build, @release_id, @phase_id,
            NULL, @capability_note, @display_order, 'manual')
    RETURNING ${COLUMNS}
  `)
  return insertOne.get({ ...row, display_order: displayOrder }) as PwcFeatureRow
}

/**
 * Patches only the columns supplied. Editing a row marks it `manual`, so
 * provenance survives and a later import will not overwrite the edit
 * (R-9.9, R-11.4).
 */
export function updatePwcFeature(
  id: string,
  patch: {
    name?: string
    foundational_build?: string
    release_id?: string
    phase_id?: string
    capability_note?: string | null
  },
): PwcFeatureRow | undefined {
  const fields = Object.keys(patch) as (keyof typeof patch)[]
  if (fields.length === 0) return getPwcFeature(id)

  // Column names come from the schema's own key list, never from user input.
  const assignments = fields.map((field) => `${field} = @${field}`).join(', ')
  const statement = db.prepare(`
    UPDATE pwc_features
       SET ${assignments}, source = 'manual', updated_at = datetime('now')
     WHERE id = @id
    RETURNING ${COLUMNS}
  `)
  return statement.get({ ...patch, id }) as PwcFeatureRow | undefined
}

/**
 * Deletes a feature. Assumptions and join rows cascade; nothing else is
 * touched. The caller decides whether that cascade is allowed (R-9.4).
 */
export function deletePwcFeature(id: string): number {
  deleteOne ??= db.prepare('DELETE FROM pwc_features WHERE id = ?')
  return deleteOne.run(id).changes
}
