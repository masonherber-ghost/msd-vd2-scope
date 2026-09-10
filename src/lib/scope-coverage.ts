import type { ScopeGraph } from '@/lib/api-client'
import { ACTOR_ORDER, type Actor } from '@/lib/scope-derive'

export type MvpRanking = {
  ref: number
  title: string
  featureIds: string[]
  capabilityCount: number
  /** Releases the citing features sit in — more than one is a coupling. */
  releaseIds: string[]
}

export type Orphan = {
  id: string
  label: string
  detail: string
}

export type NearDuplicate = {
  ref: number
  a: string
  b: string
  /** Jaccard similarity over word tokens, or 1 when one contains the other. */
  similarity: number
  reason: 'prefix' | 'wording'
}

export type CoverageModel = {
  ranking: MvpRanking[]
  crossRelease: MvpRanking[]
  orphans: {
    mvpWithoutCapabilities: Orphan[]
    mvpWithoutFeature: Orphan[]
    featuresWithoutCapabilities: Orphan[]
  }
  perRelease: {
    releaseId: string
    label: string
    features: number
    capabilities: number
    actors: { actor: Actor; count: number }[]
  }[]
  perCell: { releaseId: string; phaseId: string; features: number; capabilities: number }[]
  nearDuplicates: NearDuplicate[]
}

/** Word tokens, ignoring case, punctuation and hyphenation. */
function tokenise(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean))
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  let shared = 0
  for (const token of a) if (b.has(token)) shared += 1
  return shared / (a.size + b.size - shared)
}

/**
 * Two capabilities under the same ref that probably say the same thing.
 *
 * Two signals, because neither alone is enough. Containment catches a
 * truncation — "Review & publish vacancies" inside the table's longer row —
 * where token overlap is low. Token similarity catches a rewording —
 * "Download the existing JSP-generated CV in an editable format" against
 * "Download the JSP generated CV in editable format" — where neither
 * contains the other.
 *
 * 0.6 is calibrated against the real data: it finds both pairs the PRD names
 * (941, 956) plus 947, 969, 979 and 985, all of which read as duplicates,
 * and excludes the weaker matches that 0.5 admits. These are flagged for a
 * human, never merged (D-4).
 */
export const NEAR_DUPLICATE_THRESHOLD = 0.6

export function findNearDuplicates(
  capabilities: { mvp_ref: number; text: string }[],
): NearDuplicate[] {
  const byRef = new Map<number, string[]>()
  for (const capability of capabilities) {
    const list = byRef.get(capability.mvp_ref) ?? []
    list.push(capability.text)
    byRef.set(capability.mvp_ref, list)
  }

  const found: NearDuplicate[] = []

  for (const [ref, texts] of byRef) {
    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        const a = texts[i]
        const b = texts[j]
        const lowerA = a.toLowerCase()
        const lowerB = b.toLowerCase()
        const contains = lowerA.startsWith(lowerB) || lowerB.startsWith(lowerA)
        const similarity = jaccard(tokenise(a), tokenise(b))

        if (contains) {
          found.push({ ref, a, b, similarity: 1, reason: 'prefix' })
        } else if (similarity >= NEAR_DUPLICATE_THRESHOLD) {
          found.push({ ref, a, b, similarity, reason: 'wording' })
        }
      }
    }
  }

  return found.sort((x, y) => x.ref - y.ref)
}

/** Everything the coverage view reports, derived from the single payload. */
export function buildCoverage(graph: ScopeGraph): CoverageModel {
  const mvpById = new Map(graph.mvpFeatures.map((m) => [m.id, m]))
  const featureById = new Map(graph.pwcFeatures.map((f) => [f.id, f]))
  const featuresByRef = new Map<number, Set<string>>()
  for (const link of graph.featureMvpLinks) {
    const mvp = mvpById.get(link.mvp_feature_id)
    if (!mvp) continue
    const set = featuresByRef.get(mvp.ref) ?? new Set<string>()
    set.add(link.pwc_feature_id)
    featuresByRef.set(mvp.ref, set)
  }

  const capabilitiesByRef = new Map<number, number>()
  for (const capability of graph.capabilities) {
    capabilitiesByRef.set(
      capability.mvp_ref,
      (capabilitiesByRef.get(capability.mvp_ref) ?? 0) + 1,
    )
  }

  const titleByRef = new Map<number, string>()
  for (const mvp of graph.mvpFeatures) {
    if (!titleByRef.has(mvp.ref)) titleByRef.set(mvp.ref, mvp.title)
  }

  const ranking: MvpRanking[] = [...featuresByRef.entries()]
    .map(([ref, features]) => {
      const featureIds = [...features].sort()
      const releaseIds = [
        ...new Set(
          featureIds
            .map((id) => featureById.get(id)?.release_id)
            .filter((value): value is string => Boolean(value)),
        ),
      ].sort()
      return {
        ref,
        title: titleByRef.get(ref) ?? `MVP feature ${ref}`,
        featureIds,
        capabilityCount: capabilitiesByRef.get(ref) ?? 0,
        releaseIds,
      }
    })
    // Most-referenced first; ties by ref so the order is stable.
    .sort((a, b) => b.featureIds.length - a.featureIds.length || a.ref - b.ref)

  const crossRelease = ranking.filter((entry) => entry.releaseIds.length > 1)

  // ---- Orphans, both directions (R-8.22) ----
  const seenRefs = new Set<number>()
  const mvpWithoutCapabilities: Orphan[] = []
  const mvpWithoutFeature: Orphan[] = []

  for (const mvp of graph.mvpFeatures) {
    if (seenRefs.has(mvp.ref)) continue
    seenRefs.add(mvp.ref)

    if ((capabilitiesByRef.get(mvp.ref) ?? 0) === 0) {
      mvpWithoutCapabilities.push({
        id: String(mvp.ref),
        label: String(mvp.ref),
        detail: mvp.title,
      })
    }
    if (!featuresByRef.has(mvp.ref)) {
      mvpWithoutFeature.push({
        id: String(mvp.ref),
        label: String(mvp.ref),
        detail: `${capabilitiesByRef.get(mvp.ref) ?? 0} capabilities, cited by no PwC feature`,
      })
    }
  }

  const capabilityLinkCount = new Map<string, number>()
  for (const link of graph.featureCapabilityLinks) {
    capabilityLinkCount.set(
      link.pwc_feature_id,
      (capabilityLinkCount.get(link.pwc_feature_id) ?? 0) + 1,
    )
  }

  const featuresWithoutCapabilities: Orphan[] = graph.pwcFeatures
    .filter((feature) => (capabilityLinkCount.get(feature.id) ?? 0) === 0)
    .map((feature) => ({
      id: feature.id,
      label: feature.id,
      detail:
        feature.capability_note ??
        `${feature.name} — no capabilities mapped, and the source gives no reason`,
    }))

  // ---- Counts per release and per cell (R-8.23, R-8.24) ----
  const perRelease = graph.releases.map((release) => {
    const capabilities = graph.capabilities.filter((c) => c.release_id === release.id)
    const actorCounts = new Map<Actor, number>()
    for (const capability of capabilities) {
      actorCounts.set(capability.actor, (actorCounts.get(capability.actor) ?? 0) + 1)
    }
    return {
      releaseId: release.id,
      label: release.label,
      features: graph.pwcFeatures.filter((f) => f.release_id === release.id).length,
      capabilities: capabilities.length,
      actors: ACTOR_ORDER.filter((actor) => actorCounts.has(actor)).map((actor) => ({
        actor,
        count: actorCounts.get(actor) ?? 0,
      })),
    }
  })

  const perCell = graph.phases.flatMap((phase) =>
    graph.releases.map((release) => ({
      releaseId: release.id,
      phaseId: phase.id,
      features: graph.pwcFeatures.filter(
        (f) => f.release_id === release.id && f.phase_id === phase.id,
      ).length,
      capabilities: graph.capabilities.filter(
        (c) => c.release_id === release.id && c.phase_id === phase.id,
      ).length,
    })),
  )

  return {
    ranking,
    crossRelease,
    orphans: { mvpWithoutCapabilities, mvpWithoutFeature, featuresWithoutCapabilities },
    perRelease,
    perCell,
    nearDuplicates: findNearDuplicates(graph.capabilities),
  }
}
