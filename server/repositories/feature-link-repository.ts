import type { Statement } from 'better-sqlite3'
import { db } from '../database.js'

export type FeatureMvpLinkRow = {
  pwc_feature_id: string
  mvp_feature_id: number
  source: string
  removed_at: string | null
}

export type FeatureCapabilityLinkRow = {
  id: number
  pwc_feature_id: string
  capability_id: number
  source_citations: number
  matched: number
  release_conflict: number
  phase_conflict: number
  feature_release_id: string | null
  capability_release_id: string | null
  feature_phase_label: string | null
  capability_phase_label: string | null
  phase_conflict_merged: number
  resolution_state: string
  resolution_note: string | null
  resolved_at: string | null
  source: string
  removed_at: string | null
}

let selectMvpLinks: Statement | undefined
let upsertMvpLink: Statement | undefined
let selectCapabilityLinks: Statement | undefined
let upsertCapabilityLink: Statement | undefined
let sumCitations: Statement | undefined
let addMvpLink: Statement | undefined
let removeMvpLink: Statement | undefined
let addCapabilityLink: Statement | undefined
let removeCapabilityLink: Statement | undefined
let liveMvpLinksFor: Statement | undefined
let liveCapabilityLinksFor: Statement | undefined
let selectLink: Statement | undefined
let setResolution: Statement | undefined

export function getAllFeatureMvpLinks(): FeatureMvpLinkRow[] {
  selectMvpLinks ??= db.prepare(
    `SELECT pwc_feature_id, mvp_feature_id, source, removed_at
       FROM pwc_feature_mvp_features
      WHERE removed_at IS NULL
      ORDER BY pwc_feature_id, mvp_feature_id`,
  )
  return selectMvpLinks.all() as FeatureMvpLinkRow[]
}

export function upsertImportedFeatureMvpLink(row: {
  pwc_feature_id: string
  mvp_feature_id: number
}): void {
  upsertMvpLink ??= db.prepare(`
    INSERT INTO pwc_feature_mvp_features (pwc_feature_id, mvp_feature_id, source)
    VALUES (@pwc_feature_id, @mvp_feature_id, 'mapping')
    ON CONFLICT (pwc_feature_id, mvp_feature_id) DO UPDATE SET
      updated_at = datetime('now')
    WHERE pwc_feature_mvp_features.source != 'manual'
      -- A tombstoned link stays removed; the user took it off deliberately.
      AND pwc_feature_mvp_features.removed_at IS NULL
  `)
  upsertMvpLink.run(row)
}

export function getAllFeatureCapabilityLinks(): FeatureCapabilityLinkRow[] {
  selectCapabilityLinks ??= db.prepare(
    `SELECT id, pwc_feature_id, capability_id, source_citations, matched,
            release_conflict, phase_conflict, feature_release_id, capability_release_id,
            feature_phase_label, capability_phase_label, phase_conflict_merged,
            resolution_state, resolution_note, resolved_at, source, removed_at
       FROM pwc_feature_capabilities
      WHERE removed_at IS NULL
      ORDER BY pwc_feature_id, capability_id`,
  )
  return selectCapabilityLinks.all() as FeatureCapabilityLinkRow[]
}

/** Total source citations across all edges — reconciles to the parsed link count. */
export function sumFeatureCapabilityCitations(): number {
  sumCitations ??= db.prepare(
    'SELECT IFNULL(SUM(source_citations), 0) AS n FROM pwc_feature_capabilities WHERE removed_at IS NULL',
  )
  return (sumCitations.get() as { n: number }).n
}

/**
 * Import refreshes the conflict columns, but never touches a link whose
 * conflict a human has already resolved, nor a manual link (R-11.4).
 */
export function upsertImportedFeatureCapabilityLink(row: {
  pwc_feature_id: string
  capability_id: number
  source_citations: number
  matched: number
  release_conflict: number
  phase_conflict: number
  feature_release_id: string | null
  capability_release_id: string | null
  feature_phase_label: string | null
  capability_phase_label: string | null
  phase_conflict_merged: number
}): void {
  upsertCapabilityLink ??= db.prepare(`
    INSERT INTO pwc_feature_capabilities (
      pwc_feature_id, capability_id, source_citations, matched,
      release_conflict, phase_conflict, feature_release_id, capability_release_id,
      feature_phase_label, capability_phase_label, phase_conflict_merged, source
    ) VALUES (
      @pwc_feature_id, @capability_id, @source_citations, @matched,
      @release_conflict, @phase_conflict, @feature_release_id, @capability_release_id,
      @feature_phase_label, @capability_phase_label, @phase_conflict_merged, 'mapping'
    )
    ON CONFLICT (pwc_feature_id, capability_id) DO UPDATE SET
      source_citations       = excluded.source_citations,
      matched                = excluded.matched,
      release_conflict       = excluded.release_conflict,
      phase_conflict         = excluded.phase_conflict,
      feature_release_id     = excluded.feature_release_id,
      capability_release_id  = excluded.capability_release_id,
      feature_phase_label    = excluded.feature_phase_label,
      capability_phase_label = excluded.capability_phase_label,
      phase_conflict_merged  = excluded.phase_conflict_merged,
      updated_at             = datetime('now')
    WHERE pwc_feature_capabilities.source != 'manual'
      AND pwc_feature_capabilities.resolution_state = 'unreviewed'
      -- A tombstoned link stays removed (R-9.10).
      AND pwc_feature_capabilities.removed_at IS NULL
  `)
  upsertCapabilityLink.run(row)
}

// ---------------------------------------------------------------------------
// Manual link editing
// ---------------------------------------------------------------------------

/** Live MVP feature ids linked to a feature. */
export function getMvpFeatureIdsFor(featureId: string): number[] {
  liveMvpLinksFor ??= db.prepare(
    `SELECT mvp_feature_id FROM pwc_feature_mvp_features
      WHERE pwc_feature_id = ? AND removed_at IS NULL`,
  )
  return (liveMvpLinksFor.all(featureId) as { mvp_feature_id: number }[]).map(
    (r) => r.mvp_feature_id,
  )
}

/** Live capability ids linked to a feature. */
export function getCapabilityIdsFor(featureId: string): number[] {
  liveCapabilityLinksFor ??= db.prepare(
    `SELECT capability_id FROM pwc_feature_capabilities
      WHERE pwc_feature_id = ? AND removed_at IS NULL`,
  )
  return (liveCapabilityLinksFor.all(featureId) as { capability_id: number }[]).map(
    (r) => r.capability_id,
  )
}

/** Adds a link, or revives one the user had removed. */
export function linkMvpFeature(featureId: string, mvpFeatureId: number): void {
  addMvpLink ??= db.prepare(`
    INSERT INTO pwc_feature_mvp_features (pwc_feature_id, mvp_feature_id, source)
    VALUES (?, ?, 'manual')
    ON CONFLICT (pwc_feature_id, mvp_feature_id) DO UPDATE SET
      removed_at = NULL,
      source     = 'manual',
      updated_at = datetime('now')
  `)
  addMvpLink.run(featureId, mvpFeatureId)
}

export function unlinkMvpFeature(featureId: string, mvpFeatureId: number): void {
  removeMvpLink ??= db.prepare(`
    UPDATE pwc_feature_mvp_features
       SET removed_at = datetime('now'), updated_at = datetime('now')
     WHERE pwc_feature_id = ? AND mvp_feature_id = ?
  `)
  removeMvpLink.run(featureId, mvpFeatureId)
}

export function linkCapability(featureId: string, capabilityId: number): void {
  addCapabilityLink ??= db.prepare(`
    INSERT INTO pwc_feature_capabilities (pwc_feature_id, capability_id, source, matched)
    VALUES (?, ?, 'manual', 1)
    ON CONFLICT (pwc_feature_id, capability_id) DO UPDATE SET
      removed_at = NULL,
      updated_at = datetime('now')
  `)
  addCapabilityLink.run(featureId, capabilityId)
}

export function unlinkCapability(featureId: string, capabilityId: number): void {
  removeCapabilityLink ??= db.prepare(`
    UPDATE pwc_feature_capabilities
       SET removed_at = datetime('now'), updated_at = datetime('now')
     WHERE pwc_feature_id = ? AND capability_id = ?
  `)
  removeCapabilityLink.run(featureId, capabilityId)
}

/**
 * Replaces a feature's MVP links with exactly this set, in one transaction.
 * Removals are tombstoned rather than deleted, so a re-import cannot undo them.
 */
export function setMvpFeatureLinks(featureId: string, mvpFeatureIds: number[]): void {
  const wanted = new Set(mvpFeatureIds)
  db.transaction(() => {
    for (const existing of getMvpFeatureIdsFor(featureId)) {
      if (!wanted.has(existing)) unlinkMvpFeature(featureId, existing)
    }
    for (const id of wanted) linkMvpFeature(featureId, id)
  })()
}

export function setCapabilityLinks(featureId: string, capabilityIds: number[]): void {
  const wanted = new Set(capabilityIds)
  db.transaction(() => {
    for (const existing of getCapabilityIdsFor(featureId)) {
      if (!wanted.has(existing)) unlinkCapability(featureId, existing)
    }
    for (const id of wanted) linkCapability(featureId, id)
  })()
}

export function getFeatureCapabilityLink(
  id: number,
): FeatureCapabilityLinkRow | undefined {
  selectLink ??= db.prepare(
    `SELECT id, pwc_feature_id, capability_id, source_citations, matched,
            release_conflict, phase_conflict, feature_release_id, capability_release_id,
            feature_phase_label, capability_phase_label, phase_conflict_merged,
            resolution_state, resolution_note, resolved_at, source, removed_at
       FROM pwc_feature_capabilities WHERE id = ?`,
  )
  return selectLink.get(id) as FeatureCapabilityLinkRow | undefined
}

/**
 * Records a human's decision about a conflict (R-7.2, R-7.3). Neither
 * placement is changed — the conflict stays visible, it just stops being
 * unreviewed, and a later import will not overwrite the decision (R-11.4).
 */
export function resolveConflict(
  id: number,
  state: string,
  note: string | null,
): FeatureCapabilityLinkRow | undefined {
  setResolution ??= db.prepare(`
    UPDATE pwc_feature_capabilities
       SET resolution_state = @state,
           resolution_note  = @note,
           -- Returning a conflict to unreviewed clears the timestamp too,
           -- so "resolved_at is set" always means "someone decided".
           resolved_at      = CASE WHEN @state = 'unreviewed'
                                   THEN NULL ELSE datetime('now') END,
           updated_at       = datetime('now')
     WHERE id = @id
  `)
  setResolution.run({ id, state, note })
  return getFeatureCapabilityLink(id)
}
