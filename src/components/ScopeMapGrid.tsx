import { useMemo, useState, type CSSProperties } from 'react'
import { FeatureCard } from '@/components/FeatureCard'
import { ScopeEdgeOverlay } from '@/components/ScopeEdgeOverlay'
import { cellKey, releaseTokenSuffix, type ScopeMapModel } from '@/lib/scope-derive'
import { edgesFor, type ScopeEdge } from '@/lib/scope-edges'

export type ScopeMapGridProps = {
  model: ScopeMapModel
  zoom: number
  /** Below this zoom, cards drop to ID-only so the map stays legible (R-8.7). */
  compactBelow?: number
  scrollRef?: React.Ref<HTMLDivElement>
  /** A callback rather than a ref object: the grid also needs this node for
   *  the edge overlay, and merging two refs would mean writing to a prop. */
  contentRef?: (node: HTMLDivElement | null) => void
  selectedId?: string | null
  onSelect?: (featureId: string) => void
  /** Starts a create pre-filled with this cell's release and phase (R-9.7). */
  onAddToCell?: (releaseId: string, phaseId: string) => void
  /** All edges for the visible features; drawn only for the active one. */
  edges?: ScopeEdge[]
  density?: Map<string, number>
  /** Features with at least one unreviewed conflict, badged on the map (R-7.4). */
  unreviewedIds?: Set<string>
}

export function ScopeMapGrid({
  model,
  zoom,
  compactBelow = 0.7,
  scrollRef,
  contentRef,
  selectedId = null,
  onSelect,
  onAddToCell,
  edges = [],
  density,
  unreviewedIds,
}: ScopeMapGridProps) {
  const compact = zoom < compactBelow
  // Edges are off until a card is selected, hovered or focused — 60 drawn at
  // once is noise, not insight (R-8.2). Hover is a shortcut; selection and
  // keyboard focus reach the same thing (R-10.3).
  const [activeId, setActiveId] = useState<string | null>(null)
  const [table, setTable] = useState<HTMLDivElement | null>(null)

  const shownEdges = useMemo(() => {
    const focus = activeId ?? selectedId
    return focus ? edgesFor(edges, focus) : []
  }, [edges, activeId, selectedId])

  const style = {
    '--scope-zoom': zoom,
    '--scope-release-count': model.releases.length,
  } as CSSProperties

  return (
    <div className="scope-map-grid" ref={scrollRef}>
      <div className="scope-map-grid__scaler" style={style}>
        <div
          className="scope-map-grid__table"
          ref={(node) => {
            setTable(node)
            contentRef?.(node)
          }}
          role="table"
        >
          <div className="scope-map-grid__corner" role="columnheader">
            <span className="scope-map-grid__axis-label">Phase / Release</span>
          </div>

          {model.releases.map((release) => {
            const features = model.totals.featuresByRelease.get(release.id) ?? 0
            const capabilities = model.totals.capabilitiesByRelease.get(release.id) ?? 0
            return (
              <div
                key={release.id}
                className="scope-map-grid__col-header"
                role="columnheader"
              >
                <span className="scope-map-grid__release-label">{release.label}</span>
                <span className="scope-map-grid__release-name">
                  {features} feature{features === 1 ? '' : 's'} · {capabilities} capabilit
                  {capabilities === 1 ? 'y' : 'ies'}
                </span>
                <span
                  className={`scope-map-grid__release-band scope-map-grid__release-band--${releaseTokenSuffix(
                    release.id,
                  )}`}
                  aria-hidden="true"
                />
              </div>
            )
          })}

          {model.phases.map((phase) => (
            <ScopeMapRow
              key={phase.id}
              model={model}
              phase={phase}
              compact={compact}
              selectedId={selectedId}
              onSelect={onSelect}
              onAddToCell={onAddToCell}
              density={density}
              onActivate={setActiveId}
              unreviewedIds={unreviewedIds}
            />
          ))}

          <ScopeEdgeOverlay
            container={table}
            edges={shownEdges}
            layoutKey={`${model.cells.length}:${zoom}:${compact}:${shownEdges.length}`}
          />
        </div>
      </div>
    </div>
  )
}

function ScopeMapRow({
  model,
  phase,
  compact,
  selectedId,
  onSelect,
  onAddToCell,
  density,
  onActivate,
  unreviewedIds,
}: {
  model: ScopeMapModel
  phase: ScopeMapModel['phases'][number]
  compact: boolean
  selectedId: string | null
  onSelect?: (featureId: string) => void
  onAddToCell?: (releaseId: string, phaseId: string) => void
  density?: Map<string, number>
  onActivate: (featureId: string | null) => void
  unreviewedIds?: Set<string>
}) {
  return (
    <>
      <div className="scope-map-grid__row-header" role="rowheader">
        <span className="scope-map-grid__phase-order">
          {phase.display_order} · epic {phase.epic_ref}
        </span>
        <span className="scope-map-grid__phase-name">{phase.name}</span>
        <span className="scope-map-grid__phase-meta">{phase.epic_description}</span>
      </div>

      {model.releases.map((release) => {
        const cell = model.cellIndex.get(cellKey(phase.id, release.id))
        const features = cell?.features ?? []
        const capabilityCount = cell?.capabilityCount ?? 0
        const isEmpty = features.length === 0

        return (
          <div
            key={release.id}
            role="cell"
            aria-label={`${phase.name}, ${release.label}: ${features.length} features, ${capabilityCount} capabilities`}
            className={`scope-map-grid__cell${
              isEmpty ? ' scope-map-grid__cell--empty' : ''
            }`}
          >
            {isEmpty ? (
              <>
                <span className="scope-map-grid__empty-note">
                  {capabilityCount > 0
                    ? `no features · ${capabilityCount} capabilit${
                        capabilityCount === 1 ? 'y' : 'ies'
                      }`
                    : 'no features'}
                </span>
                {onAddToCell ? (
                  <button
                    type="button"
                    className="scope-map-grid__add"
                    onClick={() => onAddToCell(release.id, phase.id)}
                    aria-label={`Add a feature to ${phase.name}, ${release.label}`}
                  >
                    + Add
                  </button>
                ) : null}
              </>
            ) : (
              <>
                {features.map((feature) => (
                  <FeatureCard
                    key={feature.id}
                    feature={feature}
                    compact={compact}
                    selected={feature.id === selectedId}
                    onSelect={onSelect}
                    density={density?.get(feature.id) ?? 0}
                    onActivate={onActivate}
                    hasUnreviewedConflict={unreviewedIds?.has(feature.id) ?? true}
                  />
                ))}
                {capabilityCount > 0 ? (
                  <span className="scope-map-grid__capability-note">
                    {capabilityCount} capabilit{capabilityCount === 1 ? 'y' : 'ies'} in this
                    cell
                  </span>
                ) : null}
                {onAddToCell ? (
                  <button
                    type="button"
                    className="scope-map-grid__add"
                    onClick={() => onAddToCell(release.id, phase.id)}
                    aria-label={`Add a feature to ${phase.name}, ${release.label}`}
                  >
                    + Add
                  </button>
                ) : null}
              </>
            )}
          </div>
        )
      })}
    </>
  )
}
