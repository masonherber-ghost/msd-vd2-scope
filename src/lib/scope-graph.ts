import type { ScopeGraph } from '@/lib/api-client'
import { RELEASE_ALIASES, SCOPE_OVERRIDES } from '@/lib/scope-decisions'
import { compareText, type RawScope } from '@/lib/scope-records'
import { toCapabilityRow } from '@/lib/scope-plan'

/**
 * The whole graph, derived from the raw store — what `GET /api/scope`
 * returned. Pure: every view derives from this one value, so nothing queries
 * per view (R-10.7).
 *
 * Row order is the server's ORDER BY clauses, compared with SQLite's binary
 * collation, because views render in the order they are given.
 */
export function deriveScopeGraph(raw: RawScope): ScopeGraph {
  const byOrder = (a: { display_order: number }, b: { display_order: number }) =>
    a.display_order - b.display_order

  const releases = [...raw.releases].sort(byOrder)
  const phases = [...raw.phases].sort(byOrder)
  const pwcFeatures = [...raw.pwcFeatures].sort(byOrder)
  // ORDER BY ref, IFNULL(scope_option, '')
  const mvpFeatures = [...raw.mvpFeatures].sort(
    (a, b) => a.ref - b.ref || compareText(a.scope_option ?? '', b.scope_option ?? ''),
  )
  // ORDER BY mvp_ref, id — without the source wording only re-import uses.
  const capabilities = [...raw.capabilities]
    .sort((a, b) => a.mvp_ref - b.mvp_ref || a.id - b.id)
    .map(toCapabilityRow)
  // Tombstoned links are a record of a removal, not a link.
  const featureMvpLinks = raw.featureMvpLinks
    .filter((l) => l.removed_at === null)
    .sort(
      (a, b) =>
        compareText(a.pwc_feature_id, b.pwc_feature_id) || a.mvp_feature_id - b.mvp_feature_id,
    )
    .map(({ pwc_feature_id, mvp_feature_id, source, removed_at }) => ({
      pwc_feature_id,
      mvp_feature_id,
      source,
      removed_at,
    }))
  const featureCapabilityLinks = raw.featureCapabilityLinks
    .filter((l) => l.removed_at === null)
    .sort(
      (a, b) =>
        compareText(a.pwc_feature_id, b.pwc_feature_id) || a.capability_id - b.capability_id,
    )
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .map(({ created_at, updated_at, ...link }) => link)

  return {
    overrides: [...SCOPE_OVERRIDES],
    releaseAliases: [...RELEASE_ALIASES],
    releases,
    phases,
    pwcFeatures,
    mvpFeatures,
    capabilities,
    featureMvpLinks,
    featureCapabilityLinks,
    counts: {
      releases: releases.length,
      phases: phases.length,
      pwcFeatures: pwcFeatures.length,
      mvpFeatures: mvpFeatures.length,
      capabilities: capabilities.length,
      featureMvpLinks: featureMvpLinks.length,
      featureCapabilityEdges: featureCapabilityLinks.length,
      featureCapabilityCitations: featureCapabilityLinks.reduce(
        (n, l) => n + l.source_citations,
        0,
      ),
      releaseConflicts: featureCapabilityLinks.filter((l) => l.release_conflict === 1).length,
      phaseConflicts: featureCapabilityLinks.filter((l) => l.phase_conflict === 1).length,
      unresolvedConflicts: featureCapabilityLinks.filter(
        (l) =>
          (l.release_conflict === 1 || l.phase_conflict === 1) &&
          l.resolution_state === 'unreviewed',
      ).length,
      unmatchedLinks: featureCapabilityLinks.filter((l) => l.matched === 0).length,
    },
  }
}

/** `GET /api/conflicts`: every link carrying a conflict or an unmatched citation. */
export function deriveConflicts(graph: ScopeGraph): ScopeGraph['featureCapabilityLinks'] {
  return graph.featureCapabilityLinks.filter(
    (link) => link.release_conflict === 1 || link.phase_conflict === 1 || link.matched === 0,
  )
}
