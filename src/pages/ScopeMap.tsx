import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { FilterRail } from '@/components/FilterRail'
import { ScopeMapGrid } from '@/components/ScopeMapGrid'
import { useScope } from '@/hooks/useScope'
import { buildScopeMap, projectCells } from '@/lib/scope-derive'
import {
  GROUP_LABEL,
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
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
          <FilterRail
            model={model}
            state={filters}
            onChange={setFilters}
            visible={visible}
          />

          <div className="flex min-w-0 flex-col gap-4">
            {visible.length === 0 ? (
              <ZeroResults
                blame={blame}
                onDrop={(group) => setFilters(withoutGroup(filters, group))}
                onClearAll={() =>
                  setFilters({
                    release: [],
                    phase: [],
                    actor: [],
                    mvp: [],
                    option: [],
                    conflict: [],
                    source: [],
                  })
                }
              />
            ) : (
              <ScopeMapGrid
                model={{ ...model, ...projected }}
                zoom={zoom}
                scrollRef={scrollRef}
                contentRef={contentRef}
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
}: {
  blame: ReturnType<typeof blameGroups>
  onDrop: (group: ReturnType<typeof blameGroups>[number]) => void
  onClearAll: () => void
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

      <Button variant="outline" size="sm" onClick={onClearAll}>
        Clear all filters
      </Button>
    </div>
  )
}
