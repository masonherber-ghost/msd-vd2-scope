import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Filter } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { FeatureDetailPanel } from '@/components/FeatureDetailPanel'
import { MvpDetailPanel } from '@/components/MvpDetailPanel'
import { CapabilityDetailPanel } from '@/components/CapabilityDetailPanel'
import { FeatureForm, type FeatureFormValues } from '@/components/FeatureForm'
import { FilterRail } from '@/components/FilterRail'
import { ScopeMapGrid } from '@/components/ScopeMapGrid'
import { ReleaseHorizons, ScopeMapChrome } from '@/components/ScopeMapChrome'
import { ScopeSearch } from '@/components/ScopeSearch'
import {
  useCreateFeature,
  useDeleteFeature,
  useNextFeatureId,
  useSetCapabilityLinks,
  useSetMvpLinks,
  useUpdateFeature,
} from '@/hooks/useFeatureMutations'
import {
  useCreateAssumption,
  useDeleteAssumption,
  useDeleteCapability,
  useMoveAssumption,
  useResolveConflict,
  useSetMvpCapabilities,
  useSetMvpPlacement,
  useUpdateAssumption,
  useUpdateCapability,
} from '@/hooks/useEntityMutations'
import { useScope } from '@/hooks/useScope'
import { buildFeatureDetail } from '@/lib/feature-detail'
import {
  buildScopeMap,
  projectCells,
  rowModeFor,
  rowsFor,
  type ViewMode,
} from '@/lib/scope-derive'
import {
  applyMvpFilters,
  blameMvpGroups,
  buildMvpCards,
  mvpCardLabel,
  projectMvpCells,
} from '@/lib/mvp-derive'
import {
  applyCapabilityFilters,
  blameCapabilityGroups,
  buildCapabilityCards,
  projectCapabilityCells,
} from '@/lib/capability-derive'
import { buildConflictModel, unreviewedFeatureIds } from '@/lib/scope-conflicts'
import { buildEdges, connectionDensity } from '@/lib/scope-edges'
import { searchScope, type SearchHit } from '@/lib/scope-search'
import {
  EMPTY_FILTERS,
  GROUP_LABEL,
  activeGroups,
  applyFilters,
  toggleValue,
  blameGroups,
  isEmpty,
  parseFilters,
  withoutGroup,
  writeFilters,
  type FilterState,
} from '@/lib/scope-filters'

const MIN_ZOOM = 0.4
const MAX_ZOOM = 1.4
const STEP = 0.1

const clamp = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))

export default function ScopeMap() {
  const scope = useScope()
  const [zoom, setZoom] = useState(1)
  const [query, setQuery] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  // The URL is the single source of truth for filter state (R-10.2), so a
  // pasted link reproduces the view and browser back steps through it.
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = useMemo(() => parseFilters(searchParams), [searchParams])

  const setFilters = useCallback(
    (next: FilterState) => {
      setSearchParams((current) => writeFilters(next, current), { replace: false })
    },
    [setSearchParams],
  )

  /**
   * The view is URL state like everything else, so a link reproduces the tab
   * the sender was on. Release view is the default: it keeps every cell
   * addressable by the release + phase pair the create flow pre-fills from.
   */
  const viewParam = searchParams.get('view')
  const view: ViewMode =
    viewParam === 'actor' || viewParam === 'mvp' || viewParam === 'capability'
      ? viewParam
      : 'release'
  const rowMode = rowModeFor(view)

  const setView = useCallback(
    (next: ViewMode) => {
      setSearchParams((current) => {
        const params = new URLSearchParams(current)
        if (next === 'release') params.delete('view')
        else params.set('view', next)
        // Both selections stay in the URL. Each view reads only its own id,
        // so nothing stale renders, and coming back to a view restores the
        // panel that was open in it.
        return params
      })
    },
    [setSearchParams],
  )

  // Selection lives in the URL too, so a link reproduces the open panel and
  // the panel survives a reload (R-10.2).
  const selectedId = searchParams.get('selected')
  const selectedMvpParam = Number(searchParams.get('selectedMvp'))
  const selectedMvpId = Number.isInteger(selectedMvpParam) && selectedMvpParam > 0
    ? selectedMvpParam
    : null

  const selectedCapabilityParam = Number(searchParams.get('selectedCapability'))
  const selectedCapabilityId =
    Number.isInteger(selectedCapabilityParam) && selectedCapabilityParam > 0
      ? selectedCapabilityParam
      : null

  const setSelectedCapability = useCallback(
    (capabilityId: number | null) => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current)
        if (capabilityId) next.set('selectedCapability', String(capabilityId))
        else next.delete('selectedCapability')
        return next
      })
    },
    [setSearchParams],
  )

  const setSelectedMvp = useCallback(
    (mvpId: number | null) => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current)
        if (mvpId) next.set('selectedMvp', String(mvpId))
        else next.delete('selectedMvp')
        return next
      })
    },
    [setSearchParams],
  )

  const setSelected = useCallback(
    (featureId: string | null) => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current)
        if (featureId) next.set('selected', featureId)
        else next.delete('selected')
        return next
      })
    },
    [setSearchParams],
  )

  /** Toggles selection, so clicking the open card closes the panel. */
  const toggleSelected = useCallback(
    (featureId: string) => setSelected(featureId === selectedId ? null : featureId),
    [selectedId, setSelected],
  )

  /** Pivots the map to an MVP ref, leaving the panel open (R-8.16). */
  const pivotToMvp = useCallback(
    (ref: number) => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current)
        const already = parseFilters(current).mvp
        const mvp = already.includes(ref)
          ? already.filter((r) => r !== ref)
          : [...already, ref]
        if (mvp.length === 0) next.delete('mvp')
        else next.set('mvp', mvp.join(','))
        return next
      })
    },
    [setSearchParams],
  )

  const model = useMemo(
    () => (scope.data ? buildScopeMap(scope.data) : null),
    [scope.data],
  )

  // All filtering is client-side over the one payload — no refetch, no
  // spinner (R-10.7).
  const visible = useMemo(
    () => (model ? applyFilters(model.features, filters) : []),
    [model, filters],
  )

  const projected = useMemo(
    () => (model ? projectCells(model, visible, rowMode) : null),
    [model, visible, rowMode],
  )

  const rows = useMemo(() => (model ? rowsFor(model, rowMode) : []), [model, rowMode])

  // ---- MSD-feature view --------------------------------------------------
  // Built unconditionally: it is cheap, pure, and derived from the same
  // payload, so switching tabs never waits on anything (R-10.7).
  const mvpCards = useMemo(
    () => (scope.data ? buildMvpCards(scope.data) : []),
    [scope.data],
  )

  const visibleMvpCards = useMemo(
    () => applyMvpFilters(mvpCards, filters),
    [mvpCards, filters],
  )

  const mvpProjection = useMemo(
    () => projectMvpCells(visibleMvpCards),
    [visibleMvpCards],
  )

  const isMvpView = view === 'mvp'
  const isCapabilityView = view === 'capability'

  // ---- Capability view ---------------------------------------------------
  const capabilityCards = useMemo(
    () => (scope.data ? buildCapabilityCards(scope.data) : []),
    [scope.data],
  )

  const visibleCapabilityCards = useMemo(
    () => applyCapabilityFilters(capabilityCards, filters),
    [capabilityCards, filters],
  )

  const capabilityProjection = useMemo(
    () => projectCapabilityCells(visibleCapabilityCards),
    [visibleCapabilityCards],
  )

  const selectedCapabilityCard = useMemo(
    () => capabilityCards.find((card) => card.id === selectedCapabilityId) ?? null,
    [capabilityCards, selectedCapabilityId],
  )

  const selectedMvpCard = useMemo(
    () => mvpCards.find((card) => card.id === selectedMvpId) ?? null,
    [mvpCards, selectedMvpId],
  )

  const releaseLabelMap = useMemo(
    () => new Map((model?.releases ?? []).map((r) => [r.id, r.label])),
    [model],
  )

  const phaseNameMap = useMemo(
    () => new Map((model?.phases ?? []).map((p) => [p.id, p.name])),
    [model],
  )

  // Blame is answered against whichever set the view is actually showing —
  // naming a group that emptied the other view would send someone after the
  // wrong filter (R-8.10).
  const blame = useMemo(() => {
    if (isMvpView) return blameMvpGroups(mvpCards, filters)
    if (isCapabilityView) return blameCapabilityGroups(capabilityCards, filters)
    return model ? blameGroups(model.features, filters) : []
  }, [isMvpView, isCapabilityView, mvpCards, capabilityCards, model, filters])

  // Edges follow the filtered view, so a hidden feature never anchors one.
  const results = useMemo(
    () => (scope.data ? searchScope(scope.data, query) : { query: '', groups: [], total: 0, flat: [] }),
    [scope.data, query],
  )

  /**
   * Enter reveals the feature on the map. The term is carried in the URL so
   * the detail panel can highlight it on arrival, and so the whole view is
   * still reproducible from a link (R-10.2).
   */
  const revealHit = useCallback(
    (hit: SearchHit) => {
      if (!hit.featureId) return
      setSearchParams((current) => {
        const next = new URLSearchParams(current)
        next.set('selected', hit.featureId as string)
        if (query.trim()) next.set('q', query.trim())
        else next.delete('q')
        return next
      })
    },
    [query, setSearchParams],
  )

  const highlight = searchParams.get('q') ?? ''

  const edges = useMemo(() => buildEdges(visible), [visible])
  const density = useMemo(() => connectionDensity(edges), [edges])

  // A conflict is visible on the map without opening the reconciliation
  // view, and stops being flagged once someone has decided (R-7.4).
  const unreviewedIds = useMemo(
    () => (scope.data ? unreviewedFeatureIds(buildConflictModel(scope.data)) : new Set<string>()),
    [scope.data],
  )

  // Counts the active groups, not the selected values — the badge answers
  // "how many filters are narrowing this", which is what the rail hides.
  const activeFilterCount = useMemo(() => activeGroups(filters).length, [filters])

  const detail = useMemo(
    () =>
      scope.data && selectedId && !isMvpView && !isCapabilityView
        ? buildFeatureDetail(scope.data, selectedId)
        : null,
    [scope.data, selectedId, isMvpView, isCapabilityView],
  )

  // Each view has its own panel; only one can be open at a time.
  const mvpDetail = isMvpView ? selectedMvpCard : null
  const capabilityDetail = isCapabilityView ? selectedCapabilityCard : null
  const panelOpen = detail !== null || mvpDetail !== null || capabilityDetail !== null

  // ---- Create / edit / delete -------------------------------------------
  const [creatingIn, setCreatingIn] = useState<{
    releaseId: string
    phaseId: string
  } | null>(null)
  const [dirty, setDirty] = useState(false)
  // The rail is hidden until asked for, then opens as a column beside the map.
  const [filtersOpen, setFiltersOpen] = useState(false)

  const createFeature = useCreateFeature()
  const updateFeature = useUpdateFeature()
  const deleteFeature = useDeleteFeature()
  const addAssumption = useCreateAssumption()
  const editAssumption = useUpdateAssumption()
  const moveAssumption = useMoveAssumption()
  const removeAssumption = useDeleteAssumption()
  const resolveConflict = useResolveConflict()
  const updateCapability = useUpdateCapability()
  const deleteCapability = useDeleteCapability()
  const setMvpLinks = useSetMvpLinks()
  const setCapabilityLinks = useSetCapabilityLinks()
  const setMvpCapabilities = useSetMvpCapabilities()
  const setMvpPlacement = useSetMvpPlacement()
  const nextId = useNextFeatureId(creatingIn !== null)

  // ---- Options for the panel's editors ----------------------------------
  const releaseOptions = useMemo(
    () => (model ? model.releases.map((r) => ({ value: r.id, label: r.label })) : []),
    [model],
  )

  const phaseOptions = useMemo(
    () =>
      model
        ? model.phases.map((p) => ({
            value: p.id,
            label: `${p.display_order}. ${p.name} · epic ${p.epic_ref}`,
          }))
        : [],
    [model],
  )

  const mvpOptions = useMemo(
    () =>
      scope.data
        ? scope.data.mvpFeatures
            .slice()
            .sort(
              (a, b) =>
                a.ref - b.ref || (a.scope_option ?? '').localeCompare(b.scope_option ?? ''),
            )
            .map((mvp) => ({
              id: mvp.id,
              label: `${mvp.ref}${mvp.scope_option ? ` · Option ${mvp.scope_option}` : ''}`,
              hint: mvp.title,
            }))
        : [],
    [scope.data],
  )

  /**
   * Every capability is selectable, but the ones under this feature's own MVP
   * refs are marked related — assigning a capability from an unrelated ref is
   * allowed and visible rather than blocked.
   */
  const capabilityOptions = useMemo(() => {
    if (!scope.data || !detail) return []
    const ownRefs = new Set(detail.mvpFeatures.map((m) => m.ref))
    const releaseLabel = new Map(scope.data.releases.map((r) => [r.id, r.label]))
    return scope.data.capabilities
      .slice()
      .sort((a, b) => a.mvp_ref - b.mvp_ref || a.text.localeCompare(b.text))
      .map((capability) => ({
        id: capability.id,
        label: capability.text,
        hint: `${capability.mvp_ref} · ${capability.actor}`,
        badge: capability.release_id
          ? (releaseLabel.get(capability.release_id) ?? capability.release_id)
          : 'unplaced',
        related: ownRefs.has(capability.mvp_ref),
      }))
  }, [scope.data, detail])

  /**
   * The same lookup for the MSD panel, where ticking a box changes who *owns*
   * the capability rather than who cites it. Every capability is offered, and
   * one owned elsewhere says so — reassigning it takes it off that record.
   */
  const mvpCapabilityOptions = useMemo(() => {
    if (!scope.data || !mvpDetail) return []
    const releaseLabel = new Map(scope.data.releases.map((r) => [r.id, r.label]))
    const ownerLabel = new Map(
      scope.data.mvpFeatures.map((m) => [
        m.id,
        mvpCardLabel({ ref: m.ref, scopeOption: m.scope_option }),
      ]),
    )
    return scope.data.capabilities
      .slice()
      .sort((a, b) => a.mvp_ref - b.mvp_ref || a.text.localeCompare(b.text))
      .map((capability) => {
        const owner =
          capability.mvp_feature_id === null
            ? 'no MSD feature'
            : capability.mvp_feature_id === mvpDetail.id
              ? 'this record'
              : `owned by ${ownerLabel.get(capability.mvp_feature_id) ?? capability.mvp_feature_id}`
        return {
          id: capability.id,
          label: capability.text,
          hint: `${capability.mvp_ref} · ${capability.actor} · ${owner}`,
          badge: capability.release_id
            ? (releaseLabel.get(capability.release_id) ?? capability.release_id)
            : 'unplaced',
          // Cited under this record's ref, which is where its capabilities
          // would normally come from.
          related: capability.mvp_ref === mvpDetail.ref,
        }
      })
  }, [scope.data, mvpDetail])

  const ownedCapabilityIds = useMemo(
    () => (mvpDetail ? mvpDetail.capabilities.map((c) => c.id) : []),
    [mvpDetail],
  )

  const linkedMvpIds = useMemo(
    () =>
      scope.data && selectedId
        ? scope.data.featureMvpLinks
            .filter((link) => link.pwc_feature_id === selectedId)
            .map((link) => link.mvp_feature_id)
        : [],
    [scope.data, selectedId],
  )

  const linkedCapabilityIds = useMemo(
    () =>
      scope.data && selectedId
        ? scope.data.featureCapabilityLinks
            .filter((link) => link.pwc_feature_id === selectedId)
            .map((link) => link.capability_id)
        : [],
    [scope.data, selectedId],
  )

  /** Warns before discarding an in-progress edit (R-10.8). */
  const confirmDiscard = useCallback(() => {
    if (!dirty) return true
    return window.confirm('You have unsaved changes. Discard them?')
  }, [dirty])

  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const closePanel = useCallback(() => {
    if (!confirmDiscard()) return
    setDirty(false)
    setSelected(null)
  }, [confirmDiscard, setSelected])

  const startCreate = useCallback(
    (rowKey: string, phaseId: string) => {
      if (!confirmDiscard()) return
      setDirty(false)
      // In actor view the row is an actor, which is not a feature property —
      // only the phase can be pre-filled, and the form asks for the release.
      const releaseId = rowMode === 'release' ? rowKey : ''
      setCreatingIn({ releaseId, phaseId })
    },
    [confirmDiscard, rowMode],
  )

  const cancelCreate = useCallback(() => {
    if (!confirmDiscard()) return
    setDirty(false)
    setCreatingIn(null)
    createFeature.reset()
  }, [confirmDiscard, createFeature])

  const submitCreate = useCallback(
    (values: FeatureFormValues) => {
      createFeature.mutate(values, {
        onSuccess: (created) => {
          setDirty(false)
          setCreatingIn(null)
          setSelected(created.id)
        },
      })
    },
    [createFeature, setSelected],
  )

  /** Scales the grid so its full width fits the viewport (R-8.7). */
  const fitToWidth = useCallback(() => {
    const container = scrollRef.current
    const content = contentRef.current
    if (!container || !content) return
    const available = container.clientWidth
    // offsetWidth is the unscaled width, so the ratio is the scale we need.
    const natural = content.offsetWidth
    if (!available || !natural) return
    setZoom(clamp(available / natural))
  }, [])

  // Fit once the grid has rendered at its natural size.
  useLayoutEffect(() => {
    if (model) fitToWidth()
  }, [model, fitToWidth])

  return (
    <div className="flex flex-col gap-4">
      {model ? (
        <ScopeMapChrome
          view={view}
          onViewChange={setView}
          releases={model.releases}
          featuresByRelease={model.totals.featuresByRelease}
          capabilitiesByRelease={model.totals.capabilitiesByRelease}
          activeReleases={filters.release}
          onToggleRelease={(releaseId) =>
            setFilters({ ...filters, release: toggleValue(filters.release, releaseId) })
          }
        />
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="max-w-md">
            <ScopeSearch
              value={query}
              onChange={setQuery}
              results={results}
              onSelect={revealHit}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={filtersOpen ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-pressed={filtersOpen}
            aria-expanded={filtersOpen}
            aria-controls="scope-filter-rail"
            aria-label={
              activeFilterCount > 0
                ? `Filters, ${activeFilterCount} active`
                : 'Filters'
            }
          >
            <Filter aria-hidden="true" />
            Filters
            {activeFilterCount > 0 ? (
              <span className="rounded-full bg-background px-1.5 text-foreground tabular-nums">
                {activeFilterCount}
              </span>
            ) : null}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setZoom((z) => clamp(z - STEP))}
            disabled={zoom <= MIN_ZOOM}
            aria-label="Zoom out"
          >
            −
          </Button>
          <span
            className="w-12 text-center text-sm tabular-nums text-muted-foreground"
            role="status"
            aria-live="polite"
            aria-label="Zoom level"
          >
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setZoom((z) => clamp(z + STEP))}
            disabled={zoom >= MAX_ZOOM}
            aria-label="Zoom in"
          >
            +
          </Button>
          <Button variant="outline" size="sm" onClick={fitToWidth}>
            Fit
          </Button>
          <Button variant="outline" size="sm" onClick={() => setZoom(1)}>
            100%
          </Button>
        </div>
      </div>

      {scope.isPending ? (
        <p className="text-sm text-muted-foreground">Loading scope…</p>
      ) : scope.isError ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="text-sm text-destructive">{scope.error.message}</p>
          <Button variant="outline" size="sm" onClick={() => void scope.refetch()}>
            Try again
          </Button>
        </div>
      ) : model && projected ? (
        <div
          className={`flex flex-col gap-4 lg:grid lg:items-start ${
            filtersOpen && panelOpen
              ? 'lg:grid-cols-[14rem_minmax(0,1fr)_22rem]'
              : filtersOpen
                ? 'lg:grid-cols-[16rem_minmax(0,1fr)]'
                : panelOpen
                  ? 'lg:grid-cols-[minmax(0,1fr)_22rem]'
                  : 'lg:grid-cols-1'
          }`}
        >
          {filtersOpen ? (
            <FilterRail
              id="scope-filter-rail"
              model={model}
              state={filters}
              onChange={setFilters}
              visible={visible}
              onClose={() => setFiltersOpen(false)}
            />
          ) : null}

          <div className="flex min-w-0 flex-col gap-4">
            {creatingIn ? (
              <FeatureForm
                releases={model.releases}
                phases={model.phases}
                initial={{
                  id: '',
                  name: '',
                  foundational_build: '',
                  release_id: creatingIn.releaseId,
                  phase_id: creatingIn.phaseId,
                }}
                suggestedId={nextId.data?.id}
                pending={createFeature.isPending}
                serverError={
                  createFeature.isError ? createFeature.error.message : null
                }
                onSubmit={submitCreate}
                onCancel={cancelCreate}
                onDirtyChange={setDirty}
              />
            ) : null}

            {(isMvpView
              ? visibleMvpCards.length
              : isCapabilityView
                ? visibleCapabilityCards.length
                : visible.length) === 0 ? (
              <ZeroResults
                subject={
                  isMvpView
                    ? 'MSD features'
                    : isCapabilityView
                      ? 'capabilities'
                      : 'features'
                }
                blame={blame}
                onDrop={(group) => setFilters(withoutGroup(filters, group))}
                onClearAll={() => setFilters(EMPTY_FILTERS)}
                onShowFilters={filtersOpen ? undefined : () => setFiltersOpen(true)}
              />
            ) : (
              <ScopeMapGrid
                model={{ ...model, ...projected }}
                rows={rows}
                view={view}
                zoom={zoom}
                scrollRef={scrollRef}
                contentRef={(node) => {
                  contentRef.current = node
                }}
                // Edges join PwC features through a shared MVP feature. In
                // MSD view the MVP feature *is* the card, so the edge would
                // only ever point at itself.
                edges={isMvpView ? [] : edges}
                density={density}
                unreviewedIds={unreviewedIds}
                selectedId={selectedId}
                onSelect={(id) => {
                  if (!confirmDiscard()) return
                  setDirty(false)
                  toggleSelected(id)
                }}
                onAddToCell={startCreate}
                mvpCellIndex={mvpProjection.cellIndex}
                selectedMvpId={selectedMvpId}
                onSelectMvp={(id) => {
                  if (!confirmDiscard()) return
                  setDirty(false)
                  setSelectedMvp(id === selectedMvpId ? null : id)
                }}
                capabilityCellIndex={capabilityProjection.cellIndex}
                selectedCapabilityId={selectedCapabilityId}
                onSelectCapability={(id) => {
                  if (!confirmDiscard()) return
                  setDirty(false)
                  setSelectedCapability(id === selectedCapabilityId ? null : id)
                }}
              />
            )}

            {isCapabilityView && capabilityProjection.unplaced.length > 0 ? (
              <section
                className="rounded-lg border border-border p-4"
                aria-labelledby="capability-unplaced"
              >
                <h2 className="text-sm font-semibold" id="capability-unplaced">
                  Not on the map ({capabilityProjection.unplaced.length})
                </h2>
                <p className="text-sm text-muted-foreground">
                  The sequencing table never matched these, so they have no release or
                  stage. Listed rather than dropped.
                </p>
                <ul className="mt-2 flex flex-col gap-1 text-sm">
                  {capabilityProjection.unplaced.map((card) => (
                    <li key={card.id}>
                      <span className="font-medium">{card.ref}</span>{' '}
                      <span className="text-muted-foreground">{card.text}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {isMvpView && mvpProjection.unplaced.length > 0 ? (
              <section
                className="rounded-lg border border-border p-4"
                aria-labelledby="mvp-unplaced"
              >
                <h2 className="text-sm font-semibold" id="mvp-unplaced">
                  Not on the map ({mvpProjection.unplaced.length})
                </h2>
                <p className="text-sm text-muted-foreground">
                  These MSD features own no placed capability and no PwC feature cites
                  them, so neither source puts them anywhere. Listed rather than dropped.
                </p>
                <ul className="mt-2 flex flex-wrap gap-2 text-sm">
                  {mvpProjection.unplaced.map((card) => (
                    <li
                      key={card.id}
                      className="rounded-md border border-border px-2 py-1"
                    >
                      <span className="font-medium">{card.ref}</span>{' '}
                      <span className="text-muted-foreground">{card.title}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
              <div className="flex gap-2">
                <dt>
                  {isMvpView
                    ? 'MSD features'
                    : isCapabilityView
                      ? 'Capabilities shown'
                      : 'Features'}
                </dt>
                <dd className="font-medium text-foreground">
                  {isCapabilityView
                    ? isEmpty(filters)
                      ? capabilityCards.length
                      : `${visibleCapabilityCards.length} of ${capabilityCards.length}`
                    : isMvpView
                      ? isEmpty(filters)
                        ? mvpCards.length
                        : `${visibleMvpCards.length} of ${mvpCards.length}`
                      : isEmpty(filters)
                        ? model.totals.features
                        : `${visible.length} of ${model.totals.features}`}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt>Populated cells</dt>
                <dd className="font-medium text-foreground">
                  {isMvpView
                    ? mvpProjection.totals.populatedCells
                    : isCapabilityView
                      ? capabilityProjection.totals.populatedCells
                      : projected.totals.populatedCells}{' '}
                  of {model.totals.totalCells}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt>Capabilities</dt>
                <dd className="font-medium text-foreground">
                  {scope.data.counts.capabilities}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt>Unreviewed conflicts</dt>
                <dd className="font-medium text-foreground">
                  {scope.data.counts.unresolvedConflicts}
                </dd>
              </div>
            </dl>

            <ReleaseHorizons
              releases={model.releases}
              featuresByRelease={model.totals.featuresByRelease}
              capabilitiesByRelease={model.totals.capabilitiesByRelease}
            />
          </div>

          {capabilityDetail ? (
            <CapabilityDetailPanel
              card={capabilityDetail}
              onClose={() => setSelectedCapability(null)}
              releaseLabels={releaseLabelMap}
              phaseNames={phaseNameMap}
              onSaveText={(text) =>
                updateCapability.mutateAsync({
                  id: capabilityDetail.id,
                  patch: { text },
                })
              }
              onSaveQuestion={(question) =>
                updateCapability.mutateAsync({
                  id: capabilityDetail.id,
                  patch: { question },
                })
              }
              onDirtyChange={setDirty}
              onDelete={async (cascade) => {
                await deleteCapability.mutateAsync({
                  id: capabilityDetail.id,
                  cascade,
                })
                // Nothing left to show, so the panel closes itself.
                setSelectedCapability(null)
              }}
              onSelectFeature={(id) => {
                // Jumping to a PwC feature means leaving this view — the
                // feature panel only exists in the feature views.
                setSearchParams((current) => {
                  const next = new URLSearchParams(current)
                  next.delete('view')
                  next.delete('selectedCapability')
                  next.set('selected', id)
                  return next
                })
              }}
              onSelectMvpFeature={(id) => {
                // The MSD record's own panel lives in the MSD-feature view.
                setSearchParams((current) => {
                  const next = new URLSearchParams(current)
                  next.set('view', 'mvp')
                  next.delete('selectedCapability')
                  next.set('selectedMvp', String(id))
                  return next
                })
              }}
            />
          ) : null}

          {mvpDetail ? (
            <MvpDetailPanel
              card={mvpDetail}
              onClose={() => setSelectedMvp(null)}
              releaseLabels={releaseLabelMap}
              phaseNames={phaseNameMap}
              capabilityOptions={mvpCapabilityOptions}
              ownedCapabilityIds={ownedCapabilityIds}
              onSetCapabilities={(capabilityIds) =>
                setMvpCapabilities.mutateAsync({ id: mvpDetail.id, capabilityIds })
              }
              releaseOptions={releaseOptions}
              phaseOptions={phaseOptions}
              onSetPlacement={(patch) =>
                setMvpPlacement.mutateAsync({ id: mvpDetail.id, patch })
              }
              onDirtyChange={setDirty}
              onSelectFeature={(id) => {
                // Jumping to a PwC feature means leaving this view — the
                // feature panel only exists in the feature views.
                setSearchParams((current) => {
                  const next = new URLSearchParams(current)
                  next.delete('view')
                  next.delete('selectedMvp')
                  next.set('selected', id)
                  return next
                })
              }}
            />
          ) : null}

          {detail ? (
            <FeatureDetailPanel
              detail={detail}
              onClose={closePanel}
              onPivotToMvp={pivotToMvp}
              onSelectFeature={(id) => {
                if (!confirmDiscard()) return
                setDirty(false)
                setSelected(id)
              }}
              activeMvpRefs={filters.mvp}
              onSaveField={(patch) =>
                updateFeature.mutateAsync({ id: detail.id, patch })
              }
              onDelete={async (cascade) => {
                await deleteFeature.mutateAsync({ id: detail.id, cascade })
                setSelected(null)
              }}
              onDirtyChange={setDirty}
              highlight={highlight}
              releaseOptions={releaseOptions}
              phaseOptions={phaseOptions}
              mvpOptions={mvpOptions}
              capabilityOptions={capabilityOptions}
              linkedMvpIds={linkedMvpIds}
              linkedCapabilityIds={linkedCapabilityIds}
              onSetMvpLinks={(mvpFeatureIds) =>
                setMvpLinks.mutateAsync({ id: detail.id, mvpFeatureIds })
              }
              onSetCapabilityLinks={(capabilityIds) =>
                setCapabilityLinks.mutateAsync({ id: detail.id, capabilityIds })
              }
              onKeepCapability={(linkId, note) =>
                // Keeping it means the capability's placement stands, which
                // is the MSD sequencing being right.
                resolveConflict.mutateAsync({ id: linkId, state: 'table_wins', note })
              }
              onMoveCapability={(capabilityId, releaseId, phaseId) =>
                updateCapability.mutateAsync({
                  id: capabilityId,
                  patch: { release_id: releaseId, phase_id: phaseId },
                })
              }
              onAddAssumption={(text) =>
                addAssumption.mutateAsync({ featureId: detail.id, text })
              }
              onEditAssumption={(id, text) => editAssumption.mutateAsync({ id, text })}
              onMoveAssumption={(id, direction) =>
                moveAssumption.mutateAsync({ id, direction })
              }
              onDeleteAssumption={(id) => removeAssumption.mutateAsync(id)}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** Never a bare empty panel: name the filter to blame and offer to drop it (R-8.10). */
function ZeroResults({
  subject,
  blame,
  onDrop,
  onClearAll,
  onShowFilters,
}: {
  /** What the current view is showing, so the message names it. */
  subject: string
  blame: ReturnType<typeof blameGroups>
  onDrop: (group: ReturnType<typeof blameGroups>[number]) => void
  onClearAll: () => void
  /** Offered only when the rail is closed, so the cause stays reachable. */
  onShowFilters?: () => void
}) {
  return (
    <div
      role="status"
      className="flex flex-col items-start gap-3 rounded-lg border border-border p-6"
    >
      <p className="text-sm font-medium">No {subject} match these filters.</p>

      {blame.length > 0 ? (
        <>
          <p className="text-sm text-muted-foreground">
            {blame.length === 1
              ? `The ${GROUP_LABEL[blame[0]]} filter is what excludes everything.`
              : `Dropping any one of these brings results back: ${blame
                  .map((group) => GROUP_LABEL[group])
                  .join(', ')}.`}
          </p>
          <div className="flex flex-wrap gap-2">
            {blame.map((group) => (
              <Button key={group} variant="outline" size="sm" onClick={() => onDrop(group)}>
                Drop {GROUP_LABEL[group]} filter
              </Button>
            ))}
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          No single filter is responsible — it is the combination.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onClearAll}>
          Clear all filters
        </Button>
        {onShowFilters ? (
          <Button variant="outline" size="sm" onClick={onShowFilters}>
            Show filters
          </Button>
        ) : null}
      </div>
    </div>
  )
}
