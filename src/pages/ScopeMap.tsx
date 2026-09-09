import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ScopeMapGrid } from '@/components/ScopeMapGrid'
import { useScope } from '@/hooks/useScope'
import { buildScopeMap } from '@/lib/scope-derive'

const MIN_ZOOM = 0.4
const MAX_ZOOM = 1.4
const STEP = 0.1

const clamp = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))

export default function ScopeMap() {
  const scope = useScope()
  const [zoom, setZoom] = useState(1)
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  const model = useMemo(
    () => (scope.data ? buildScopeMap(scope.data) : null),
    [scope.data],
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
      ) : model ? (
        <>
          <ScopeMapGrid
            model={model}
            zoom={zoom}
            scrollRef={scrollRef}
            contentRef={contentRef}
          />

          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
            <div className="flex gap-2">
              <dt>Features</dt>
              <dd className="font-medium text-foreground">{model.totals.features}</dd>
            </div>
            <div className="flex gap-2">
              <dt>Populated cells</dt>
              <dd className="font-medium text-foreground">
                {model.totals.populatedCells} of {model.totals.totalCells}
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
        </>
      ) : null}
    </div>
  )
}
