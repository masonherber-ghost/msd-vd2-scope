import type { ViewMode } from '@/lib/scope-derive'

/**
 * Which parts of a card are showing.
 *
 * The map is dense by design — every card carries its links, its actors and
 * whatever is unresolved about it — but density is only useful while you are
 * asking a question the detail answers. Reading release shape, or taking the
 * map into a room, wants the noise gone.
 *
 * The keys name the **content**, not the card's regions, because that is how
 * someone decides what to hide: "I don't need the actors right now", not "I
 * don't need the third strip". So one key can cover a header pill on one
 * card and a badge on another, and each view labels it in its own terms.
 */
export type DetailKey =
  | 'release'
  | 'refs'
  | 'actors'
  | 'capabilities'
  | 'conflicts'
  | 'questions'

export const DETAIL_KEYS: readonly DetailKey[] = [
  'release',
  'refs',
  'actors',
  'capabilities',
  'conflicts',
  'questions',
]

export type DetailState = Record<DetailKey, boolean>

/** Everything on: the map's default, and what a bare URL means. */
export const ALL_DETAIL: DetailState = {
  release: true,
  refs: true,
  actors: true,
  capabilities: true,
  conflicts: true,
  questions: true,
}

export type DetailGroup = {
  key: DetailKey
  label: string
  /** What disappears, named in the view's own terms. */
  hint: string
}

/**
 * The toggles a view offers. A card only exposes what it actually draws —
 * offering a control that changes nothing is worse than offering none, so
 * the MSD view lists five and the capability view four.
 */
const FEATURE_GROUPS: DetailGroup[] = [
  { key: 'release', label: 'Release', hint: 'The release pill in the card header' },
  {
    key: 'refs',
    label: 'MSD features',
    hint: 'The MSD refs this feature cites, and how many features share them',
  },
  { key: 'actors', label: 'Actors', hint: 'Actor pills and their counts' },
  { key: 'capabilities', label: 'Capabilities', hint: 'How many capabilities it cites' },
  {
    key: 'conflicts',
    label: 'Conflicts',
    hint: 'Source disagreements, unmatched links and corrections',
  },
  { key: 'questions', label: 'Questions', hint: 'The flag for a question raised on it' },
]

const GROUPS: Record<ViewMode, DetailGroup[]> = {
  release: FEATURE_GROUPS,
  actor: FEATURE_GROUPS,
  mvp: [
    { key: 'release', label: 'Release', hint: 'The release pill in the card header' },
    { key: 'refs', label: 'PwC features', hint: 'The PwC features citing this record' },
    { key: 'actors', label: 'Actors', hint: 'Actor pills and their counts' },
    {
      key: 'capabilities',
      label: 'Capabilities',
      hint: 'How many capabilities it owns, and how it was placed',
    },
    { key: 'questions', label: 'Questions', hint: 'The flag for a question raised on it' },
  ],
  capability: [
    { key: 'actors', label: 'Actors', hint: 'The actor this capability belongs to' },
    {
      key: 'refs',
      label: 'MSD feature',
      hint: 'The MSD ref it sits under, and the PwC features citing it',
    },
    {
      key: 'conflicts',
      label: 'Conflicts',
      hint: 'Source disagreements and unmatched links',
    },
    { key: 'questions', label: 'Questions', hint: 'The flag for a question raised on it' },
  ],
}

export const detailGroupsFor = (view: ViewMode): DetailGroup[] => GROUPS[view]

/** How many of this view's toggles are currently off. */
export const hiddenCount = (view: ViewMode, state: DetailState): number =>
  detailGroupsFor(view).filter((group) => !state[group.key]).length

export function toggleDetail(state: DetailState, key: DetailKey): DetailState {
  return { ...state, [key]: !state[key] }
}

// ---------------------------------------------------------------------------
// URL — the same contract filters, view and selection already use (R-10.2)
// ---------------------------------------------------------------------------

export const DETAIL_PARAM = 'hide'

/**
 * The URL lists what is **hidden**, not what is shown.
 *
 * Everything on is the default and by far the common case, so naming the
 * exceptions keeps a shared link short — and an unrecognised key is dropped
 * rather than throwing, the same as every other param here.
 */
export function parseDetail(params: URLSearchParams): DetailState {
  const hidden = new Set(
    (params.get(DETAIL_PARAM) ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter((value): value is DetailKey => DETAIL_KEYS.includes(value as DetailKey)),
  )
  return DETAIL_KEYS.reduce(
    (state, key) => ({ ...state, [key]: !hidden.has(key) }),
    {} as DetailState,
  )
}

/** Writes the state back, preserving every param this module does not own. */
export function writeDetail(
  state: DetailState,
  existing: URLSearchParams = new URLSearchParams(),
): URLSearchParams {
  const params = new URLSearchParams(existing)
  const hidden = DETAIL_KEYS.filter((key) => !state[key])
  if (hidden.length === 0) params.delete(DETAIL_PARAM)
  else params.set(DETAIL_PARAM, hidden.join(','))
  return params
}
