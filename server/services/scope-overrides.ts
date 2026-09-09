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
  {
    id: 'OV-001',
    featureId: 'F-085',
    releaseId: '1.1',
    phaseLabel: 'Manage Vacancies',
    rationale:
      'Programme decision: F-085 belongs in Manage Vacancies at release 1.1. The mapping ' +
      'file files it under Outcomes & Support at 1.9. Note this raises its release conflicts ' +
      'from 1 to 3, because two of its three capabilities are sequenced at 1.3 in ' +
      'Employer Recruitment — those remain open findings rather than being hidden.',
    decidedOn: '2026-09-09',
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
