import type { Statement } from 'better-sqlite3'
import { db } from '../database.js'

export type CapabilityRow = {
  id: number
  mvp_feature_id: number | null
  mvp_ref: number
  mvp_owner_ambiguous: number
  text: string
  actor: string
  release_id: string | null
  phase_id: string | null
  source_phase_label: string | null
  source: string
  created_at: string
  updated_at: string
}

const COLUMNS = `id, mvp_feature_id, mvp_ref, mvp_owner_ambiguous, text, actor,
  release_id, phase_id, source_phase_label, source, created_at, updated_at`

let selectAll: Statement | undefined
let selectByIdentity: Statement | undefined
let upsert: Statement | undefined

export function getAllCapabilities(): CapabilityRow[] {
  selectAll ??= db.prepare(`SELECT ${COLUMNS} FROM capabilities ORDER BY mvp_ref, id`)
  return selectAll.all() as CapabilityRow[]
}

/** Identity is (ref, case-insensitive text) — the dedup rule from PRD §11. */
export function findCapability(ref: number, text: string): CapabilityRow | undefined {
  selectByIdentity ??= db.prepare(
    `SELECT ${COLUMNS} FROM capabilities WHERE mvp_ref = ? AND LOWER(text) = LOWER(?)`,
  )
  return selectByIdentity.get(ref, text) as CapabilityRow | undefined
}

export function upsertImportedCapability(row: {
  mvp_feature_id: number | null
  mvp_ref: number
  mvp_owner_ambiguous: number
  text: string
  actor: string
  release_id: string | null
  phase_id: string | null
  source_phase_label: string | null
  source: string
}): void {
  upsert ??= db.prepare(`
    INSERT INTO capabilities (mvp_feature_id, mvp_ref, mvp_owner_ambiguous, text, actor,
                              release_id, phase_id, source_phase_label, source)
    VALUES (@mvp_feature_id, @mvp_ref, @mvp_owner_ambiguous, @text, @actor,
            @release_id, @phase_id, @source_phase_label, @source)
    ON CONFLICT (mvp_ref, LOWER(text)) DO UPDATE SET
      mvp_feature_id      = excluded.mvp_feature_id,
      mvp_owner_ambiguous = excluded.mvp_owner_ambiguous,
      actor               = excluded.actor,
      release_id          = excluded.release_id,
      phase_id            = excluded.phase_id,
      source_phase_label  = excluded.source_phase_label,
      source              = excluded.source,
      updated_at          = datetime('now')
    WHERE capabilities.source != 'manual'
  `)
  upsert.run(row)
}
