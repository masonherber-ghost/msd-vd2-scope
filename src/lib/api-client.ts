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
  /** A question someone raised about this capability, or null. */
  question: string | null
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

export type ReleaseAlias = {
  id: string
  from: string
  to: string
  rationale: string
  decidedOn: string
}

export type ScopeGraph = {
  overrides: ScopeOverride[]
  releaseAliases: ReleaseAlias[]
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
  /** Imported releases the sources no longer name, dropped on re-import. */
  removedReleases: string[]
  /** Stale releases kept because rows still point at them. */
  retainedStaleReleases: { id: string; features: number; capabilities: number }[]
  /** Imported MVP records the sources no longer produce, dropped on re-import. */
  removedMvpFeatures: { ref: number; scope_option: string | null }[]
  /** Stale MVP records kept because rows still point at them. */
  retainedStaleMvpFeatures: {
    ref: number
    scope_option: string | null
    dependents: number
  }[]
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

export type MoveDirection = 'up' | 'down'

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

    setMvpLinks: (id: string, mvpFeatureIds: number[]) =>
      request<{ pwc_feature_id: string; mvpFeatureIds: number[] }>(
        `/api/features/${encodeURIComponent(id)}/mvp-features`,
        { method: 'PUT', body: JSON.stringify({ mvpFeatureIds }) },
      ),

    setCapabilityLinks: (id: string, capabilityIds: number[]) =>
      request<{ pwc_feature_id: string; capabilityIds: number[] }>(
        `/api/features/${encodeURIComponent(id)}/capabilities`,
        { method: 'PUT', body: JSON.stringify({ capabilityIds }) },
      ),

    remove: (id: string, cascade = false) =>
      request<DeleteFeatureResult>(
        `/api/features/${encodeURIComponent(id)}?cascade=${cascade ? 'true' : 'false'}`,
        { method: 'DELETE' },
      ),
  },

  releases: {
    create: (body: { id: string; label: string; name: string; description: string }) =>
      request<ReleaseRow>('/api/releases', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Partial<{ label: string; name: string; description: string }>) =>
      request<ReleaseRow>(`/api/releases/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    remove: (id: string) =>
      request<{ deleted: number }>(`/api/releases/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
  },

  phases: {
    create: (body: {
      id: string
      name: string
      epic_ref: string
      epic_description: string
    }) => request<PhaseRow>('/api/phases', { method: 'POST', body: JSON.stringify(body) }),
    update: (
      id: string,
      body: Partial<{ name: string; epic_ref: string; epic_description: string }>,
    ) =>
      request<PhaseRow>(`/api/phases/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    move: (id: string, direction: MoveDirection) =>
      request<{ moved: boolean; phases: PhaseRow[] }>(
        `/api/phases/${encodeURIComponent(id)}/move`,
        { method: 'POST', body: JSON.stringify({ direction }) },
      ),
    remove: (id: string) =>
      request<{ deleted: number; phases: PhaseRow[] }>(
        `/api/phases/${encodeURIComponent(id)}`,
        { method: 'DELETE' },
      ),
  },

  assumptions: {
    create: (pwcFeatureId: string, text: string) =>
      request<{ assumption: AssumptionRow; assumptions: AssumptionRow[] }>(
        '/api/assumptions',
        { method: 'POST', body: JSON.stringify({ pwc_feature_id: pwcFeatureId, text }) },
      ),
    update: (id: number, text: string) =>
      request<AssumptionRow>(`/api/assumptions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ text }),
      }),
    move: (id: number, direction: MoveDirection) =>
      request<{ moved: boolean; assumptions: AssumptionRow[] }>(
        `/api/assumptions/${id}/move`,
        { method: 'POST', body: JSON.stringify({ direction }) },
      ),
    remove: (id: number) =>
      request<{ deleted: number; assumptions: AssumptionRow[] }>(`/api/assumptions/${id}`, {
        method: 'DELETE',
      }),
  },

  mvpFeatures: {
    create: (body: { ref: number; scope_option: '1A' | '1B' | null; title: string }) =>
      request<MvpFeatureRow>('/api/mvp-features', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (
      id: number,
      body: Partial<{ title: string; scope_option: '1A' | '1B' | null }>,
    ) =>
      request<MvpFeatureRow>(`/api/mvp-features/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    remove: (id: number) =>
      request<{ deleted: number }>(`/api/mvp-features/${id}`, { method: 'DELETE' }),
  },

  capabilities: {
    create: (body: {
      mvp_ref: number
      text: string
      actor: CapabilityRow['actor']
      release_id: string
      phase_id: string
    }) =>
      request<CapabilityRow>('/api/capabilities', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (
      id: number,
      body: Partial<{
        text: string
        actor: CapabilityRow['actor']
        release_id: string
        phase_id: string
        /** Null clears the question. */
        question: string | null
      }>,
    ) =>
      request<CapabilityRow>(`/api/capabilities/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    remove: (id: number) =>
      request<{ deleted: number }>(`/api/capabilities/${id}`, { method: 'DELETE' }),
  },

  conflicts: {
    resolve: (
      id: number,
      body: { resolution_state: string; resolution_note: string | null },
    ) =>
      request<FeatureCapabilityLinkRow>(`/api/conflicts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
  },
}
