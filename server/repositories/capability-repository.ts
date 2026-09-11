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
let selectById: Statement | undefined
let insertOne: Statement | undefined
let deleteOne: Statement | undefined
let selectDependents: Statement | undefined

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

export function getCapabilityById(id: number): CapabilityRow | undefined {
  selectById ??= db.prepare(`SELECT ${COLUMNS} FROM capabilities WHERE id = ?`)
  return selectById.get(id) as CapabilityRow | undefined
}

export function createCapability(row: {
  mvp_ref: number
  mvp_feature_id: number | null
  text: string
  actor: string
  release_id: string
  phase_id: string
}): CapabilityRow {
  insertOne ??= db.prepare(`
    INSERT INTO capabilities (mvp_feature_id, mvp_ref, mvp_owner_ambiguous, text, actor,
                              release_id, phase_id, source_phase_label, source)
    VALUES (@mvp_feature_id, @mvp_ref, 0, @text, @actor,
            @release_id, @phase_id, NULL, 'manual')
    RETURNING ${COLUMNS}
  `)
  return insertOne.get(row) as CapabilityRow
}

export function updateCapability(
  id: number,
  patch: {
    text?: string
    actor?: string
    release_id?: string
    phase_id?: string
    /** Set when a hand-move needs the label to follow the phase. */
    source_phase_label?: string
  },
): CapabilityRow | undefined {
  const fields = Object.keys(patch) as (keyof typeof patch)[]
  if (fields.length === 0) return getCapabilityById(id)
  const assignments = fields.map((field) => `${field} = @${field}`).join(', ')
  return db
    .prepare(
      `UPDATE capabilities SET ${assignments}, source = 'manual', updated_at = datetime('now')
        WHERE id = @id RETURNING ${COLUMNS}`,
    )
    .get({ ...patch, id }) as CapabilityRow | undefined
}

/** Live feature links pointing at this capability (R-9.4). */
export function countCapabilityDependents(id: number): { features: number } {
  selectDependents ??= db.prepare(
    `SELECT COUNT(*) AS features FROM pwc_feature_capabilities
      WHERE capability_id = ? AND removed_at IS NULL`,
  )
  return selectDependents.get(id) as { features: number }
}

export function deleteCapability(id: number): number {
  deleteOne ??= db.prepare('DELETE FROM capabilities WHERE id = ?')
  return deleteOne.run(id).changes
}
