import type { FeatureCardModel, ScopeMapModel } from '@/lib/scope-derive'

export type ScopeEdge = {
  /** Stable id: the two feature ids, ordered, plus the shared refs. */
  id: string
  fromId: string
  toId: string
  /** MVP refs both features cite. */
  sharedRefs: number[]
  /** Cross-release couplings matter most to a delivery plan (R-8.4). */
  crossesRelease: boolean
  crossesPhase: boolean
}

/**
 * Every pair of features sharing at least one MVP feature. Undirected, so
 * each pair appears once.
 *
 * Pure and independent of layout: the geometry is measured from the DOM at
 * render time, because the grid can be zoomed, filtered and scrolled.
 */
export function buildEdges(features: FeatureCardModel[]): ScopeEdge[] {
  const byRef = new Map<number, FeatureCardModel[]>()
  for (const feature of features) {
    for (const ref of feature.mvpRefs) {
      const list = byRef.get(ref) ?? []
      list.push(feature)
      byRef.set(ref, list)
    }
  }

  const pairs = new Map<string, ScopeEdge>()

  for (const [ref, group] of byRef) {
    if (group.length < 2) continue
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const [a, b] =
          group[i].id < group[j].id ? [group[i], group[j]] : [group[j], group[i]]
        const key = `${a.id}|${b.id}`
        const existing = pairs.get(key)
        if (existing) {
          if (!existing.sharedRefs.includes(ref)) existing.sharedRefs.push(ref)
          continue
        }
        pairs.set(key, {
          id: key,
          fromId: a.id,
          toId: b.id,
          sharedRefs: [ref],
          crossesRelease: a.releaseId !== b.releaseId,
          crossesPhase: a.phaseId !== b.phaseId,
        })
      }
    }
  }

  for (const edge of pairs.values()) edge.sharedRefs.sort((x, y) => x - y)

  return [...pairs.values()].sort(
    (a, b) => a.fromId.localeCompare(b.fromId) || a.toId.localeCompare(b.toId),
  )
}

/** Edges touching a feature. */
export function edgesFor(edges: ScopeEdge[], featureId: string): ScopeEdge[] {
  return edges.filter((edge) => edge.fromId === featureId || edge.toId === featureId)
}

/**
 * How many other features each one is connected to. Shown passively so
 * load-bearing features read as important before any interaction (R-8.3).
 */
export function connectionDensity(edges: ScopeEdge[]): Map<string, number> {
  const density = new Map<string, number>()
  for (const edge of edges) {
    density.set(edge.fromId, (density.get(edge.fromId) ?? 0) + 1)
    density.set(edge.toId, (density.get(edge.toId) ?? 0) + 1)
  }
  return density
}

/**
 * Buckets density into four steps so a card can show it without a number
 * dominating the card — and so it is legible without relying on hue (R-10.6).
 */
export function densityBand(count: number): 0 | 1 | 2 | 3 {
  if (count === 0) return 0
  if (count <= 2) return 1
  if (count <= 5) return 2
  return 3
}

/** Edge model for the whole map, derived once per filtered view. */
export function buildEdgeModel(model: ScopeMapModel, visible: FeatureCardModel[]) {
  const edges = buildEdges(visible)
  return { edges, density: connectionDensity(edges), phases: model.phases }
}
