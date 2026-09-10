import { CANONICAL_PHASES, type CanonicalPhase } from './phase-canon.js'
import type {
  MappingParseResult,
  ParsedAssumption,
  ParsedTableCapability,
  ScopeOption,
  SequencingParseResult,
} from './scope-types.js'

/** A capability in the merged model. */
export type MergedCapability = {
  /** Case-insensitive identity key: `${text.toLowerCase()}|${ref}`. */
  key: string
  /** First-seen casing wins for display. */
  text: string
  actor: string
  ref: number
  /** The sequencing table is authoritative for release and phase, because
   *  that is what the table is for. Null when the capability appears only in
   *  the mapping file. */
  releaseId: string | null
  phaseId: string | null
  sourcePhaseLabel: string | null
  source: 'mapping' | 'sequencing' | 'both'
}

export type MergedMvpFeature = {
  ref: number
  scopeOption: ScopeOption
  title: string
  source: 'mapping' | 'sequencing' | 'both'
}

export type MergedRelease = {
  id: string
  label: string
  name: string
  description: string
  inMappingSource: boolean
  inSequencingSource: boolean
  displayOrder: number
}

export type FeatureMvpLink = {
  pwcFeatureId: string
  ref: number
  scopeOption: ScopeOption
}

export type FeatureCapabilityLink = {
  pwcFeatureId: string
  capabilityKey: string
  matched: boolean
}

export type ReleaseConflict = {
  pwcFeatureId: string
  capabilityKey: string
  capabilityText: string
  ref: number
  featureReleaseId: string
  capabilityReleaseId: string
}

export type PhaseConflict = {
  pwcFeatureId: string
  capabilityKey: string
  capabilityText: string
  ref: number
  featurePhaseLabel: string
  capabilityPhaseLabel: string
  featurePhaseId: string
  capabilityPhaseId: string
  /** True when the canonical phase merge resolves this automatically. */
  resolvedByCanonicalMerge: boolean
}

export type UnmatchedLink = {
  pwcFeatureId: string
  text: string
  actor: string
  ref: number
}

export type ReconcileSummary = {
  releases: number
  phases: number
  pwcFeatures: number
  assumptions: number
  mvpRefs: number
  mvpRecords: number
  capabilities: number
  featureMvpLinks: number
  featureCapabilityLinks: number
  releaseConflicts: number
  phaseConflicts: number
  phaseConflictsAfterMerge: number
  unmatchedLinks: number
  releaseConflictBreakdown: { from: string; to: string; links: number }[]
}

export type ReconcileResult = {
  releases: MergedRelease[]
  phases: readonly CanonicalPhase[]
  features: MappingParseResult['features']
  assumptions: (ParsedAssumption & { pwcFeatureId: string })[]
  mvpFeatures: MergedMvpFeature[]
  capabilities: MergedCapability[]
  featureMvpLinks: FeatureMvpLink[]
  featureCapabilityLinks: FeatureCapabilityLink[]
  conflicts: {
    release: ReleaseConflict[]
    phase: PhaseConflict[]
    unmatched: UnmatchedLink[]
  }
  summary: ReconcileSummary
}

const RELEASE_NAMES: Record<string, string> = {
  '1.4': 'Release 1.4',
  '2': 'Release 2',
}

function capabilityKey(text: string, ref: number): string {
  // Case-insensitive: "Filter and Sort Applications" and "Filter and sort
  // applications" under ref 980 are the same capability (PRD §11).
  return `${text.trim().toLowerCase()}|${ref}`
}

function releaseSortKey(id: string): number {
  const [major, minor = '0'] = id.split('.')
  return Number(major) * 1000 + Number(minor)
}

/**
 * Merges the two parser outputs into the union model and derives the conflict
 * list. A conflict is data, not an error: both placements are recorded and
 * neither source is discarded (R-7.1).
 */
export function reconcile(
  mapping: MappingParseResult,
  sequencing: SequencingParseResult,
): ReconcileResult {
  // ---- Capabilities: the sequencing table is authoritative for placement ----
  // Two maps deliberately: `tableIndex` is what a mapping link is matched
  // against, `capabilities` is the union model. Matching against the union
  // would let one unmatched link satisfy the next citation of the same text.
  const capabilities = new Map<string, MergedCapability>()
  const tableIndex = new Map<string, MergedCapability>()

  const addSequencing = (c: ParsedTableCapability) => {
    const key = capabilityKey(c.text, c.ref)
    const existing = capabilities.get(key)
    if (existing) return // first-seen casing wins
    const merged: MergedCapability = {
      key,
      text: c.text,
      actor: c.actor,
      ref: c.ref,
      releaseId: c.releaseId,
      phaseId: c.phaseId,
      sourcePhaseLabel: c.sourcePhaseLabel,
      source: 'sequencing',
    }
    capabilities.set(key, merged)
    tableIndex.set(key, merged)
  }
  sequencing.capabilities.forEach(addSequencing)

  // ---- Links from the mapping file, matched against the table ----
  const featureCapabilityLinks: FeatureCapabilityLink[] = []
  const releaseConflicts: ReleaseConflict[] = []
  const phaseConflicts: PhaseConflict[] = []
  const unmatched: UnmatchedLink[] = []

  for (const feature of mapping.features) {
    for (const link of feature.capabilities) {
      const key = capabilityKey(link.text, link.ref)
      const match = tableIndex.get(key)

      if (!match) {
        // Never merge on a prefix match — record it and let a human confirm
        // (PRD §7, the F-050/F-051 truncation).
        unmatched.push({
          pwcFeatureId: feature.id,
          text: link.text,
          actor: link.actor,
          ref: link.ref,
        })
        capabilities.set(key, {
          key,
          text: link.text,
          actor: link.actor,
          ref: link.ref,
          releaseId: null,
          phaseId: null,
          sourcePhaseLabel: null,
          source: 'mapping',
        })
        featureCapabilityLinks.push({
          pwcFeatureId: feature.id,
          capabilityKey: key,
          matched: false,
        })
        continue
      }

      match.source = 'both'
      featureCapabilityLinks.push({
        pwcFeatureId: feature.id,
        capabilityKey: key,
        matched: true,
      })

      if (match.releaseId && match.releaseId !== feature.releaseId) {
        releaseConflicts.push({
          pwcFeatureId: feature.id,
          capabilityKey: key,
          capabilityText: match.text,
          ref: match.ref,
          featureReleaseId: feature.releaseId,
          capabilityReleaseId: match.releaseId,
        })
      }

      // Phase conflicts are counted on the *source* labels, so the effect of
      // the canonical merge stays visible rather than being hidden by it.
      const featureLabel = feature.sourcePhaseLabel
      const capabilityLabel = match.sourcePhaseLabel ?? ''
      const sameLabel =
        featureLabel.trim().toLowerCase() === capabilityLabel.trim().toLowerCase()

      if (!sameLabel) {
        phaseConflicts.push({
          pwcFeatureId: feature.id,
          capabilityKey: key,
          capabilityText: match.text,
          ref: match.ref,
          featurePhaseLabel: featureLabel,
          capabilityPhaseLabel: capabilityLabel,
          featurePhaseId: feature.phaseId,
          capabilityPhaseId: match.phaseId ?? '',
          resolvedByCanonicalMerge: feature.phaseId === match.phaseId,
        })
      }
    }
  }

  // ---- MVP features: mapping records, plus refs only the table knows ----
  const mvpFeatures = new Map<string, MergedMvpFeature>()
  const mappingRefs = new Set<number>()
  const featureMvpLinks: FeatureMvpLink[] = []

  for (const feature of mapping.features) {
    for (const m of feature.mvpFeatures) {
      mappingRefs.add(m.ref)
      const key = `${m.ref}|${m.scopeOption ?? ''}`
      if (!mvpFeatures.has(key)) {
        mvpFeatures.set(key, {
          ref: m.ref,
          scopeOption: m.scopeOption,
          title: m.title,
          source: 'mapping',
        })
      }
      featureMvpLinks.push({
        pwcFeatureId: feature.id,
        ref: m.ref,
        scopeOption: m.scopeOption,
      })
    }
  }

  // A table-only ref becomes one record with no scope option. Refs the mapping
  // file already covers add nothing — otherwise 951 (1A + 1B) would gain a
  // spurious third, bare record.
  for (const capability of capabilities.values()) {
    if (mappingRefs.has(capability.ref)) {
      // Normally the bare record is the one both documents describe. A ref
      // whose bare citation was merged onto its option (OV-007/OV-008) has
      // none, so fall back to its single record — but only when there is
      // exactly one, or 951's 1A/1B pair would both claim the table's row.
      const bare = mvpFeatures.get(`${capability.ref}|`)
      const forRef = bare
        ? [bare]
        : [...mvpFeatures.values()].filter((m) => m.ref === capability.ref)
      if (forRef.length === 1) forRef[0].source = 'both'
      continue
    }
    const key = `${capability.ref}|`
    if (!mvpFeatures.has(key)) {
      mvpFeatures.set(key, {
        ref: capability.ref,
        scopeOption: null,
        title: `MVP feature ${capability.ref}`,
        // Attribute the record to whichever document the capability came
        // from, not unconditionally to the table.
        source: capability.source === 'mapping' ? 'mapping' : 'sequencing',
      })
    }
  }

  // ---- Releases: the union of both sources ----
  const releases = new Map<string, MergedRelease>()
  for (const r of mapping.releases) {
    releases.set(r.id, {
      id: r.id,
      label: r.label,
      name: r.name,
      description: r.description,
      inMappingSource: true,
      inSequencingSource: false,
      displayOrder: 0,
    })
  }
  for (const id of sequencing.releaseIds) {
    const existing = releases.get(id)
    if (existing) {
      existing.inSequencingSource = true
      continue
    }
    releases.set(id, {
      id,
      label: RELEASE_NAMES[id] ?? `Release ${id}`,
      name: '',
      description: '',
      inMappingSource: false,
      inSequencingSource: true,
      displayOrder: 0,
    })
  }
  const orderedReleases = [...releases.values()].sort(
    (a, b) => releaseSortKey(a.id) - releaseSortKey(b.id),
  )
  orderedReleases.forEach((r, i) => {
    r.displayOrder = i + 1
  })

  // ---- Assumptions, flattened with their owner ----
  const assumptions = mapping.features.flatMap((f) =>
    f.assumptions.map((a) => ({ ...a, pwcFeatureId: f.id })),
  )

  // ---- Release conflict breakdown ----
  const breakdown = new Map<string, number>()
  for (const c of releaseConflicts) {
    const key = `${c.featureReleaseId}→${c.capabilityReleaseId}`
    breakdown.set(key, (breakdown.get(key) ?? 0) + 1)
  }
  const releaseConflictBreakdown = [...breakdown.entries()]
    .map(([pair, links]) => {
      const [from, to] = pair.split('→')
      return { from, to, links }
    })
    .sort((a, b) => b.links - a.links || releaseSortKey(a.from) - releaseSortKey(b.from))

  const mvpRecords = [...mvpFeatures.values()]

  return {
    releases: orderedReleases,
    phases: CANONICAL_PHASES,
    features: mapping.features,
    assumptions,
    mvpFeatures: mvpRecords,
    capabilities: [...capabilities.values()],
    featureMvpLinks,
    featureCapabilityLinks,
    conflicts: {
      release: releaseConflicts,
      phase: phaseConflicts,
      unmatched,
    },
    summary: {
      releases: orderedReleases.length,
      phases: CANONICAL_PHASES.length,
      pwcFeatures: mapping.features.length,
      assumptions: assumptions.length,
      mvpRefs: new Set(mvpRecords.map((m) => m.ref)).size,
      mvpRecords: mvpRecords.length,
      capabilities: capabilities.size,
      featureMvpLinks: featureMvpLinks.length,
      featureCapabilityLinks: featureCapabilityLinks.length,
      releaseConflicts: releaseConflicts.length,
      phaseConflicts: phaseConflicts.length,
      phaseConflictsAfterMerge: phaseConflicts.filter((c) => !c.resolvedByCanonicalMerge)
        .length,
      unmatchedLinks: unmatched.length,
      releaseConflictBreakdown,
    },
  }
}

/** Canonical phase name for an id, for summaries and UI labels. */
export function phaseLabel(id: string): string {
  return CANONICAL_PHASES.find((p) => p.id === id)?.name ?? id
}
