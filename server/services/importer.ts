import { db } from '../database.js'
import { replaceImportedAssumptions } from '../repositories/assumption-repository.js'
import {
  findCapability,
  upsertImportedCapability,
} from '../repositories/capability-repository.js'
import {
  sumFeatureCapabilityCitations,
  upsertImportedFeatureCapabilityLink,
  upsertImportedFeatureMvpLink,
} from '../repositories/feature-link-repository.js'
import {
  deleteImportedMvpFeaturesNotIn,
  findMvpFeature,
  upsertImportedMvpFeature,
} from '../repositories/mvp-feature-repository.js'
import { upsertImportedPhase } from '../repositories/phase-repository.js'
import { upsertImportedPwcFeature } from '../repositories/pwc-feature-repository.js'
import {
  deleteImportedReleasesNotIn,
  upsertImportedRelease,
} from '../repositories/release-repository.js'
import type { MergedMvpFeature, ReconcileResult } from './reconcile.js'
import { findCountDrift, loadScopeFromSources } from './scope-source.js'
import type { ScopeOption } from './scope-types.js'

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
  /** Sum of source_citations across those edges — reconciles to parsed links. */
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
  retainedStaleMvpFeatures: {
    ref: number
    scope_option: string | null
    dependents: number
  }[]
}

/**
 * Chooses the MVP record that owns a capability.
 *
 * A ref can carry more than one record (938 and 946 each have a bare record
 * alongside Option 1A; 951 has 1A and 1B). The source never says which one a
 * capability belongs to, so the choice is by rule and flagged: prefer the
 * option-agnostic bare record, otherwise the lowest option. D-3 decides
 * whether the bare records should exist at all; because `mvp_ref` is stored
 * alongside the resolved id, changing that answer is an UPDATE, not a
 * migration.
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

type LinkKey = string
const linkKey = (featureId: string, capabilityKey: string): LinkKey =>
  `${featureId}||${capabilityKey}`

/**
 * Writes a reconciled scope graph into the database inside one transaction.
 * Additive and non-destructive: a row whose source is `manual`, or a link
 * whose conflict has been resolved, is never overwritten (R-11.4).
 */
export function importScope(result: ReconcileResult): ImportSummary {
  const drift = findCountDrift(result)
  if (drift.length > 0) throw new ImportDriftError(drift)

  // Group MVP records by ref so a capability's owner can be chosen.
  const recordsByRef = new Map<number, MergedMvpFeature[]>()
  for (const record of result.mvpFeatures) {
    const list = recordsByRef.get(record.ref) ?? []
    list.push(record)
    recordsByRef.set(record.ref, list)
  }

  // Conflict lookups, keyed per (feature, capability) edge.
  const releaseConflictByLink = new Map<LinkKey, (typeof result.conflicts.release)[number]>()
  for (const c of result.conflicts.release) {
    releaseConflictByLink.set(linkKey(c.pwcFeatureId, c.capabilityKey), c)
  }
  const phaseConflictByLink = new Map<LinkKey, (typeof result.conflicts.phase)[number]>()
  for (const c of result.conflicts.phase) {
    phaseConflictByLink.set(linkKey(c.pwcFeatureId, c.capabilityKey), c)
  }

  // One feature can cite the same capability twice (F-079 cites both casings
  // of ref 980). That is one edge carrying two citations, not two edges.
  const edges = new Map<
    LinkKey,
    { featureId: string; capabilityKey: string; matched: boolean; citations: number }
  >()
  for (const link of result.featureCapabilityLinks) {
    const key = linkKey(link.pwcFeatureId, link.capabilityKey)
    const existing = edges.get(key)
    if (existing) {
      existing.citations += 1
      continue
    }
    edges.set(key, {
      featureId: link.pwcFeatureId,
      capabilityKey: link.capabilityKey,
      matched: link.matched,
      citations: 1,
    })
  }
  const collapsedDuplicateCitations = result.featureCapabilityLinks.length - edges.size

  let ambiguousMvpOwners = 0
  let removedReleases: string[] = []
  let removedMvpFeatures: { ref: number; scope_option: string | null }[] = []
  let retainedStaleMvpFeatures: {
    ref: number
    scope_option: string | null
    dependents: number
  }[] = []
  let retainedStaleReleases: {
    id: string
    features: number
    capabilities: number
  }[] = []

  const run = db.transaction(() => {
    for (const release of result.releases) {
      upsertImportedRelease({
        id: release.id,
        label: release.label,
        name: release.name,
        description: release.description,
        display_order: release.displayOrder,
        in_mapping_source: release.inMappingSource,
        in_sequencing_source: release.inSequencingSource,
        source:
          release.inMappingSource && release.inSequencingSource
            ? 'both'
            : release.inMappingSource
              ? 'mapping'
              : 'sequencing',
      })
    }

    // Releases are deleted after the features have been re-pointed by the
    // upserts above, so a merged release has no dependants left by now.
    const releaseSweep = deleteImportedReleasesNotIn(result.releases.map((r) => r.id))
    removedReleases = releaseSweep.deleted
    retainedStaleReleases = releaseSweep.retained

    for (const phase of result.phases) {
      upsertImportedPhase({
        id: phase.id,
        name: phase.name,
        epic_ref: phase.epicRef,
        epic_description: phase.epicDescription,
        display_order: phase.displayOrder,
      })
    }

    for (const mvp of result.mvpFeatures) {
      upsertImportedMvpFeature({
        ref: mvp.ref,
        scope_option: mvp.scopeOption,
        title: mvp.title,
        source: mvp.source,
      })
    }

    for (const capability of result.capabilities) {
      const { owner, ambiguous } = chooseMvpOwner(recordsByRef.get(capability.ref) ?? [])
      if (ambiguous) ambiguousMvpOwners += 1

      const ownerRow = owner
        ? findMvpFeature(owner.ref, owner.scopeOption as ScopeOption)
        : undefined

      upsertImportedCapability({
        mvp_feature_id: ownerRow?.id ?? null,
        mvp_ref: capability.ref,
        mvp_owner_ambiguous: ambiguous ? 1 : 0,
        text: capability.text,
        actor: capability.actor,
        release_id: capability.releaseId,
        phase_id: capability.phaseId,
        source_phase_label: capability.sourcePhaseLabel,
        source: capability.source,
      })
    }

    for (const feature of result.features) {
      upsertImportedPwcFeature({
        id: feature.id,
        name: feature.name,
        foundational_build: feature.foundationalBuild,
        release_id: feature.releaseId,
        phase_id: feature.phaseId,
        source_phase_label: feature.sourcePhaseLabel,
        capability_note: feature.capabilityNote,
        display_order: feature.displayOrder,
      })
      replaceImportedAssumptions(
        feature.id,
        feature.assumptions.map((a) => a.text),
      )
    }

    for (const link of result.featureMvpLinks) {
      const row = findMvpFeature(link.ref, link.scopeOption)
      if (!row) {
        throw new Error(
          `Import bug: MVP feature ${link.ref}/${link.scopeOption ?? 'bare'} missing`,
        )
      }
      upsertImportedFeatureMvpLink({
        pwc_feature_id: link.pwcFeatureId,
        mvp_feature_id: row.id,
      })
    }

    const capabilityByKey = new Map(result.capabilities.map((c) => [c.key, c]))

    for (const edge of edges.values()) {
      const capability = capabilityByKey.get(edge.capabilityKey)
      if (!capability) {
        throw new Error(`Import bug: capability ${edge.capabilityKey} missing`)
      }
      const row = findCapability(capability.ref, capability.text)
      if (!row) {
        throw new Error(`Import bug: capability row ${edge.capabilityKey} not written`)
      }

      const key = linkKey(edge.featureId, edge.capabilityKey)
      const releaseConflict = releaseConflictByLink.get(key)
      const phaseConflict = phaseConflictByLink.get(key)

      upsertImportedFeatureCapabilityLink({
        pwc_feature_id: edge.featureId,
        capability_id: row.id,
        source_citations: edge.citations,
        matched: edge.matched ? 1 : 0,
        release_conflict: releaseConflict ? 1 : 0,
        phase_conflict: phaseConflict ? 1 : 0,
        feature_release_id: releaseConflict?.featureReleaseId ?? null,
        capability_release_id: releaseConflict?.capabilityReleaseId ?? null,
        feature_phase_label: phaseConflict?.featurePhaseLabel ?? null,
        capability_phase_label: phaseConflict?.capabilityPhaseLabel ?? null,
        phase_conflict_merged: phaseConflict?.resolvedByCanonicalMerge ? 1 : 0,
      })
    }

    // Last, so the links and capability owners above have already been
    // repointed off any record the sources stopped producing.
    const mvpSweep = deleteImportedMvpFeaturesNotIn(
      result.mvpFeatures.map((m) => ({ ref: m.ref, scope_option: m.scopeOption })),
    )
    removedMvpFeatures = mvpSweep.deleted
    retainedStaleMvpFeatures = mvpSweep.retained
  })

  run()

  return {
    releases: result.releases.length,
    phases: result.phases.length,
    pwcFeatures: result.features.length,
    assumptions: result.assumptions.length,
    mvpFeatures: result.mvpFeatures.length,
    capabilities: result.capabilities.length,
    featureMvpLinks: result.featureMvpLinks.length,
    featureCapabilityEdges: edges.size,
    featureCapabilityCitations: sumFeatureCapabilityCitations(),
    collapsedDuplicateCitations,
    ambiguousMvpOwners,
    removedReleases,
    retainedStaleReleases,
    removedMvpFeatures,
    retainedStaleMvpFeatures,
    releaseConflicts: result.conflicts.release.length,
    phaseConflicts: result.conflicts.phase.length,
    unmatchedLinks: result.conflicts.unmatched.length,
  }
}

/** Parses both source documents from disk and imports the result. */
export function importScopeFromSources(): ImportSummary {
  return importScope(loadScopeFromSources())
}
