import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Filter } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { FeatureDetailPanel } from '@/components/FeatureDetailPanel'
import { FeatureForm, type FeatureFormValues } from '@/components/FeatureForm'
import { FilterRail } from '@/components/FilterRail'
import { ScopeMapGrid } from '@/components/ScopeMapGrid'
import {
  useCreateFeature,
  useDeleteFeature,
  useNextFeatureId,
  useSetCapabilityLinks,
  useSetMvpLinks,
  useUpdateFeature,
} from '@/hooks/useFeatureMutations'
import { useScope } from '@/hooks/useScope'
import { buildFeatureDetail } from '@/lib/feature-detail'
import { buildScopeMap, projectCells } from '@/lib/scope-derive'
import {
  EMPTY_FILTERS,
  GROUP_LABEL,
  activeGroups,
  applyFilters,
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

  // Selection lives in the URL too, so a link reproduces the open panel and
  // the panel survives a reload (R-10.2).
  const selectedId = searchParams.get('selected')

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
    () => (model ? projectCells(model, visible) : null),
    [model, visible],
  )

  const blame = useMemo(
    () => (model ? blameGroups(model.features, filters) : []),
    [model, filters],
  )

  // Counts the active groups, not the selected values — the badge answers
  // "how many filters are narrowing this", which is what the rail hides.
  const activeFilterCount = useMemo(() => activeGroups(filters).length, [filters])

  const detail = useMemo(
    () => (scope.data && selectedId ? buildFeatureDetail(scope.data, selectedId) : null),
    [scope.data, selectedId],
  )

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
  const setMvpLinks = useSetMvpLinks()
  const setCapabilityLinks = useSetCapabilityLinks()
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
    (releaseId: string, phaseId: string) => {
      if (!confirmDiscard()) return
      setDirty(false)
      setCreatingIn({ releaseId, phaseId })
    },
    [confirmDiscard],
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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Scope map</h1>
          <p className="text-sm text-muted-foreground">
            Releases across, canonical phases down. An empty cell means nothing in that phase
            lands in that release.
          </p>
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
            filtersOpen && detail
              ? 'lg:grid-cols-[14rem_minmax(0,1fr)_22rem]'
              : filtersOpen
                ? 'lg:grid-cols-[16rem_minmax(0,1fr)]'
                : detail
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

            {visible.length === 0 ? (
              <ZeroResults
                blame={blame}
                onDrop={(group) => setFilters(withoutGroup(filters, group))}
                onClearAll={() => setFilters(EMPTY_FILTERS)}
                onShowFilters={filtersOpen ? undefined : () => setFiltersOpen(true)}
              />
            ) : (
              <ScopeMapGrid
                model={{ ...model, ...projected }}
                zoom={zoom}
                scrollRef={scrollRef}
                contentRef={contentRef}
                selectedId={selectedId}
                onSelect={(id) => {
                  if (!confirmDiscard()) return
                  setDirty(false)
                  toggleSelected(id)
                }}
                onAddToCell={startCreate}
              />
            )}

            <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
              <div className="flex gap-2">
                <dt>Features</dt>
                <dd className="font-medium text-foreground">
                  {isEmpty(filters)
                    ? model.totals.features
                    : `${visible.length} of ${model.totals.features}`}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt>Populated cells</dt>
                <dd className="font-medium text-foreground">
                  {projected.totals.populatedCells} of {model.totals.totalCells}
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
          </div>

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
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** Never a bare empty panel: name the filter to blame and offer to drop it (R-8.10). */
function ZeroResults({
  blame,
  onDrop,
  onClearAll,
  onShowFilters,
}: {
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
      <p className="text-sm font-medium">No features match these filters.</p>

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
