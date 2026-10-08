import {
  Draft,
  recomputeAllConflicts,
  sqlLower,
  type Plan,
  type PlanContext,
} from '../../src/lib/scope-plan.js'
import type {
  StoredCapability,
  StoredFeatureCapabilityLink,
  StoredMvpFeature,
  StoredPwcFeature,
} from '../../src/lib/scope-records.js'
import type { MergedMvpFeature, ReconcileResult } from '../../server/services/reconcile.js'
import { findCountDrift } from '../../server/services/scope-source.js'

/**
 * Re-import, planned against the store: what server/services/importer.ts did
 * to SQLite, done to the stored documents. Pure — the caller reads the store,
 * plans, and commits the result.
 *
 * Additive and non-destructive (R-11.4): a row whose source is `manual`, a
 * link whose conflict has been resolved, a tombstoned link, and notes edited
 * in the app are never overwritten. Each SQLite UPSERT is spelled out as
 * find → insert, or update unless protected.
 */

/**
 * The source's ordered assumptions as a numbered markdown list — the form a
 * feature's notes take until someone edits them.
 */
export function assumptionsToMarkdown(assumptions: { position: number; text: string }[]): string {
  return [...assumptions]
    .sort((a, b) => a.position - b.position)
    .map((a, index) => `${index + 1}. ${a.text}`)
    .join('\n')
}

export class ImportDriftError extends Error {
  drift: { key: string; expected: number; actual: number }[]

  constructor(drift: { key: string; expected: number; actual: number }[]) {
    super(
      `Import aborted — ${drift.length} count(s) drifted from the expected reconciliation: ` +
        drift.map((d) => `${d.key} got ${d.actual}, expected ${d.expected}`).join('; '),
    )
    this.name = 'ImportDriftError'
    this.drift = drift
  }
}

export type ImportSummary = {
  releases: number
  phases: number
  pwcFeatures: number
  assumptions: number
  mvpFeatures: number
  capabilities: number
  featureMvpLinks: number
  /** Distinct (feature, capability) edges written. */
  featureCapabilityEdges: number
  /** Sum of source_citations across live edges — reconciles to parsed links. */
  featureCapabilityCitations: number
  /** Edges collapsed because one feature cited the same capability twice. */
  collapsedDuplicateCitations: number
  /** Capabilities whose MVP owner was chosen by rule, not stated (D-3). */
  ambiguousMvpOwners: number
  releaseConflicts: number
  phaseConflicts: number
  unmatchedLinks: number
  /** Imported releases the sources no longer name, dropped on re-import. */
  removedReleases: string[]
  /** Stale releases kept because rows still point at them. */
  retainedStaleReleases: { id: string; features: number; capabilities: number }[]
  /** Imported MVP records the sources no longer produce, dropped on re-import. */
  removedMvpFeatures: { ref: number; scope_option: string | null }[]
  /** Stale MVP records kept because rows still point at them. */
  retainedStaleMvpFeatures: { ref: number; scope_option: string | null; dependents: number }[]
}

/**
 * Chooses the MVP record that owns a capability.
 *
 * A ref can carry more than one record (938 and 946 each have a bare record
 * alongside Option 1A; 951 has 1A and 1B). The source never says which one a
 * capability belongs to, so the choice is by rule and flagged: prefer the
 * option-agnostic bare record, otherwise the lowest option (D-3).
 */
export function chooseMvpOwner(candidates: MergedMvpFeature[]): {
  owner: MergedMvpFeature | null
  ambiguous: boolean
} {
  if (candidates.length === 0) return { owner: null, ambiguous: false }
  if (candidates.length === 1) return { owner: candidates[0], ambiguous: false }

  const bare = candidates.find((c) => c.scopeOption === null)
  if (bare) return { owner: bare, ambiguous: true }

  const byOption = [...candidates].sort((a, b) =>
    (a.scopeOption ?? '').localeCompare(b.scopeOption ?? ''),
  )
  return { owner: byOption[0], ambiguous: true }
}

const linkKey = (featureId: string, capabilityKey: string) => `${featureId}||${capabilityKey}`

const findMvp = (d: Draft, ref: number, option: string | null) =>
  d.data.mvpFeatures.find((m) => m.ref === ref && (m.scope_option ?? '') === (option ?? ''))

/** A document's capability, matched on the wording the document used (source_text). */
const findBySourceText = (d: Draft, ref: number, text: string) =>
  d.data.capabilities.find(
    (c) => c.mvp_ref === ref && sqlLower(c.source_text ?? c.text) === sqlLower(text),
  )

export function planImport(ctx: PlanContext, result: ReconcileResult): Plan<ImportSummary> {
  const drift = findCountDrift(result)
  if (drift.length > 0) throw new ImportDriftError(drift)

  const d = new Draft(ctx)
  const now = d.now

  const recordsByRef = new Map<number, MergedMvpFeature[]>()
  for (const record of result.mvpFeatures) {
    recordsByRef.set(record.ref, [...(recordsByRef.get(record.ref) ?? []), record])
  }

  const releaseConflictByLink = new Map(
    result.conflicts.release.map((c) => [linkKey(c.pwcFeatureId, c.capabilityKey), c]),
  )
  const phaseConflictByLink = new Map(
    result.conflicts.phase.map((c) => [linkKey(c.pwcFeatureId, c.capabilityKey), c]),
  )

  // One feature can cite the same capability twice (F-079 cites both casings
  // of ref 980). That is one edge carrying two citations, not two edges.
  const edges = new Map<
    string,
    { featureId: string; capabilityKey: string; matched: boolean; citations: number }
  >()
  for (const link of result.featureCapabilityLinks) {
    const key = linkKey(link.pwcFeatureId, link.capabilityKey)
    const existing = edges.get(key)
    if (existing) existing.citations += 1
    else {
      edges.set(key, {
        featureId: link.pwcFeatureId,
        capabilityKey: link.capabilityKey,
        matched: link.matched,
        citations: 1,
      })
    }
  }
  const collapsedDuplicateCitations = result.featureCapabilityLinks.length - edges.size

  // ---- Releases ------------------------------------------------------------
  for (const release of result.releases) {
    const values = {
      label: release.label,
      name: release.name,
      description: release.description,
      display_order: release.displayOrder,
      in_mapping_source: release.inMappingSource ? 1 : 0,
      in_sequencing_source: release.inSequencingSource ? 1 : 0,
      source:
        release.inMappingSource && release.inSequencingSource
          ? 'both'
          : release.inMappingSource
            ? 'mapping'
            : 'sequencing',
    }
    const row = d.data.releases.find((r) => r.id === release.id)
    if (!row) {
      d.insert('releases', { id: release.id, ...values, created_at: now, updated_at: now })
    } else if (row.source !== 'manual') {
      d.update('releases', row, { ...values, updated_at: now })
    }
  }

  // Imported releases the sources no longer name. Swept here, as the
  // server did — before the features below are re-pointed — so a release
  // something still points at is retained and reported, not deleted.
  const ids = new Set(result.releases.map((r) => r.id))
  const removedReleases: string[] = []
  const retainedStaleReleases: ImportSummary['retainedStaleReleases'] = []
  const staleReleases = d.data.releases
    .filter((r) => r.source !== 'manual' && !ids.has(r.id))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  for (const release of staleReleases) {
    const features = d.data.pwcFeatures.filter((f) => f.release_id === release.id).length
    const capabilities = d.data.capabilities.filter((c) => c.release_id === release.id).length
    if (features > 0 || capabilities > 0) {
      retainedStaleReleases.push({ id: release.id, features, capabilities })
      continue
    }
    d.remove('releases', release)
    removedReleases.push(release.id)
  }

  // ---- Phases --------------------------------------------------------------
  for (const phase of result.phases) {
    const values = {
      name: phase.name,
      epic_ref: phase.epicRef,
      epic_description: phase.epicDescription,
      display_order: phase.displayOrder,
    }
    const row = d.data.phases.find((p) => p.id === phase.id)
    if (!row) {
      d.insert('phases', { id: phase.id, ...values, source: 'mapping', created_at: now, updated_at: now })
    } else if (row.source !== 'manual') {
      d.update('phases', row, { ...values, updated_at: now })
    }
  }

  // ---- MVP records ---------------------------------------------------------
  for (const mvp of result.mvpFeatures) {
    const row = findMvp(d, mvp.ref, mvp.scopeOption)
    if (!row) {
      d.insert('mvpFeatures', {
        id: d.nextId('mvp_features'),
        ref: mvp.ref,
        scope_option: mvp.scopeOption,
        title: mvp.title,
        release_id: null,
        phase_id: null,
        question: null,
        details: '',
        source: mvp.source,
        created_at: now,
        updated_at: now,
      } satisfies StoredMvpFeature)
    } else if (row.source !== 'manual') {
      d.update('mvpFeatures', row, { title: mvp.title, source: mvp.source, updated_at: now })
    }
  }

  // ---- Capabilities --------------------------------------------------------
  let ambiguousMvpOwners = 0
  for (const capability of result.capabilities) {
    const { owner, ambiguous } = chooseMvpOwner(recordsByRef.get(capability.ref) ?? [])
    if (ambiguous) ambiguousMvpOwners += 1
    const ownerRow = owner ? findMvp(d, owner.ref, owner.scopeOption) : undefined

    const values = {
      mvp_feature_id: ownerRow?.id ?? null,
      mvp_owner_ambiguous: ambiguous ? 1 : 0,
      // The parser only produces the four actors the old CHECK constraint allowed.
      actor: capability.actor as StoredCapability['actor'],
      release_id: capability.releaseId,
      phase_id: capability.phaseId,
      source_phase_label: capability.sourcePhaseLabel,
      source: capability.source,
    }

    // Claimed by its source text first: a row someone has renamed no longer
    // matches on `text`, and inserting would leave a duplicate beside it.
    const claimed = findBySourceText(d, capability.ref, capability.text)
    if (claimed) {
      // A manual row is left exactly as it is — but it has still claimed
      // this source text, so nothing is inserted for it either.
      if (claimed.source !== 'manual') {
        d.update('capabilities', claimed, { ...values, text: capability.text, updated_at: now })
      }
      continue
    }

    // The unique index on (mvp_ref, LOWER(text)): a row already carrying
    // this wording, but claimed by different source text, is refreshed in
    // place (its text left alone) unless it is manual.
    const sameText = d.data.capabilities.find(
      (c) => c.mvp_ref === capability.ref && sqlLower(c.text) === sqlLower(capability.text),
    )
    if (sameText) {
      if (sameText.source !== 'manual') {
        d.update('capabilities', sameText, {
          ...values,
          source_text: capability.text,
          updated_at: now,
        })
      }
      continue
    }

    d.insert('capabilities', {
      id: d.nextId('capabilities'),
      mvp_ref: capability.ref,
      text: capability.text,
      ...values,
      question: null,
      source_text: capability.text,
      created_at: now,
      updated_at: now,
    } satisfies StoredCapability)
  }

  // ---- PwC features and their notes -----------------------------------------
  for (const feature of result.features) {
    const values = {
      name: feature.name,
      foundational_build: feature.foundationalBuild,
      release_id: feature.releaseId,
      phase_id: feature.phaseId,
      source_phase_label: feature.sourcePhaseLabel,
      capability_note: feature.capabilityNote,
      display_order: feature.displayOrder,
    }
    let row = d.data.pwcFeatures.find((f) => f.id === feature.id)
    if (!row) {
      row = {
        id: feature.id,
        ...values,
        question: null,
        notes: '',
        notes_edited: 0,
        source: 'mapping',
        created_at: now,
        updated_at: now,
      } satisfies StoredPwcFeature
      d.insert('pwcFeatures', row)
    } else if (row.source !== 'manual') {
      d.update('pwcFeatures', row, { ...values, updated_at: now })
    }

    // An edit to the notes always survives re-import (R-11.4).
    const notes = assumptionsToMarkdown(feature.assumptions)
    if (row.notes_edited === 0 && row.notes !== notes) {
      d.update('pwcFeatures', row, { notes, updated_at: now })
    }
  }

  // ---- Feature → MVP links ---------------------------------------------------
  for (const link of result.featureMvpLinks) {
    const mvp = findMvp(d, link.ref, link.scopeOption)
    if (!mvp) {
      throw new Error(`Import bug: MVP feature ${link.ref}/${link.scopeOption ?? 'bare'} missing`)
    }
    const row = d.data.featureMvpLinks.find(
      (l) => l.pwc_feature_id === link.pwcFeatureId && l.mvp_feature_id === mvp.id,
    )
    if (!row) {
      d.insert('featureMvpLinks', {
        pwc_feature_id: link.pwcFeatureId,
        mvp_feature_id: mvp.id,
        source: 'mapping',
        created_at: now,
        updated_at: now,
        removed_at: null,
      })
    } else if (row.source !== 'manual' && row.removed_at === null) {
      // A tombstoned link stays removed; the user took it off deliberately.
      d.update('featureMvpLinks', row, { updated_at: now })
    }
  }

  // ---- Feature → capability links ------------------------------------------
  const capabilityByKey = new Map(result.capabilities.map((c) => [c.key, c]))
  for (const edge of edges.values()) {
    const capability = capabilityByKey.get(edge.capabilityKey)
    if (!capability) throw new Error(`Import bug: capability ${edge.capabilityKey} missing`)
    const capRow = findBySourceText(d, capability.ref, capability.text)
    if (!capRow) throw new Error(`Import bug: capability row ${edge.capabilityKey} not written`)

    const key = linkKey(edge.featureId, edge.capabilityKey)
    const releaseConflict = releaseConflictByLink.get(key)
    const phaseConflict = phaseConflictByLink.get(key)
    const values = {
      source_citations: edge.citations,
      matched: edge.matched ? 1 : 0,
      release_conflict: releaseConflict ? 1 : 0,
      phase_conflict: phaseConflict ? 1 : 0,
      feature_release_id: releaseConflict?.featureReleaseId ?? null,
      capability_release_id: releaseConflict?.capabilityReleaseId ?? null,
      feature_phase_label: phaseConflict?.featurePhaseLabel ?? null,
      capability_phase_label: phaseConflict?.capabilityPhaseLabel ?? null,
      phase_conflict_merged: phaseConflict?.resolvedByCanonicalMerge ? 1 : 0,
    }

    const row = d.data.featureCapabilityLinks.find(
      (l) => l.pwc_feature_id === edge.featureId && l.capability_id === capRow.id,
    )
    if (!row) {
      d.insert('featureCapabilityLinks', {
        id: d.nextId('pwc_feature_capabilities'),
        pwc_feature_id: edge.featureId,
        capability_id: capRow.id,
        ...values,
        resolution_state: 'unreviewed',
        resolution_note: null,
        resolved_at: null,
        source: 'mapping',
        created_at: now,
        updated_at: now,
        removed_at: null,
      } satisfies StoredFeatureCapabilityLink)
    } else if (
      row.source !== 'manual' &&
      row.resolution_state === 'unreviewed' &&
      row.removed_at === null
    ) {
      d.update('featureCapabilityLinks', row, { ...values, updated_at: now })
    }
  }

  // Conflict flags describe the store, not the reconciled sources: a manually
  // moved row is protected above, but the flags written beside it come from a
  // model that never heard of the move. Settle them against what is written.
  recomputeAllConflicts(d)

  // ---- MVP record sweep — last, once links and owners are re-pointed ----------
  const keep = new Set(result.mvpFeatures.map((m) => `${m.ref}|${m.scopeOption ?? ''}`))
  const removedMvpFeatures: ImportSummary['removedMvpFeatures'] = []
  const retainedStaleMvpFeatures: ImportSummary['retainedStaleMvpFeatures'] = []
  const staleMvps = d.data.mvpFeatures
    .filter((m) => m.source !== 'manual' && !keep.has(`${m.ref}|${m.scope_option ?? ''}`))
    .sort((a, b) => a.id - b.id)
  for (const mvp of staleMvps) {
    const capabilities = d.data.capabilities.filter((c) => c.mvp_feature_id === mvp.id).length
    // An imported link to a record the sources stopped producing is itself
    // stale and goes with it; a manual one (tombstoned or not) was made on
    // purpose and keeps the record.
    const links = d.data.featureMvpLinks.filter((l) => l.mvp_feature_id === mvp.id)
    const manualLinks = links.filter((l) => l.source === 'manual').length
    if (capabilities > 0 || manualLinks > 0) {
      retainedStaleMvpFeatures.push({
        ref: mvp.ref,
        scope_option: mvp.scope_option,
        dependents: capabilities + manualLinks,
      })
      continue
    }
    for (const link of links) d.remove('featureMvpLinks', link)
    d.remove('mvpFeatures', mvp)
    removedMvpFeatures.push({ ref: mvp.ref, scope_option: mvp.scope_option })
  }

  return d.done({
    releases: result.releases.length,
    phases: result.phases.length,
    pwcFeatures: result.features.length,
    assumptions: result.assumptions.length,
    mvpFeatures: result.mvpFeatures.length,
    capabilities: result.capabilities.length,
    featureMvpLinks: result.featureMvpLinks.length,
    featureCapabilityEdges: edges.size,
    featureCapabilityCitations: d.data.featureCapabilityLinks
      .filter((l) => l.removed_at === null)
      .reduce((n, l) => n + l.source_citations, 0),
    collapsedDuplicateCitations,
    ambiguousMvpOwners,
    removedReleases,
    retainedStaleReleases,
    removedMvpFeatures,
    retainedStaleMvpFeatures,
    releaseConflicts: result.conflicts.release.length,
    phaseConflicts: result.conflicts.phase.length,
    unmatchedLinks: result.conflicts.unmatched.length,
  })
}
