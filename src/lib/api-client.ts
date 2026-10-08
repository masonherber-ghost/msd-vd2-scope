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
  /** A question someone raised about this feature, or null. */
  question: string | null
  /** Assumptions and notes, as markdown. */
  notes: string
  /** 1 once the notes were edited in the app; import then leaves them alone. */
  notes_edited: number
  display_order: number
  source: string
}

export type MvpFeatureRow = {
  id: number
  ref: number
  scope_option: '1A' | '1B' | null
  title: string
  /** A placement stated on the record, which outranks the derived one. */
  release_id: string | null
  phase_id: string | null
  /** A question someone raised about this record, or null. */
  question: string | null
  /** Free-text detail about this record, as markdown. */
  details: string
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
  mvpFeatures: MvpFeatureRow[]
  capabilities: CapabilityRow[]
  featureMvpLinks: FeatureMvpLinkRow[]
  featureCapabilityLinks: FeatureCapabilityLinkRow[]
  counts: {
    releases: number
    phases: number
    pwcFeatures: number
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

type Store = typeof import('@/lib/scope-store')

/**
 * The data layer is Firestore, loaded on first use: importing this module —
 * for its types, or in a test that mocks `apiClient` — never starts Firebase.
 */
let loadedStore: Store | null = null
async function store(): Promise<Store> {
  loadedStore ??= await import('@/lib/scope-store')
  return loadedStore
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
  /** Null clears the question rather than storing a blank one. */
  question?: string | null
  /** Assumptions and notes, as markdown. */
  notes?: string
}

export type DeleteFeatureResult = {
  deleted: number
  cascaded: { mvpLinks: number; capabilityLinks: number }
}

export type MoveDirection = 'up' | 'down'

/**
 * Every read and write the app makes. The signatures and results are the ones
 * the Express API had, so hooks and components never learned the backend
 * moved; underneath, each call is Firestore via scope-store.ts.
 */
export const apiClient = {
  scope: {
    /** The one read: the whole store (~400 documents), derived into the graph. */
    get: async (): Promise<ScopeGraph> => (await store()).load(),

    /**
     * The graph after the last write, derived from the held store — zero
     * reads. Undefined until the first load. Hooks use this after a mutation
     * instead of refetching.
     */
    cached: (): ScopeGraph | undefined => loadedStore?.cached(),
  },

  features: {
    /** Derived from the held store — no read. */
    nextId: async (): Promise<{ id: string }> => {
      const s = await store()
      const raw = s.heldRaw() ?? (await s.load(), s.heldRaw()!)
      return s.firestore.features.nextId(raw)
    },

    create: async (body: CreateFeatureBody): Promise<PwcFeatureRow> => {
      const s = await store()
      return s.write((session) => s.firestore.features.create(session, body))
    },

    update: async (id: string, body: UpdateFeatureBody): Promise<PwcFeatureRow> => {
      const s = await store()
      return s.write((session) => s.firestore.features.update(session, id, body))
    },

    setMvpLinks: async (
      id: string,
      mvpFeatureIds: number[],
    ): Promise<{ pwc_feature_id: string; mvpFeatureIds: number[] }> => {
      const s = await store()
      return s.write((session) => s.firestore.features.setMvpLinks(session, id, mvpFeatureIds))
    },

    setCapabilityLinks: async (
      id: string,
      capabilityIds: number[],
    ): Promise<{ pwc_feature_id: string; capabilityIds: number[] }> => {
      const s = await store()
      return s.write((session) =>
        s.firestore.features.setCapabilityLinks(session, id, capabilityIds),
      )
    },

    remove: async (id: string, cascade = false): Promise<DeleteFeatureResult> => {
      const s = await store()
      return s.write((session) => s.firestore.features.remove(session, id, cascade))
    },
  },

  releases: {
    create: async (body: {
      id: string
      label: string
      name: string
      description: string
    }): Promise<ReleaseRow> => {
      const s = await store()
      return s.write((session) => s.firestore.releases.create(session, body))
    },
    update: async (
      id: string,
      body: Partial<{ label: string; name: string; description: string }>,
    ): Promise<ReleaseRow> => {
      const s = await store()
      return s.write((session) => s.firestore.releases.update(session, id, body))
    },
    remove: async (id: string): Promise<{ deleted: number }> => {
      const s = await store()
      return s.write((session) => s.firestore.releases.remove(session, id))
    },
  },

  phases: {
    create: async (body: {
      id: string
      name: string
      epic_ref: string
      epic_description: string
    }): Promise<PhaseRow> => {
      const s = await store()
      return s.write((session) => s.firestore.phases.create(session, body))
    },
    update: async (
      id: string,
      body: Partial<{ name: string; epic_ref: string; epic_description: string }>,
    ): Promise<PhaseRow> => {
      const s = await store()
      return s.write((session) => s.firestore.phases.update(session, id, body))
    },
    move: async (
      id: string,
      direction: MoveDirection,
    ): Promise<{ moved: boolean; phases: PhaseRow[] }> => {
      const s = await store()
      return s.write((session) => s.firestore.phases.move(session, id, direction))
    },
    remove: async (id: string): Promise<{ deleted: number; phases: PhaseRow[] }> => {
      const s = await store()
      return s.write((session) => s.firestore.phases.remove(session, id))
    },
  },

  mvpFeatures: {
    create: async (body: {
      ref: number
      scope_option: '1A' | '1B' | null
      title: string
      /** A stated placement, set as the record is created. */
      release_id?: string | null
      phase_id?: string | null
    }): Promise<MvpFeatureRow> => {
      const s = await store()
      return s.write((session) => s.firestore.mvpFeatures.create(session, body))
    },
    update: async (
      id: number,
      body: Partial<{
        title: string
        scope_option: '1A' | '1B' | null
        /** `null` clears the statement, handing the record back to the sources. */
        release_id: string | null
        phase_id: string | null
        /** `null` clears the question rather than storing a blank one. */
        question: string | null
        /** Free-text detail, as markdown. Empty clears it. */
        details: string
      }>,
    ): Promise<MvpFeatureRow> => {
      const s = await store()
      return s.write((session) => s.firestore.mvpFeatures.update(session, id, body))
    },
    /**
     * Re-assigns the record by moving the capabilities it owns. Either axis
     * alone is a valid move.
     */
    setPlacement: async (
      id: number,
      body: { release_id?: string; phase_id?: string },
    ): Promise<{ mvp_feature_id: number; moved: number; capabilityIds: number[] }> => {
      const s = await store()
      return s.write((session) => s.firestore.mvpFeatures.setPlacement(session, id, body))
    },

    /** Replaces the capabilities this record owns with exactly this set. */
    setCapabilities: async (
      id: number,
      capabilityIds: number[],
    ): Promise<{ mvp_feature_id: number; capabilityIds: number[] }> => {
      const s = await store()
      return s.write((session) =>
        s.firestore.mvpFeatures.setCapabilities(session, id, capabilityIds),
      )
    },

    remove: async (id: number): Promise<{ deleted: number }> => {
      const s = await store()
      return s.write((session) => s.firestore.mvpFeatures.remove(session, id))
    },
  },

  capabilities: {
    create: async (body: {
      mvp_ref: number
      text: string
      actor: CapabilityRow['actor']
      release_id: string
      phase_id: string
    }): Promise<CapabilityRow> => {
      const s = await store()
      return s.write((session) => s.firestore.capabilities.create(session, body))
    },
    update: async (
      id: number,
      body: Partial<{
        text: string
        actor: CapabilityRow['actor']
        release_id: string
        phase_id: string
        /** Null clears the question. */
        question: string | null
      }>,
    ): Promise<CapabilityRow> => {
      const s = await store()
      return s.write((session) => s.firestore.capabilities.update(session, id, body))
    },
    /** Cascading also removes the citations pointing at it (R-9.5). */
    remove: async (
      id: number,
      cascade = false,
    ): Promise<{ deleted: number; cascaded: { features: number } }> => {
      const s = await store()
      return s.write((session) => s.firestore.capabilities.remove(session, id, cascade))
    },
  },

  conflicts: {
    resolve: async (
      id: number,
      body: { resolution_state: string; resolution_note: string | null },
    ): Promise<FeatureCapabilityLinkRow> => {
      const s = await store()
      return s.write((session) => s.firestore.conflicts.resolve(session, id, body))
    },
  },

  /** Forget the held store — on sign-out, so another account starts clean. */
  reset: (): void => loadedStore?.reset(),
}
