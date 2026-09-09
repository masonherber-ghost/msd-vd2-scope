import { getAllAssumptions } from './assumption-repository.js'
import { getAllCapabilities } from './capability-repository.js'
import {
  getAllFeatureCapabilityLinks,
  getAllFeatureMvpLinks,
} from './feature-link-repository.js'
import { getAllMvpFeatures } from './mvp-feature-repository.js'
import { getAllPhases } from './phase-repository.js'
import { getAllPwcFeatures } from './pwc-feature-repository.js'
import { getAllReleases } from './release-repository.js'
import { SCOPE_OVERRIDES } from '../services/scope-overrides.js'

export type ScopeGraph = ReturnType<typeof getScopeGraph>

/**
 * The whole graph in one payload (R-10.7). The dataset is small — 48 features
 * and 107 capabilities — so every view derives from this single read rather
 * than issuing a query per view.
 */
export function getScopeGraph() {
  const releases = getAllReleases()
  const phases = getAllPhases()
  const pwcFeatures = getAllPwcFeatures()
  const assumptions = getAllAssumptions()
  const mvpFeatures = getAllMvpFeatures()
  const capabilities = getAllCapabilities()
  const featureMvpLinks = getAllFeatureMvpLinks()
  const featureCapabilityLinks = getAllFeatureCapabilityLinks()

  return {
    // Declared corrections to the source documents. Exposed so a corrected
    // placement is visible in the UI rather than looking like source data.
    overrides: SCOPE_OVERRIDES,
    releases,
    phases,
    pwcFeatures,
    assumptions,
    mvpFeatures,
    capabilities,
    featureMvpLinks,
    featureCapabilityLinks,
    counts: {
      releases: releases.length,
      phases: phases.length,
      pwcFeatures: pwcFeatures.length,
      assumptions: assumptions.length,
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

/** True once an import has populated the graph. */
export function isScopeEmpty(): boolean {
  return getAllPwcFeatures().length === 0
}
