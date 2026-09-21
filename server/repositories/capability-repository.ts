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
  /** A question someone raised about this capability, or null. */
  question: string | null
  source: string
  created_at: string
  updated_at: string
}

const COLUMNS = `id, mvp_feature_id, mvp_ref, mvp_owner_ambiguous, text, actor,
  release_id, phase_id, source_phase_label, question, source, created_at, updated_at`

let selectAll: Statement | undefined
let selectByIdentity: Statement | undefined
let upsert: Statement | undefined
let selectById: Statement | undefined
let insertOne: Statement | undefined
let deleteOne: Statement | undefined
let selectDependents: Statement | undefined
let selectBySourceText: Statement | undefined
let selectByText: Statement | undefined
let refreshImported: Statement | undefined
let selectOwnedByMvp: Statement | undefined
let releaseOwnership: Statement | undefined
let claimOwnership: Statement | undefined
let applyOwnership: ((mvpFeatureId: number, capabilityIds: number[]) => void) | undefined
let selectOwnedPlacement: Statement | undefined
let movePlacement: Statement | undefined
let applyMove: ((mvpFeatureId: number, patch: PlacementPatch) => number[]) | undefined

export function getAllCapabilities(): CapabilityRow[] {
  selectAll ??= db.prepare(`SELECT ${COLUMNS} FROM capabilities ORDER BY mvp_ref, id`)
  return selectAll.all() as CapabilityRow[]
}

/** Identity is (ref, case-insensitive text) — the dedup rule from PRD §11. */
/**
 * The row a document's capability belongs to.
 *
 * Matched on `source_text` — the wording the document used — not on `text`,
 * which someone may since have corrected. Falls back to `text` for a row
 * with no source text, which is one created by hand.
 */
export function findCapabilityBySourceText(
  ref: number,
  text: string,
): CapabilityRow | undefined {
  selectByIdentity ??= db.prepare(
    `SELECT ${COLUMNS} FROM capabilities
      WHERE mvp_ref = ? AND LOWER(COALESCE(source_text, text)) = LOWER(?)`,
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
  // Claimed by its source text first: a row someone has renamed no longer
  // matches on `text`, and inserting would leave a duplicate beside it.
  // COALESCE, so a row predating the source_text column — or created by
  // hand and never renamed — is still recognised by its own text.
  selectBySourceText ??= db.prepare(
    `SELECT id, source FROM capabilities
      WHERE mvp_ref = ? AND LOWER(COALESCE(source_text, text)) = LOWER(?)`,
  )
  const owner = selectBySourceText.get(row.mvp_ref, row.text) as
    | { id: number; source: string }
    | undefined

  if (owner) {
    // A manual row is left exactly as it is (R-11.4) — but it has still
    // claimed this source text, so nothing is inserted for it either.
    if (owner.source === 'manual') return
    refreshImported ??= db.prepare(`
      UPDATE capabilities
         SET mvp_feature_id      = @mvp_feature_id,
             mvp_owner_ambiguous = @mvp_owner_ambiguous,
             text                = @text,
             actor               = @actor,
             release_id          = @release_id,
             phase_id            = @phase_id,
             source_phase_label  = @source_phase_label,
             source              = @source,
             updated_at          = datetime('now')
       WHERE id = @id
    `)
    refreshImported.run({ ...row, id: owner.id })
    return
  }

  upsert ??= db.prepare(`
    INSERT INTO capabilities (mvp_feature_id, mvp_ref, mvp_owner_ambiguous, text, actor,
                              release_id, phase_id, source_phase_label, source, source_text)
    VALUES (@mvp_feature_id, @mvp_ref, @mvp_owner_ambiguous, @text, @actor,
            @release_id, @phase_id, @source_phase_label, @source, @text)
    ON CONFLICT (mvp_ref, LOWER(text)) DO UPDATE SET
      mvp_feature_id      = excluded.mvp_feature_id,
      mvp_owner_ambiguous = excluded.mvp_owner_ambiguous,
      actor               = excluded.actor,
      release_id          = excluded.release_id,
      phase_id            = excluded.phase_id,
      source_phase_label  = excluded.source_phase_label,
      source              = excluded.source,
      source_text         = excluded.source_text,
      updated_at          = datetime('now')
    WHERE capabilities.source != 'manual'
  `)
  upsert.run(row)
}

/** An existing capability with this exact wording under the same ref. */
export function findCapabilityByText(
  ref: number,
  text: string,
): CapabilityRow | undefined {
  selectByText ??= db.prepare(
    `SELECT ${COLUMNS} FROM capabilities WHERE mvp_ref = ? AND LOWER(text) = LOWER(?)`,
  )
  return selectByText.get(ref, text) as CapabilityRow | undefined
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
    /** Null clears the question. */
    question?: string | null
    /** Set when a hand-move needs the label to follow the phase. */
    source_phase_label?: string
  },
): CapabilityRow | undefined {
  const fields = Object.keys(patch) as (keyof typeof patch)[]
  if (fields.length === 0) return getCapabilityById(id)

  // `source` records where the capability's *content* came from, and marking
  // it manual stops the import refreshing the row. A question is an
  // annotation on top of the document's capability, not a change to it, so
  // asking one must not quietly freeze the row against future imports.
  const SOURCE_DERIVED = ['text', 'actor', 'release_id', 'phase_id'] as const
  const changesSource = fields.some((field) =>
    (SOURCE_DERIVED as readonly string[]).includes(field),
  )

  const assignments = fields.map((field) => `${field} = @${field}`).join(', ')
  return db
    .prepare(
      `UPDATE capabilities
          SET ${assignments}${changesSource ? ", source = 'manual'" : ''},
              updated_at = datetime('now')
        WHERE id = @id RETURNING ${COLUMNS}`,
    )
    .get({ ...patch, id }) as CapabilityRow | undefined
}

/** The capabilities this MSD feature record owns, in id order. */
export function getCapabilityIdsForMvpFeature(mvpFeatureId: number): number[] {
  selectOwnedByMvp ??= db.prepare(
    'SELECT id FROM capabilities WHERE mvp_feature_id = ? ORDER BY id',
  )
  return (selectOwnedByMvp.all(mvpFeatureId) as { id: number }[]).map((row) => row.id)
}

/**
 * Makes this MSD feature record the owner of exactly these capabilities, and
 * of no others. Capabilities it owned and no longer does are left ownerless
 * rather than moved somewhere — where they belong is the next decision, and
 * guessing at it is what D-3 exists to stop.
 *
 * `mvp_ref` is deliberately untouched. It records the ref the source document
 * cited; `mvp_feature_id` records which record of that ref owns it. Re-owning
 * by hand answers the second question, not the first — and keeping the ref is
 * what lets a later import still recognise the row (it matches on ref plus
 * source text).
 *
 * Either way the owner is now stated rather than chosen by rule, so
 * `mvp_owner_ambiguous` clears, and `source` becomes manual so the next import
 * does not quietly hand the row back to the ref's rule-chosen record.
 */
export function setMvpFeatureCapabilities(
  mvpFeatureId: number,
  capabilityIds: number[],
): void {
  releaseOwnership ??= db.prepare(`
    UPDATE capabilities
       SET mvp_feature_id = NULL, mvp_owner_ambiguous = 0,
           source = 'manual', updated_at = datetime('now')
     WHERE id = ?
  `)
  claimOwnership ??= db.prepare(`
    UPDATE capabilities
       SET mvp_feature_id = @mvp_feature_id, mvp_owner_ambiguous = 0,
           source = 'manual', updated_at = datetime('now')
     WHERE id = @id
  `)

  // Only what actually changes is written, so re-saving the same set is a
  // no-op rather than marking every row manual.
  applyOwnership ??= db.transaction((owner: number, ids: number[]) => {
    const wanted = new Set(ids)
    const current = new Set(getCapabilityIdsForMvpFeature(owner))
    for (const id of current) {
      if (!wanted.has(id)) releaseOwnership!.run(id)
    }
    for (const id of wanted) {
      if (!current.has(id)) claimOwnership!.run({ id, mvp_feature_id: owner })
    }
  })

  applyOwnership(mvpFeatureId, capabilityIds)
}

type PlacementPatch = {
  release_id?: string
  phase_id?: string
  /** The phase's name, so a hand-moved row carries the label of where it now is. */
  source_phase_label?: string
}

/**
 * Moves every capability this MSD feature record owns to a release, a stage,
 * or both — which is how an MSD feature is re-assigned. The record has no
 * placement of its own: it sits where the capabilities it owns sit, so moving
 * it means moving them.
 *
 * Only the axis given moves. Moving a record to another release leaves each
 * capability in its own stage, so a record whose capabilities straddle two
 * stages keeps that straddle instead of being silently collapsed into one
 * cell — the straddle is the kind of thing this app exists to show.
 *
 * Rows already at the target are skipped, so a re-save writes nothing and
 * does not mark an imported row manual.
 *
 * Returns the ids actually moved: their placement is shared with every PwC
 * feature citing them, so the caller has conflicts to recompute (PRD §16 P-2).
 */
export function moveCapabilitiesForMvpFeature(
  mvpFeatureId: number,
  patch: PlacementPatch,
): number[] {
  selectOwnedPlacement ??= db.prepare(
    `SELECT id, release_id, phase_id FROM capabilities
      WHERE mvp_feature_id = ? ORDER BY id`,
  )
  movePlacement ??= db.prepare(`
    UPDATE capabilities
       SET release_id         = COALESCE(@release_id, release_id),
           phase_id           = COALESCE(@phase_id, phase_id),
           source_phase_label = CASE WHEN @phase_id IS NULL
                                     THEN source_phase_label
                                     ELSE @source_phase_label END,
           source             = 'manual',
           updated_at         = datetime('now')
     WHERE id = @id
  `)

  applyMove ??= db.transaction((owner: number, values: PlacementPatch) => {
    const rows = selectOwnedPlacement!.all(owner) as {
      id: number
      release_id: string | null
      phase_id: string | null
    }[]
    const moved: number[] = []
    for (const row of rows) {
      const changesRelease =
        values.release_id !== undefined && values.release_id !== row.release_id
      const changesPhase = values.phase_id !== undefined && values.phase_id !== row.phase_id
      if (!changesRelease && !changesPhase) continue

      movePlacement!.run({
        id: row.id,
        release_id: changesRelease ? values.release_id : null,
        phase_id: changesPhase ? values.phase_id : null,
        source_phase_label: values.source_phase_label ?? null,
      })
      moved.push(row.id)
    }
    return moved
  })

  return applyMove(mvpFeatureId, patch)
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
