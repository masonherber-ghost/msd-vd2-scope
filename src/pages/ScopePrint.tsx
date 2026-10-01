import { useMemo } from 'react'
import { Printer } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ActorLegend, SCOPE_MAP_TITLE } from '@/components/ScopeMapChrome'
import { ScopeMapGrid } from '@/components/ScopeMapGrid'
import { ScopePrintSheet } from '@/components/ScopePrintSheet'
import { useScope } from '@/hooks/useScope'
import { parseDetail } from '@/lib/card-detail'
import { buildCapabilityCards, applyCapabilityFilters, projectCapabilityCells } from '@/lib/capability-derive'
import { buildMvpCards, applyMvpFilters, projectMvpCells } from '@/lib/mvp-derive'
import { buildScopeMap, projectCells, rowModeFor, rowsFor, type ViewMode } from '@/lib/scope-derive'
import { SCOPE_VIEW_LABEL, describeFilters } from '@/lib/scope-export'
import { applyFilters, isEmpty, parseFilters } from '@/lib/scope-filters'

/**
 * The map, laid out for paper.
 *
 * The same URL state as the map itself, so `/print` carrying the map's own
 * query string reproduces exactly what the sender was looking at — view,
 * filters and card detail included. Printing from here goes through the
 * browser, which means the sheet comes out as text rather than as a picture
 * of text: searchable, selectable, and sharp however far it is zoomed or
 * however large it is printed.
 *
 * Read-only on purpose. Nothing here selects, edits or filters — a sheet
 * about to be printed is not a place to discover you have changed the map.
 */
export default function ScopePrint() {
  const scope = useScope()
  const [searchParams] = useSearchParams()

  const filters = useMemo(() => parseFilters(searchParams), [searchParams])
  const cardDetail = useMemo(() => parseDetail(searchParams), [searchParams])

  const viewParam = searchParams.get('view')
  const view: ViewMode =
    viewParam === 'actor' || viewParam === 'mvp' || viewParam === 'capability'
      ? viewParam
      : 'release'
  const rowMode = rowModeFor(view)

  const model = useMemo(() => (scope.data ? buildScopeMap(scope.data) : null), [scope.data])

  const visible = useMemo(
    () => (model ? applyFilters(model.features, filters) : []),
    [model, filters],
  )

  const projected = useMemo(
    () => (model ? projectCells(model, visible, rowMode) : null),
    [model, visible, rowMode],
  )

  const rows = useMemo(() => (model ? rowsFor(model, rowMode) : []), [model, rowMode])

  const mvpProjection = useMemo(() => {
    if (!scope.data) return null
    return projectMvpCells(applyMvpFilters(buildMvpCards(scope.data), filters))
  }, [scope.data, filters])

  const capabilityProjection = useMemo(() => {
    if (!scope.data) return null
    return projectCapabilityCells(
      applyCapabilityFilters(buildCapabilityCards(scope.data), filters),
    )
  }, [scope.data, filters])

  /**
   * What narrowed the map, and when it was taken. A sheet on a wall outlives
   * the session that produced it, so it has to say whether it is the whole
   * map or part of one — an unlabelled filtered map reads as the full scope.
   */
  const meta = useMemo(() => {
    if (!model) return ''
    const narrowing = isEmpty(filters)
      ? 'Showing the whole map — no filters applied'
      : `Filtered — ${describeFilters(filters, model.releases, model.phases)}`
    const taken = new Date().toLocaleDateString('en-NZ', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    return `${narrowing} · ${taken}`
  }, [model, filters])

  /** The query string that produced this sheet, so "back" lands on it. */
  const backTo = `/?${searchParams.toString()}`

  return (
    <div className="flex min-h-dvh flex-col gap-4 overflow-x-auto bg-muted p-4 print:overflow-visible print:bg-transparent print:p-0">
      {/* Screen furniture: the sheet below is the only thing that prints. */}
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to={backTo}>Back to the map</Link>
          </Button>
          <p className="text-sm text-muted-foreground">
            A3 landscape. Print, then choose “Save as PDF” to keep a copy.
          </p>
        </div>
        <Button size="sm" onClick={() => window.print()} disabled={!model}>
          <Printer aria-hidden="true" />
          Print / Save as PDF
        </Button>
      </div>

      {scope.isPending ? <p className="text-sm text-muted-foreground">Loading the map…</p> : null}

      {scope.isError ? (
        <p className="text-sm text-destructive" role="alert">
          The map could not be loaded, so there is nothing to print.
        </p>
      ) : null}

      {model && projected ? (
        <ScopePrintSheet
          title={SCOPE_MAP_TITLE}
          subtitle={SCOPE_VIEW_LABEL[view]}
          meta={meta}
          legend={<ActorLegend />}
        >
          <ScopeMapGrid
            model={{ ...model, ...projected }}
            rows={rows}
            view={view}
            // Printed at natural size; the sheet scales the whole map to the
            // page, so a zoom here would scale it twice.
            zoom={1}
            detail={cardDetail}
            // Edges are drawn for whichever card is active, and nothing is
            // active on a sheet nobody can hover.
            edges={[]}
            mvpCellIndex={mvpProjection?.cellIndex}
            capabilityCellIndex={capabilityProjection?.cellIndex}
          />
        </ScopePrintSheet>
      ) : null}
    </div>
  )
}
