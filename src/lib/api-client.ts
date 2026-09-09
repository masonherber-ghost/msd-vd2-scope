export type ReleaseRow = {
  id: string
  label: string
  name: string
  description: string
  display_order: number
  in_mapping_source: number
  in_sequencing_source: number
  source: string
}

export type PhaseRow = {
  id: string
  name: string
  epic_ref: string
  epic_description: string
  display_order: number
  source: string
}

export type PwcFeatureRow = {
  id: string
  name: string
  foundational_build: string
  release_id: string
  phase_id: string
  source_phase_label: string | null
  capability_note: string | null
  display_order: number
  source: string
}

export type AssumptionRow = {
  id: number
  pwc_feature_id: string
  position: number
  text: string
  source: string
}

export type MvpFeatureRow = {
  id: number
  ref: number
  scope_option: '1A' | '1B' | null
  title: string
  source: string
}

export type CapabilityRow = {
  id: number
  mvp_feature_id: number | null
  mvp_ref: number
  mvp_owner_ambiguous: number
  text: string
  actor: 'employer' | 'staff' | 'jobseeker' | 'system'
  release_id: string | null
  phase_id: string | null
  source_phase_label: string | null
  source: string
}

export type FeatureMvpLinkRow = {
  pwc_feature_id: string
  mvp_feature_id: number
  source: string
}

export type FeatureCapabilityLinkRow = {
  id: number
  pwc_feature_id: string
  capability_id: number
  source_citations: number
  matched: number
  release_conflict: number
  phase_conflict: number
  feature_release_id: string | null
  capability_release_id: string | null
  feature_phase_label: string | null
  capability_phase_label: string | null
  phase_conflict_merged: number
  resolution_state:
    | 'unreviewed'
    | 'mapping_wins'
    | 'table_wins'
    | 'both_correct'
    | 'defect_raised'
  resolution_note: string | null
  resolved_at: string | null
  source: string
}

export type ScopeOverride = {
  id: string
  featureId: string
  releaseId?: string
  phaseLabel?: string
  rationale: string
  decidedOn: string
}

export type ScopeGraph = {
  overrides: ScopeOverride[]
  releases: ReleaseRow[]
  phases: PhaseRow[]
  pwcFeatures: PwcFeatureRow[]
  assumptions: AssumptionRow[]
  mvpFeatures: MvpFeatureRow[]
  capabilities: CapabilityRow[]
  featureMvpLinks: FeatureMvpLinkRow[]
  featureCapabilityLinks: FeatureCapabilityLinkRow[]
  counts: {
    releases: number
    phases: number
    pwcFeatures: number
    assumptions: number
    mvpFeatures: number
    capabilities: number
    featureMvpLinks: number
    featureCapabilityEdges: number
    featureCapabilityCitations: number
    releaseConflicts: number
    phaseConflicts: number
    unresolvedConflicts: number
    unmatchedLinks: number
  }
}

export type ImportSummary = {
  releases: number
  phases: number
  pwcFeatures: number
  assumptions: number
  mvpFeatures: number
  capabilities: number
  featureMvpLinks: number
  featureCapabilityEdges: number
  featureCapabilityCitations: number
  collapsedDuplicateCitations: number
  ambiguousMvpOwners: number
  releaseConflicts: number
  phaseConflicts: number
  unmatchedLinks: number
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const FRIENDLY_UNREACHABLE =
  'Cannot reach the server. Check that it is running, then try again.'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
      ...init,
    })
  } catch {
    // Network-level failure: the server is down or unreachable.
    throw new ApiError(0, FRIENDLY_UNREACHABLE)
  }

  if (!response.ok) {
    // An unparseable body usually means nothing handled the request at all,
    // so treat it as unreachable rather than surfacing a bare status code.
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    throw new ApiError(response.status, body?.error ?? FRIENDLY_UNREACHABLE)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export type CreateFeatureBody = {
  id: string
  name: string
  foundational_build: string
  release_id: string
  phase_id: string
}

export type UpdateFeatureBody = Partial<Omit<CreateFeatureBody, 'id'>> & {
  capability_note?: string | null
}

export type DeleteFeatureResult = {
  deleted: number
  cascaded: { assumptions: number; mvpLinks: number; capabilityLinks: number }
}

export const apiClient = {
  health: () => request<{ status: string; uptime: number }>('/api/health'),

  scope: {
    get: () => request<ScopeGraph>('/api/scope'),
  },

  import: {
    run: () =>
      request<{ status: string; summary: ImportSummary }>('/api/import', { method: 'POST' }),
  },

  features: {
    nextId: () => request<{ id: string }>('/api/features/next-id'),

    create: (body: CreateFeatureBody) =>
      request<PwcFeatureRow>('/api/features', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    update: (id: string, body: UpdateFeatureBody) =>
      request<PwcFeatureRow>(`/api/features/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),

    remove: (id: string, cascade = false) =>
      request<DeleteFeatureResult>(
        `/api/features/${encodeURIComponent(id)}?cascade=${cascade ? 'true' : 'false'}`,
        { method: 'DELETE' },
      ),
  },
}
