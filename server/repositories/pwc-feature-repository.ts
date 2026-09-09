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
let upsert: Statement | undefined
let selectDependents: Statement | undefined

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
