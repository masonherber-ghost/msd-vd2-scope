import type { Statement } from 'better-sqlite3'
import { db } from '../database.js'

export type FeatureMvpLinkRow = {
  pwc_feature_id: string
  mvp_feature_id: number
  source: string
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
}

let selectMvpLinks: Statement | undefined
let upsertMvpLink: Statement | undefined
let selectCapabilityLinks: Statement | undefined
let upsertCapabilityLink: Statement | undefined
let sumCitations: Statement | undefined

export function getAllFeatureMvpLinks(): FeatureMvpLinkRow[] {
  selectMvpLinks ??= db.prepare(
    `SELECT pwc_feature_id, mvp_feature_id, source
       FROM pwc_feature_mvp_features
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
  `)
  upsertMvpLink.run(row)
}

export function getAllFeatureCapabilityLinks(): FeatureCapabilityLinkRow[] {
  selectCapabilityLinks ??= db.prepare(
    `SELECT id, pwc_feature_id, capability_id, source_citations, matched,
            release_conflict, phase_conflict, feature_release_id, capability_release_id,
            feature_phase_label, capability_phase_label, phase_conflict_merged,
            resolution_state, resolution_note, resolved_at, source
       FROM pwc_feature_capabilities
      ORDER BY pwc_feature_id, capability_id`,
  )
  return selectCapabilityLinks.all() as FeatureCapabilityLinkRow[]
}

/** Total source citations across all edges — reconciles to the parsed link count. */
export function sumFeatureCapabilityCitations(): number {
  sumCitations ??= db.prepare(
    'SELECT IFNULL(SUM(source_citations), 0) AS n FROM pwc_feature_capabilities',
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
  `)
  upsertCapabilityLink.run(row)
}
