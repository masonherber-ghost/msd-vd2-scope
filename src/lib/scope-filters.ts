import type { Actor, FeatureCardModel } from '@/lib/scope-derive'

/**
 * Filters compose AND across groups, OR within a group (R-8.8). An empty
 * group means "no constraint", not "match nothing".
 */
export type FilterGroup =
  | 'release'
  | 'phase'
  | 'actor'
  | 'mvp'
  | 'option'
  | 'conflict'
  | 'source'

export const FILTER_GROUPS: readonly FilterGroup[] = [
  'release',
  'phase',
  'actor',
  'mvp',
  'option',
  'conflict',
  'source',
]

export const GROUP_LABEL: Record<FilterGroup, string> = {
  release: 'Release',
  phase: 'Phase',
  actor: 'Actor',
  mvp: 'MVP feature',
  option: 'Scope option',
  conflict: 'Conflict state',
  source: 'Source',
}

/** `none` is the option-agnostic (bare) record. */
export type ScopeOptionFilter = '1A' | '1B' | 'none'

export type ConflictFilter =
  | 'release'
  | 'phase'
  | 'unmatched'
  | 'unreviewed'
  | 'corrected'
  | 'none'

export type FilterState = {
  release: string[]
  phase: string[]
  actor: Actor[]
  mvp: number[]
  option: ScopeOptionFilter[]
  conflict: ConflictFilter[]
  /** Provenance: mapping | sequencing | both | manual (R-9.9). */
  source: string[]
}

export const EMPTY_FILTERS: FilterState = {
  release: [],
  phase: [],
  actor: [],
  mvp: [],
  option: [],
  conflict: [],
  source: [],
}

export function isEmpty(state: FilterState): boolean {
  return FILTER_GROUPS.every((group) => state[group].length === 0)
}

export function activeGroups(state: FilterState): FilterGroup[] {
  return FILTER_GROUPS.filter((group) => state[group].length > 0)
}

// ---------------------------------------------------------------------------
// URL — the single source of truth for filter state (R-10.2)
// ---------------------------------------------------------------------------

const PARAM: Record<FilterGroup, string> = {
  release: 'release',
  phase: 'phase',
  actor: 'actor',
  mvp: 'mvp',
  option: 'option',
  conflict: 'conflict',
  source: 'source',
}

const split = (value: string | null): string[] =>
  value ? value.split(',').map((v) => v.trim()).filter(Boolean) : []

/** Reads filter state out of URL search params. Unknown values are dropped. */
export function parseFilters(params: URLSearchParams): FilterState {
  const actors = new Set(['employer', 'staff', 'jobseeker', 'system'])
  const options = new Set(['1A', '1B', 'none'])
  const sources = new Set(['mapping', 'sequencing', 'both', 'manual'])
  const conflicts = new Set([
    'release',
    'phase',
    'unmatched',
    'unreviewed',
    'corrected',
    'none',
  ])
  return {
    release: split(params.get(PARAM.release)),
    phase: split(params.get(PARAM.phase)),
    actor: split(params.get(PARAM.actor)).filter((v) => actors.has(v)) as Actor[],
    mvp: split(params.get(PARAM.mvp))
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n) && n > 0),
    option: split(params.get(PARAM.option)).filter((v) =>
      options.has(v),
    ) as ScopeOptionFilter[],
    conflict: split(params.get(PARAM.conflict)).filter((v) =>
      conflicts.has(v),
    ) as ConflictFilter[],
    source: split(params.get(PARAM.source)).filter((v) => sources.has(v)),
  }
}

/**
 * Writes filter state into search params, preserving any params this module
 * does not own (search text, selection) so other features keep working.
 */
export function writeFilters(
  state: FilterState,
  existing: URLSearchParams = new URLSearchParams(),
): URLSearchParams {
  const params = new URLSearchParams(existing)
  for (const group of FILTER_GROUPS) {
    const values = state[group]
    if (values.length === 0) params.delete(PARAM[group])
    else params.set(PARAM[group], values.join(','))
  }
  return params
}

export function toggleValue<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value]
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

function matchesConflict(feature: FeatureCardModel, wanted: ConflictFilter[]): boolean {
  if (wanted.length === 0) return true
  const { release, phase, unmatched, unreviewed } = feature.conflicts
  const any = release + phase + unmatched > 0

  return wanted.some((w) => {
    switch (w) {
      case 'release':
        return release > 0
      case 'phase':
        return phase > 0
      case 'unmatched':
        return unmatched > 0
      case 'unreviewed':
        return unreviewed > 0
      case 'corrected':
        return feature.overridden
      case 'none':
        return !any && !feature.overridden
    }
  })
}

function matchesOption(feature: FeatureCardModel, wanted: ScopeOptionFilter[]): boolean {
  if (wanted.length === 0) return true
  return feature.mvpFeatures.some((mvp) =>
    wanted.includes(mvp.scopeOption === null ? 'none' : mvp.scopeOption),
  )
}

/** True when the feature satisfies every active group. */
export function matchesFilters(feature: FeatureCardModel, state: FilterState): boolean {
  if (state.release.length > 0 && !state.release.includes(feature.releaseId)) return false
  if (state.phase.length > 0 && !state.phase.includes(feature.phaseId)) return false
  if (state.actor.length > 0 && !state.actor.some((a) => feature.actors.has(a))) return false
  if (state.mvp.length > 0 && !state.mvp.some((ref) => feature.mvpRefs.has(ref))) return false
  if (!matchesOption(feature, state.option)) return false
  if (!matchesConflict(feature, state.conflict)) return false
  if (state.source.length > 0 && !state.source.includes(feature.source)) return false
  return true
}

export function applyFilters(
  features: FeatureCardModel[],
  state: FilterState,
): FeatureCardModel[] {
  return features.filter((feature) => matchesFilters(feature, state))
}

/** State with one group cleared — used for both counts and zero-result blame. */
export function withoutGroup(state: FilterState, group: FilterGroup): FilterState {
  return { ...state, [group]: [] }
}

/**
 * The live count for one control (R-8.9): how many features would show if this
 * value were the only selection in its group, with every other group still
 * applied. That answers "what happens if I click this".
 */
export function countForValue(
  features: FeatureCardModel[],
  state: FilterState,
  group: FilterGroup,
  value: string | number,
): number {
  const probe = { ...withoutGroup(state, group), [group]: [value] } as FilterState
  return applyFilters(features, probe).length
}

/**
 * Which single groups are responsible for a zero-result view — dropping any
 * one of them brings results back (R-8.10). Empty when no single group is to
 * blame, in which case the combination as a whole is.
 */
export function blameGroups(
  features: FeatureCardModel[],
  state: FilterState,
): FilterGroup[] {
  if (applyFilters(features, state).length > 0) return []
  return activeGroups(state).filter(
    (group) => applyFilters(features, withoutGroup(state, group)).length > 0,
  )
}
