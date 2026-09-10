import type { ScopeGraph } from '@/lib/api-client'
import { ACTOR_ORDER, type Actor } from '@/lib/scope-derive'

export type DetailCapability = {
  id: number
  /** `pwc_feature_capabilities.id` — what a resolution is recorded against. */
  linkId: number
  text: string
  actor: Actor
  /** The capability's own placement, per the sequencing table. */
  releaseId: string | null
  releaseLabel: string | null
  phaseId: string | null
  phaseName: string | null
  /** True when the table places this capability outside its feature's cell. */
  releaseDiffers: boolean
  phaseDiffers: boolean
  releaseConflict: boolean
  phaseConflict: boolean
  /** The phase disagreement is only the canonical merge, not a finding. */
  phaseConflictMerged: boolean
  matched: boolean
  resolutionState: string
  resolutionNote: string | null
  /** Both recorded placements, so neither source is hidden (R-7.1). */
  featureReleaseId: string | null
  capabilityReleaseId: string | null
  featurePhaseLabel: string | null
  capabilityPhaseLabel: string | null
  citations: number
  ownerAmbiguous: boolean
}

export type DetailActorGroup = {
  actor: Actor
  capabilities: DetailCapability[]
}

export type ConnectedFeature = {
  id: string
  name: string
  releaseId: string
  releaseLabel: string
  phaseName: string
  sharedRefs: number[]
  /** Cross-release couplings matter most to a delivery plan (R-8.4). */
  crossesRelease: boolean
}

export type FeatureDetail = {
  id: string
  name: string
  releaseId: string
  releaseLabel: string
  phaseId: string
  phaseName: string
  epicRef: string
  epicDescription: string
  sourcePhaseLabel: string | null
  foundationalBuild: string
  source: string
  overridden: boolean
  overrideRationale: string | null
  assumptions: { id: number; position: number; text: string; source: string }[]
  mvpFeatures: { id: number; ref: number; scopeOption: '1A' | '1B' | null; title: string }[]
  actorGroups: DetailActorGroup[]
  capabilityCount: number
  /** The source's own qualifier when there are no capabilities (R-8.18). */
  capabilityNote: string | null
  connected: ConnectedFeature[]
  conflicts: { release: number; phase: number; unmatched: number; unreviewed: number }
}

/**
 * Builds the detail model for one feature from the single graph payload.
 * Pure — no fetching, so opening the panel costs nothing.
 */
export function buildFeatureDetail(
  graph: ScopeGraph,
  featureId: string,
): FeatureDetail | null {
  const feature = graph.pwcFeatures.find((f) => f.id === featureId)
  if (!feature) return null

  const releaseById = new Map(graph.releases.map((r) => [r.id, r]))
  const phaseById = new Map(graph.phases.map((p) => [p.id, p]))
  const capabilityById = new Map(graph.capabilities.map((c) => [c.id, c]))
  const mvpById = new Map(graph.mvpFeatures.map((m) => [m.id, m]))

  const phase = phaseById.get(feature.phase_id)
  const release = releaseById.get(feature.release_id)

  const links = graph.featureCapabilityLinks.filter(
    (l) => l.pwc_feature_id === feature.id,
  )

  const capabilities: DetailCapability[] = []
  let unreviewed = 0
  let releaseConflicts = 0
  let phaseConflicts = 0
  let unmatched = 0

  for (const link of links) {
    const capability = capabilityById.get(link.capability_id)
    if (!capability) continue

    const capabilityRelease = capability.release_id
      ? releaseById.get(capability.release_id)
      : undefined
    const capabilityPhase = capability.phase_id
      ? phaseById.get(capability.phase_id)
      : undefined

    if (link.release_conflict === 1) releaseConflicts += 1
    if (link.phase_conflict === 1 && link.phase_conflict_merged === 0) phaseConflicts += 1
    if (link.matched === 0) unmatched += 1
    if (
      (link.release_conflict === 1 || link.phase_conflict === 1) &&
      link.resolution_state === 'unreviewed'
    ) {
      unreviewed += 1
    }

    capabilities.push({
      id: capability.id,
      linkId: link.id,
      text: capability.text,
      actor: capability.actor,
      releaseId: capability.release_id,
      releaseLabel: capabilityRelease?.label ?? null,
      phaseId: capability.phase_id,
      phaseName: capabilityPhase?.name ?? null,
      releaseDiffers:
        capability.release_id !== null && capability.release_id !== feature.release_id,
      phaseDiffers:
        capability.phase_id !== null && capability.phase_id !== feature.phase_id,
      releaseConflict: link.release_conflict === 1,
      phaseConflict: link.phase_conflict === 1,
      phaseConflictMerged: link.phase_conflict_merged === 1,
      matched: link.matched === 1,
      resolutionState: link.resolution_state,
      resolutionNote: link.resolution_note,
      featureReleaseId: link.feature_release_id,
      capabilityReleaseId: link.capability_release_id,
      featurePhaseLabel: link.feature_phase_label,
      capabilityPhaseLabel: link.capability_phase_label,
      citations: link.source_citations,
      ownerAmbiguous: capability.mvp_owner_ambiguous === 1,
    })
  }

  // Grouped by actor in a fixed order, so the panel reads the same every time.
  const actorGroups: DetailActorGroup[] = ACTOR_ORDER.map((actor) => ({
    actor,
    capabilities: capabilities.filter((c) => c.actor === actor),
  })).filter((group) => group.capabilities.length > 0)

  const mvpRecords = graph.featureMvpLinks
    .filter((l) => l.pwc_feature_id === feature.id)
    .map((l) => mvpById.get(l.mvp_feature_id))
    .filter((m): m is NonNullable<typeof m> => Boolean(m))
    .map((m) => ({ id: m.id, ref: m.ref, scopeOption: m.scope_option, title: m.title }))
    .sort((a, b) => a.ref - b.ref || (a.scopeOption ?? '').localeCompare(b.scopeOption ?? ''))

  // Connected features: others citing any of the same MVP refs.
  const myRefs = new Set(mvpRecords.map((m) => m.ref))
  const refsByFeature = new Map<string, Set<number>>()
  for (const link of graph.featureMvpLinks) {
    const mvp = mvpById.get(link.mvp_feature_id)
    if (!mvp || !myRefs.has(mvp.ref)) continue
    if (link.pwc_feature_id === feature.id) continue
    const refs = refsByFeature.get(link.pwc_feature_id) ?? new Set<number>()
    refs.add(mvp.ref)
    refsByFeature.set(link.pwc_feature_id, refs)
  }

  const connected: ConnectedFeature[] = [...refsByFeature.entries()]
    .map(([id, refs]) => {
      const other = graph.pwcFeatures.find((f) => f.id === id)
      if (!other) return null
      return {
        id: other.id,
        name: other.name,
        releaseId: other.release_id,
        releaseLabel: releaseById.get(other.release_id)?.label ?? other.release_id,
        phaseName: phaseById.get(other.phase_id)?.name ?? other.phase_id,
        sharedRefs: [...refs].sort((a, b) => a - b),
        crossesRelease: other.release_id !== feature.release_id,
      }
    })
    .filter((c): c is ConnectedFeature => c !== null)
    // Cross-release couplings first — they matter most to a delivery plan.
    .sort(
      (a, b) =>
        Number(b.crossesRelease) - Number(a.crossesRelease) || a.id.localeCompare(b.id),
    )

  const override = graph.overrides.find((o) => o.featureId === feature.id)

  const assumptions = graph.assumptions
    .filter((a) => a.pwc_feature_id === feature.id)
    .sort((a, b) => a.position - b.position)

  return {
    id: feature.id,
    name: feature.name,
    releaseId: feature.release_id,
    releaseLabel: release?.label ?? feature.release_id,
    phaseId: feature.phase_id,
    phaseName: phase?.name ?? feature.phase_id,
    epicRef: phase?.epic_ref ?? '',
    epicDescription: phase?.epic_description ?? '',
    sourcePhaseLabel: feature.source_phase_label,
    foundationalBuild: feature.foundational_build,
    source: feature.source,
    overridden: Boolean(override),
    overrideRationale: override?.rationale ?? null,
    assumptions,
    mvpFeatures: mvpRecords,
    actorGroups,
    capabilityCount: capabilities.length,
    capabilityNote: feature.capability_note,
    connected,
    conflicts: {
      release: releaseConflicts,
      phase: phaseConflicts,
      unmatched,
      unreviewed,
    },
  }
}
