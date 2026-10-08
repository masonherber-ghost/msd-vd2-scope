import type {
  CapabilityRow,
  FeatureCapabilityLinkRow,
  FeatureMvpLinkRow,
  MvpFeatureRow,
  PhaseRow,
  PwcFeatureRow,
  ReleaseRow,
} from '@/lib/api-client'

/**
 * The stored shape of every document, one collection per former SQLite table.
 *
 * Field names, `0`/`1` flags, numeric ids and `YYYY-MM-DD HH:MM:SS` UTC
 * timestamps are kept exactly as the database had them, so the API row types
 * — and every hook and component built on them — never learn the store
 * changed. Do not "modernise" them.
 *
 * Stored documents carry two things the API rows hide: `source_text` on a
 * capability (the wording the source document used, which re-import matches
 * on) and tombstoned links (`removed_at` set), which keep a deliberate removal
 * from being undone by re-import.
 */
type Timestamps = { created_at: string; updated_at: string }

export type StoredRelease = ReleaseRow & Timestamps
export type StoredPhase = PhaseRow & Timestamps
export type StoredPwcFeature = PwcFeatureRow & Timestamps
export type StoredMvpFeature = MvpFeatureRow & Timestamps
export type StoredCapability = CapabilityRow & Timestamps & { source_text: string | null }
export type StoredFeatureMvpLink = FeatureMvpLinkRow &
  Timestamps & { removed_at: string | null }
export type StoredFeatureCapabilityLink = FeatureCapabilityLinkRow &
  Timestamps & { removed_at: string | null }

/** Every document the app works from — the whole store, read once. */
export type RawScope = {
  releases: StoredRelease[]
  phases: StoredPhase[]
  pwcFeatures: StoredPwcFeature[]
  mvpFeatures: StoredMvpFeature[]
  capabilities: StoredCapability[]
  featureMvpLinks: StoredFeatureMvpLink[]
  featureCapabilityLinks: StoredFeatureCapabilityLink[]
}

/** Collection names are the former table names, under `users/{uid}/`. */
export const COLLECTIONS = {
  releases: 'releases',
  phases: 'phases',
  pwcFeatures: 'pwc_features',
  mvpFeatures: 'mvp_features',
  capabilities: 'capabilities',
  featureMvpLinks: 'pwc_feature_mvp_features',
  featureCapabilityLinks: 'pwc_feature_capabilities',
} as const satisfies Record<keyof RawScope, string>

export type CollectionKey = keyof RawScope

/**
 * The AUTOINCREMENT counters, one per table that had one. SQLite never reuses
 * a deleted id, and neither does this: a new id is the counter plus one, read
 * and bumped in a transaction.
 */
export const SEQUENCES_DOC = 'meta/sequences'
export type SequenceName = 'mvp_features' | 'capabilities' | 'pwc_feature_capabilities'
export type Sequences = Record<SequenceName, number>

/** Document ids: the row's primary key, as a string. */
export const docId = {
  releases: (row: Pick<StoredRelease, 'id'>) => row.id,
  phases: (row: Pick<StoredPhase, 'id'>) => row.id,
  pwcFeatures: (row: Pick<StoredPwcFeature, 'id'>) => row.id,
  mvpFeatures: (row: Pick<StoredMvpFeature, 'id'>) => String(row.id),
  capabilities: (row: Pick<StoredCapability, 'id'>) => String(row.id),
  // A composite primary key in SQLite.
  featureMvpLinks: (row: Pick<StoredFeatureMvpLink, 'pwc_feature_id' | 'mvp_feature_id'>) =>
    `${row.pwc_feature_id}__${row.mvp_feature_id}`,
  featureCapabilityLinks: (row: Pick<StoredFeatureCapabilityLink, 'id'>) => String(row.id),
} satisfies { [K in CollectionKey]: (row: never) => string }

/** SQLite's `datetime('now')`: UTC, second precision, a space not a `T`. */
export function utcNow(date = new Date()): string {
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

/**
 * SQLite's default BINARY collation — byte order, not locale order. Using
 * `localeCompare` here would reorder rows the server sorted.
 */
export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
