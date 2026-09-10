import { toCanonicalPhase } from './phase-canon.js'
import type { MappingParseResult, ParsedPwcFeature } from './scope-types.js'

/**
 * Deliberate corrections to the source documents.
 *
 * The markdown files are inputs from PwC and are never edited — falsifying a
 * source would destroy the provenance the whole app exists to expose. A
 * correction is declared here instead and re-applied on every import, so it
 * survives a rebuilt database, is visible in version control, and can be
 * reversed by deleting one entry.
 *
 * Overrides are applied *before* reconciliation, so conflicts are derived from
 * the corrected placement rather than left stale.
 */
export type ScopeOverride = {
  id: string
  featureId: string
  releaseId?: string
  phaseLabel?: string
  rationale: string
  decidedOn: string
}

export const SCOPE_OVERRIDES: readonly ScopeOverride[] = [
  // OV-001 (F-085 → Manage Vacancies / 1.1) was superseded by the OV-002 split
  // below, which places both halves explicitly. Recorded here rather than
  // deleted so the decision trail stays readable.
]

/**
 * A feature split. Under PRD §16 P-1 a feature exists in exactly one place, so
 * a feature whose capabilities sit in two phases cannot be placed correctly —
 * it has to be divided.
 *
 * Capabilities follow their MVP ref, and assumptions follow their position in
 * the original feature. Every ref and every assumption must be assigned
 * exactly once, so a split can never silently drop scope.
 */
export type SplitPart = {
  featureId: string
  name: string
  releaseId: string
  phaseLabel: string
  /** MVP refs from the original feature that belong to this part. */
  mvpRefs: number[]
  /** 1-based assumption positions from the original feature. */
  assumptionPositions: number[]
}

export type ScopeSplit = {
  id: string
  featureId: string
  into: SplitPart[]
  rationale: string
  decidedOn: string
}

export const SCOPE_SPLITS: readonly ScopeSplit[] = [
  {
    id: 'OV-002',
    featureId: 'F-085',
    rationale:
      'F-085 "Record recruitment outcome" conflated a vacancy outcome with an applicant ' +
      'outcome, so its capabilities sat in two phases and PRD §16 P-1 made any single ' +
      'placement wrong. The split falls on the MVP feature boundary: 972 is vacancy ' +
      'outcome, 990 is applicant progression. Each half then agrees with the sequencing ' +
      'table on both phase and release, clearing all five of its conflicts. Supersedes ' +
      'OV-001, which moved the whole feature to Manage Vacancies / 1.1.',
    decidedOn: '2026-09-09',
    into: [
      {
        featureId: 'F-085',
        name: 'Record vacancy outcome',
        releaseId: '1.2',
        phaseLabel: 'Manage Vacancies',
        mvpRefs: [972],
        assumptionPositions: [1],
      },
      {
        featureId: 'F-093',
        name: 'Record applicant progression outcome',
        releaseId: '1.3',
        phaseLabel: 'Employer Recruitment',
        mvpRefs: [990],
        assumptionPositions: [2, 3],
      },
    ],
  },
]

export type AppliedOverride = {
  override: ScopeOverride
  from: { releaseId: string; phaseId: string; sourcePhaseLabel: string }
  to: { releaseId: string; phaseId: string; sourcePhaseLabel: string }
}

const SOURCE = 'scope-overrides.ts'

/**
 * Returns a mapping result with the overrides applied, plus a record of what
 * changed. The original placement is kept in the returned record so the
 * correction stays auditable.
 */
export function applyScopeOverrides(
  mapping: MappingParseResult,
  overrides: readonly ScopeOverride[] = SCOPE_OVERRIDES,
): { mapping: MappingParseResult; applied: AppliedOverride[] } {
  if (overrides.length === 0) return { mapping, applied: [] }

  const byFeature = new Map(overrides.map((o) => [o.featureId, o]))
  const applied: AppliedOverride[] = []

  const seen = new Set<string>()
  const features: ParsedPwcFeature[] = mapping.features.map((feature) => {
    const override = byFeature.get(feature.id)
    if (!override) return feature
    seen.add(feature.id)

    const from = {
      releaseId: feature.releaseId,
      phaseId: feature.phaseId,
      sourcePhaseLabel: feature.sourcePhaseLabel,
    }

    const releaseId = override.releaseId ?? feature.releaseId
    // The canonical phase is resolved through the same lookup the parsers use,
    // so an override cannot introduce a phase that does not exist.
    const phase = override.phaseLabel
      ? toCanonicalPhase(override.phaseLabel, SOURCE, 0)
      : null
    const phaseId = phase?.id ?? feature.phaseId
    // The effective label has to move with the phase, or conflict detection
    // would still compare against the document's original label.
    const sourcePhaseLabel = phase?.name ?? feature.sourcePhaseLabel

    applied.push({
      override,
      from,
      to: { releaseId, phaseId, sourcePhaseLabel },
    })

    return { ...feature, releaseId, phaseId, sourcePhaseLabel }
  })

  for (const override of overrides) {
    if (!seen.has(override.featureId)) {
      throw new Error(
        `Override ${override.id} targets ${override.featureId}, which is not in the mapping document.`,
      )
    }
  }

  return { mapping: { ...mapping, features }, applied }
}

export type AppliedSplit = {
  split: ScopeSplit
  from: {
    featureId: string
    name: string
    releaseId: string
    phaseId: string
    sourcePhaseLabel: string
  }
  into: { featureId: string; releaseId: string; phaseId: string; capabilities: number }[]
}

/**
 * Divides a feature into the declared parts. Applied after the placement
 * overrides and before reconciliation, so conflicts derive from the split
 * shape rather than the original.
 */
export function applyScopeSplits(
  mapping: MappingParseResult,
  splits: readonly ScopeSplit[] = SCOPE_SPLITS,
): { mapping: MappingParseResult; applied: AppliedSplit[] } {
  if (splits.length === 0) return { mapping, applied: [] }

  const applied: AppliedSplit[] = []
  let features = [...mapping.features]

  for (const split of splits) {
    const index = features.findIndex((f) => f.id === split.featureId)
    if (index === -1) {
      throw new Error(
        `Split ${split.id} targets ${split.featureId}, which is not in the mapping document.`,
      )
    }
    const original = features[index]

    if (split.into.length < 2) {
      throw new Error(`Split ${split.id} must produce at least two parts.`)
    }

    // Every part id unique, and a new id must not already be taken.
    const partIds = split.into.map((p) => p.featureId)
    if (new Set(partIds).size !== partIds.length) {
      throw new Error(`Split ${split.id} has duplicate part ids.`)
    }
    for (const id of partIds) {
      if (id !== original.id && features.some((f) => f.id === id)) {
        throw new Error(`Split ${split.id} would create ${id}, which already exists.`)
      }
    }

    // Every MVP ref assigned exactly once — a split must not drop scope.
    const originalRefs = original.mvpFeatures.map((m) => m.ref)
    const assignedRefs = split.into.flatMap((p) => p.mvpRefs)
    const missingRefs = originalRefs.filter((r) => !assignedRefs.includes(r))
    const unknownRefs = assignedRefs.filter((r) => !originalRefs.includes(r))
    if (missingRefs.length > 0) {
      throw new Error(
        `Split ${split.id} leaves MVP ref(s) ${missingRefs.join(', ')} unassigned.`,
      )
    }
    if (unknownRefs.length > 0) {
      throw new Error(
        `Split ${split.id} assigns MVP ref(s) ${unknownRefs.join(', ')} that ${original.id} does not cite.`,
      )
    }
    if (new Set(assignedRefs).size !== assignedRefs.length) {
      throw new Error(`Split ${split.id} assigns an MVP ref to more than one part.`)
    }

    // Same for assumptions, by position.
    const originalPositions = original.assumptions.map((a) => a.position)
    const assignedPositions = split.into.flatMap((p) => p.assumptionPositions)
    const missingPositions = originalPositions.filter((p) => !assignedPositions.includes(p))
    if (missingPositions.length > 0) {
      throw new Error(
        `Split ${split.id} leaves assumption(s) ${missingPositions.join(', ')} unassigned.`,
      )
    }
    if (new Set(assignedPositions).size !== assignedPositions.length) {
      throw new Error(`Split ${split.id} assigns an assumption to more than one part.`)
    }

    // Every capability must follow one of the assigned refs.
    const orphanCapabilities = original.capabilities.filter(
      (c) => !assignedRefs.includes(c.ref),
    )
    if (orphanCapabilities.length > 0) {
      throw new Error(
        `Split ${split.id} leaves capability ref(s) ` +
          `${[...new Set(orphanCapabilities.map((c) => c.ref))].join(', ')} unassigned.`,
      )
    }

    const parts: ParsedPwcFeature[] = split.into.map((part) => {
      const phase = toCanonicalPhase(part.phaseLabel, SOURCE, 0)
      return {
        ...original,
        id: part.featureId,
        name: part.name,
        releaseId: part.releaseId,
        phaseId: phase.id,
        sourcePhaseLabel: phase.name,
        mvpFeatures: original.mvpFeatures.filter((m) => part.mvpRefs.includes(m.ref)),
        capabilities: original.capabilities.filter((c) => part.mvpRefs.includes(c.ref)),
        assumptions: original.assumptions
          .filter((a) => part.assumptionPositions.includes(a.position))
          // Positions are per-feature and must stay contiguous 1..n.
          .map((a, i) => ({ ...a, position: i + 1 })),
      }
    })

    applied.push({
      split,
      from: {
        featureId: original.id,
        name: original.name,
        releaseId: original.releaseId,
        phaseId: original.phaseId,
        sourcePhaseLabel: original.sourcePhaseLabel,
      },
      into: parts.map((p) => ({
        featureId: p.id,
        releaseId: p.releaseId,
        phaseId: p.phaseId,
        capabilities: p.capabilities.length,
      })),
    })

    features = [...features.slice(0, index), ...parts, ...features.slice(index + 1)]
  }

  // Renumber so display_order stays contiguous after the insertion.
  features = features.map((f, i) => ({ ...f, displayOrder: i + 1 }))

  return { mapping: { ...mapping, features }, applied }
}

/**
 * A release rename. The mapping document files 15 features under "Release 1.9
 * (MVP1.9 / GA & Scale-Up)", an id the sequencing table has never heard of —
 * it sequences those same capabilities under 1.4 and 2. An alias declares that
 * the two documents are naming one release, so the mapping's id is rewritten
 * to the table's before reconciliation.
 *
 * `to` may already exist in either source: the alias merges into it rather
 * than creating a duplicate, and any conflict that becomes self-referential
 * (from and to now equal) stops being a conflict.
 */
export type ReleaseAlias = {
  id: string
  from: string
  to: string
  /** Label for the merged release. Defaults to `Release ${to}`. */
  label?: string
  rationale: string
  decidedOn: string
}

export const RELEASE_ALIASES: readonly ReleaseAlias[] = [
  {
    id: 'OV-003',
    from: '1.9',
    to: '1.4',
    rationale:
      'Release 1.9 is a mapping-file construct with no column in the sequencing table, ' +
      'so every one of its 32 capability links conflicted and no capability anywhere was ' +
      'sequenced as 1.9. The table schedules 5 of those links in 1.4 — the release that ' +
      'had capabilities but no features. Treating 1.9 and 1.4 as one release is the only ' +
      'reading under which both documents describe the same plan: it clears those 5 ' +
      'conflicts and leaves the 27 that are genuine disagreements about 1.1 and 2.',
    decidedOn: '2026-09-11',
  },
]

export type AppliedReleaseAlias = {
  alias: ReleaseAlias
  /** Features whose release id was rewritten. */
  features: string[]
  /** True when `to` already existed, so this merged rather than renamed. */
  merged: boolean
}

/**
 * Rewrites aliased release ids across the mapping result. Applied first, so
 * placement overrides and splits are declared against the final ids.
 */
export function applyReleaseAliases(
  mapping: MappingParseResult,
  aliases: readonly ReleaseAlias[] = RELEASE_ALIASES,
): { mapping: MappingParseResult; applied: AppliedReleaseAlias[] } {
  if (aliases.length === 0) return { mapping, applied: [] }

  const applied: AppliedReleaseAlias[] = []
  let releases = [...mapping.releases]
  let features = [...mapping.features]

  for (const alias of aliases) {
    const source = releases.find((r) => r.id === alias.from)
    if (!source) {
      throw new Error(
        `Alias ${alias.id} renames release ${alias.from}, which is not in the mapping document.`,
      )
    }
    if (alias.from === alias.to) {
      throw new Error(`Alias ${alias.id} renames release ${alias.from} to itself.`)
    }

    // The mapping document can only name a release once, so a pre-existing
    // `to` here means two headings collapse into one. Keep the aliased
    // release's prose — it is the only description either document carries.
    const existing = releases.find((r) => r.id === alias.to)
    const renamed = {
      ...source,
      id: alias.to,
      label: alias.label ?? `Release ${alias.to}`,
    }
    releases = releases
      .filter((r) => r.id !== alias.from && r.id !== alias.to)
      .concat(renamed)

    const moved: string[] = []
    features = features.map((feature) => {
      if (feature.releaseId !== alias.from) return feature
      moved.push(feature.id)
      return { ...feature, releaseId: alias.to }
    })

    applied.push({ alias, features: moved, merged: existing !== undefined })
  }

  return { mapping: { ...mapping, releases, features }, applied }
}
