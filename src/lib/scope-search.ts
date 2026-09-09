import type { ScopeGraph } from '@/lib/api-client'

/**
 * What matched, not just that something did — a hit inside an assumption
 * means something different from a hit on a title (R-8.12).
 */
export type MatchKind =
  | 'feature-id'
  | 'feature-name'
  | 'foundational-build'
  | 'mvp-ref'
  | 'mvp-title'
  | 'capability'
  | 'assumption'
  | 'epic-ref'

export const MATCH_LABEL: Record<MatchKind, string> = {
  'feature-id': 'Feature ID',
  'feature-name': 'Feature name',
  'foundational-build': 'Foundational build',
  'mvp-ref': 'MVP feature ref',
  'mvp-title': 'MVP feature title',
  capability: 'Capability',
  assumption: 'Assumption',
  'epic-ref': 'Epic ref',
}

/** Groups are listed in this order — the most direct hit first. */
const KIND_ORDER: MatchKind[] = [
  'feature-id',
  'feature-name',
  'mvp-ref',
  'mvp-title',
  'capability',
  'assumption',
  'foundational-build',
  'epic-ref',
]

export type SearchHit = {
  /** Stable across renders, for keyboard navigation. */
  key: string
  kind: MatchKind
  /** The feature Enter reveals. Null when nothing on the map owns the hit. */
  featureId: string | null
  title: string
  /** The text the term was found in, for context. */
  context: string
  /** Where in `context` the term sits, so it can be highlighted. */
  matchStart: number
  matchLength: number
}

export type SearchGroup = {
  kind: MatchKind
  label: string
  hits: SearchHit[]
}

export type SearchResult = {
  query: string
  groups: SearchGroup[]
  total: number
  /** Flat, in group order — what the arrow keys walk. */
  flat: SearchHit[]
}

export const EMPTY_SEARCH: SearchResult = { query: '', groups: [], total: 0, flat: [] }

function find(haystack: string, needle: string): number {
  return haystack.toLowerCase().indexOf(needle)
}

/**
 * Searches every text surface named in R-8.11. Case-insensitive substring
 * matching over the single graph payload — the dataset is small enough that
 * anything cleverer would be harder to predict, not faster.
 */
export function searchScope(graph: ScopeGraph, rawQuery: string): SearchResult {
  const query = rawQuery.trim()
  if (query.length === 0) return EMPTY_SEARCH
  const needle = query.toLowerCase()

  const hits: SearchHit[] = []
  const featureById = new Map(graph.pwcFeatures.map((f) => [f.id, f]))

  const push = (
    kind: MatchKind,
    key: string,
    featureId: string | null,
    title: string,
    context: string,
  ) => {
    const at = find(context, needle)
    if (at === -1) return
    hits.push({
      key,
      kind,
      featureId,
      title,
      context,
      matchStart: at,
      matchLength: query.length,
    })
  }

  for (const feature of graph.pwcFeatures) {
    push('feature-id', `id-${feature.id}`, feature.id, feature.id, feature.id)
    push('feature-name', `name-${feature.id}`, feature.id, feature.id, feature.name)
    push(
      'foundational-build',
      `build-${feature.id}`,
      feature.id,
      feature.id,
      feature.foundational_build,
    )
  }

  for (const assumption of graph.assumptions) {
    push(
      'assumption',
      `assumption-${assumption.id}`,
      assumption.pwc_feature_id,
      `${assumption.pwc_feature_id} · assumption ${assumption.position}`,
      assumption.text,
    )
  }

  // An MVP feature is not on the map itself, so a hit resolves to the first
  // feature citing it — Enter has somewhere to go.
  const featuresByMvpId = new Map<number, string[]>()
  for (const link of graph.featureMvpLinks) {
    const list = featuresByMvpId.get(link.mvp_feature_id) ?? []
    list.push(link.pwc_feature_id)
    featuresByMvpId.set(link.mvp_feature_id, list)
  }

  for (const mvp of graph.mvpFeatures) {
    const citing = (featuresByMvpId.get(mvp.id) ?? []).sort()
    const owner = citing[0] ?? null
    const label = `${mvp.ref}${mvp.scope_option ? ` Option ${mvp.scope_option}` : ''}`
    const cited =
      citing.length > 0
        ? `cited by ${citing.join(', ')}`
        : 'not cited by any feature'

    push('mvp-ref', `mvp-ref-${mvp.id}`, owner, `${label} · ${cited}`, String(mvp.ref))
    push('mvp-title', `mvp-title-${mvp.id}`, owner, `${label} · ${cited}`, mvp.title)
  }

  const featuresByCapability = new Map<number, string[]>()
  for (const link of graph.featureCapabilityLinks) {
    const list = featuresByCapability.get(link.capability_id) ?? []
    list.push(link.pwc_feature_id)
    featuresByCapability.set(link.capability_id, list)
  }

  for (const capability of graph.capabilities) {
    const citing = (featuresByCapability.get(capability.id) ?? []).sort()
    push(
      'capability',
      `capability-${capability.id}`,
      citing[0] ?? null,
      `${capability.mvp_ref} · ${capability.actor}${
        citing.length > 0 ? ` · ${citing.join(', ')}` : ''
      }`,
      capability.text,
    )
  }

  for (const phase of graph.phases) {
    push('epic-ref', `epic-${phase.id}`, null, phase.name, phase.epic_ref)
  }

  // Drop hits whose owning feature has vanished, so Enter never dead-ends.
  const usable = hits.filter((hit) => hit.featureId === null || featureById.has(hit.featureId))

  const groups: SearchGroup[] = KIND_ORDER.map((kind) => ({
    kind,
    label: MATCH_LABEL[kind],
    hits: usable.filter((hit) => hit.kind === kind),
  })).filter((group) => group.hits.length > 0)

  const flat = groups.flatMap((group) => group.hits)

  return { query, groups, total: flat.length, flat }
}
