import { useMemo, useState, type CSSProperties } from 'react'
import { FeatureCard } from '@/components/FeatureCard'
import { CapabilityCard } from '@/components/CapabilityCard'
import { MvpCard } from '@/components/MvpCard'
import { ScopeEdgeOverlay } from '@/components/ScopeEdgeOverlay'
import type { CapabilityCardModel } from '@/lib/capability-derive'
import type { MvpCardModel } from '@/lib/mvp-derive'
import {
  ACTOR_ROWS,
  cellKey,
  releaseTokenSuffix,
  rowModeFor,
  type RowMode,
  type ScopeMapModel,
  type ScopeRow,
  type ViewMode,
} from '@/lib/scope-derive'
import { edgesFor, type ScopeEdge } from '@/lib/scope-edges'

export type ScopeMapGridProps = {
  model: ScopeMapModel
  /** Rows are actors or releases; phases always run across the top. */
  rows: ScopeRow[]
  view: ViewMode
  zoom: number
  /** MSD-feature cards per cell. Only read when `view` is `mvp`. */
  mvpCellIndex?: Map<string, MvpCardModel[]>
  selectedMvpId?: number | null
  onSelectMvp?: (mvpId: number) => void
  /** Capability cards per cell. Only read when `view` is `capability`. */
  capabilityCellIndex?: Map<string, CapabilityCardModel[]>
  selectedCapabilityId?: number | null
  onSelectCapability?: (capabilityId: number) => void
  /** Below this zoom, cards drop to ID-only so the map stays legible (R-8.7). */
  compactBelow?: number
  scrollRef?: React.Ref<HTMLDivElement>
  /** A callback rather than a ref object: the grid also needs this node for
   *  the edge overlay, and merging two refs would mean writing to a prop. */
  contentRef?: (node: HTMLDivElement | null) => void
  selectedId?: string | null
  onSelect?: (featureId: string) => void
  /** Starts a create pre-filled with this cell's row and phase (R-9.7). */
  onAddToCell?: (rowKey: string, phaseId: string) => void
  /** All edges for the visible features; drawn only for the active one. */
  edges?: ScopeEdge[]
  density?: Map<string, number>
  /** Features with at least one unreviewed conflict, badged on the map (R-7.4). */
  unreviewedIds?: Set<string>
}

export function ScopeMapGrid({
  model,
  rows,
  view,
  zoom,
  mvpCellIndex,
  selectedMvpId = null,
  onSelectMvp,
  capabilityCellIndex,
  selectedCapabilityId = null,
  onSelectCapability,
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
  const rowMode = rowModeFor(view)
  const isMvpView = view === 'mvp'
  const isCapabilityView = view === 'capability'
  const compact = zoom < compactBelow
  // Edges are off until a card is selected, hovered or focused — 27 drawn at
  // once is noise, not insight (R-8.2). Hover is a shortcut; selection and
  // keyboard focus reach the same thing (R-10.3).
  const [activeId, setActiveId] = useState<string | null>(null)
  const [table, setTable] = useState<HTMLDivElement | null>(null)

  const shownEdges = useMemo(() => {
    const focus = activeId ?? selectedId
    return focus ? edgesFor(edges, focus) : []
  }, [edges, activeId, selectedId])

  const releaseLabels = useMemo(
    () => new Map(model.releases.map((release) => [release.id, release.label])),
    [model.releases],
  )

  /** Cards in a cell, counting whichever kind the current view renders. */
  const countIn = useMemo(() => {
    if (isMvpView) return (key: string) => mvpCellIndex?.get(key)?.length ?? 0
    if (isCapabilityView) {
      return (key: string) => capabilityCellIndex?.get(key)?.length ?? 0
    }
    return (key: string) => model.cellIndex.get(key)?.features.length ?? 0
  }, [isMvpView, isCapabilityView, model.cellIndex, mvpCellIndex, capabilityCellIndex])

  const style = {
    '--scope-zoom': zoom,
    '--scope-phase-count': model.phases.length,
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
            <span className="scope-map-grid__axis-label">
              {rowMode === 'actor' ? 'Actor' : 'Release'} / Stage
            </span>
          </div>

          {model.phases.map((phase) => {
            // Summed from the visible rows, so the header agrees with the
            // column beneath it in whichever view is showing.
            const shown = rows.reduce(
              (total, row) => total + countIn(cellKey(row.key, phase.id)),
              0,
            )
            return (
              <div
                key={phase.id}
                className="scope-map-grid__col-header"
                role="columnheader"
              >
                <span className="scope-map-grid__stage-label">
                  Stage {phase.display_order}
                </span>
                <span className="scope-map-grid__stage-name">{phase.name}</span>
                <span className="scope-map-grid__stage-meta">
                  epic {phase.epic_ref} · {shown} shown
                </span>
              </div>
            )
          })}

          {rows.map((row) => (
            <ScopeMapRow
              key={row.key}
              model={model}
              row={row}
              compact={compact}
              selectedId={selectedId}
              onSelect={onSelect}
              onAddToCell={onAddToCell}
              density={density}
              onActivate={setActiveId}
              unreviewedIds={unreviewedIds}
              rowMode={rowMode}
              releaseLabels={releaseLabels}
              isMvpView={isMvpView}
              mvpCellIndex={mvpCellIndex}
              selectedMvpId={selectedMvpId}
              onSelectMvp={onSelectMvp}
              isCapabilityView={isCapabilityView}
              capabilityCellIndex={capabilityCellIndex}
              selectedCapabilityId={selectedCapabilityId}
              onSelectCapability={onSelectCapability}
              countIn={countIn}
            />
          ))}

          <ScopeEdgeOverlay
            container={table}
            edges={shownEdges}
            layoutKey={`${view}:${model.cells.length}:${zoom}:${compact}:${shownEdges.length}`}
          />
        </div>
      </div>
    </div>
  )
}

/**
 * A card's leading edge shows whichever dimension the rows are NOT grouped
 * by, so every card carries both at a glance — the design does the same.
 */
function accentFor(feature: { releaseId: string; actors: Set<string> }, mode: RowMode) {
  if (mode === 'actor') return `--color-release-${releaseTokenSuffix(feature.releaseId)}`
  const actor = ACTOR_ROWS.find((row) => feature.actors.has(row.key))
  return `--color-actor-${actor?.tokenSuffix ?? 'none'}`
}

function ScopeMapRow({
  model,
  row,
  compact,
  selectedId,
  onSelect,
  onAddToCell,
  density,
  onActivate,
  unreviewedIds,
  rowMode,
  releaseLabels,
  isMvpView,
  mvpCellIndex,
  selectedMvpId,
  onSelectMvp,
  isCapabilityView,
  capabilityCellIndex,
  selectedCapabilityId,
  onSelectCapability,
  countIn,
}: {
  model: ScopeMapModel
  row: ScopeRow
  compact: boolean
  selectedId: string | null
  onSelect?: (featureId: string) => void
  onAddToCell?: (rowKey: string, phaseId: string) => void
  density?: Map<string, number>
  onActivate: (featureId: string | null) => void
  unreviewedIds?: Set<string>
  rowMode: RowMode
  releaseLabels: Map<string, string>
  isMvpView: boolean
  mvpCellIndex?: Map<string, MvpCardModel[]>
  selectedMvpId: number | null
  onSelectMvp?: (mvpId: number) => void
  isCapabilityView: boolean
  capabilityCellIndex?: Map<string, CapabilityCardModel[]>
  selectedCapabilityId: number | null
  onSelectCapability?: (capabilityId: number) => void
  countIn: (key: string) => number
}) {
  const shown = model.phases.reduce(
    (total, phase) => total + countIn(cellKey(row.key, phase.id)),
    0,
  )

  const rowStyle = {
    '--row-accent': `var(--color-${
      row.tokenSuffix.startsWith('1') || row.tokenSuffix === '2'
        ? `release-${row.tokenSuffix}`
        : `actor-${row.tokenSuffix}`
    })`,
  } as CSSProperties

  return (
    <>
      <div className="scope-map-grid__row-header" role="rowheader" style={rowStyle}>
        <span className="scope-map-grid__row-name">{row.label}</span>
        <span className="scope-map-grid__row-blurb">{row.blurb}</span>
        <span className="scope-map-grid__row-count">{shown} shown</span>
      </div>

      {model.phases.map((phase) => {
        const key = cellKey(row.key, phase.id)
        const cell = model.cellIndex.get(key)
        const features = cell?.features ?? []
        const mvpCards = isMvpView ? (mvpCellIndex?.get(key) ?? []) : []
        const capabilityCards = isCapabilityView
          ? (capabilityCellIndex?.get(key) ?? [])
          : []
        const capabilityCount = cell?.capabilityCount ?? 0
        const count = countIn(key)
        const isEmpty = count === 0
        // Creating a PwC feature from an MSD or capability cell would guess
        // a placement the sources never state, so the affordance belongs to
        // the feature views only.
        const canAdd = onAddToCell && !isMvpView && !isCapabilityView

        return (
          <div
            key={phase.id}
            role="cell"
            aria-label={`${row.label}, ${phase.name}: ${count} ${
              isMvpView ? 'MSD features' : isCapabilityView ? 'capabilities' : 'features'
            }${isCapabilityView ? '' : `, ${capabilityCount} capabilities`}`}
            className={`scope-map-grid__cell${
              isEmpty ? ' scope-map-grid__cell--empty' : ''
            }`}
          >
            {isEmpty ? (
              <>
                <span className="scope-map-grid__empty-note">
                  {isCapabilityView
                    ? 'No capability'
                    : capabilityCount > 0
                      ? `No ${isMvpView ? 'MSD feature' : 'feature'} · ${capabilityCount} capabilit${
                          capabilityCount === 1 ? 'y' : 'ies'
                        }`
                      : 'No capability'}
                </span>
                {canAdd ? (
                  <button
                    type="button"
                    className="scope-map-grid__add"
                    onClick={() => onAddToCell(row.key, phase.id)}
                    aria-label={`Add a feature to ${row.label}, ${phase.name}`}
                  >
                    + Add
                  </button>
                ) : null}
              </>
            ) : (
              <>
                {isCapabilityView
                  ? capabilityCards.map((card) => (
                      <CapabilityCard
                        key={card.id}
                        card={card}
                        compact={compact}
                        selected={card.id === selectedCapabilityId}
                        onSelect={onSelectCapability}
                      />
                    ))
                  : isMvpView
                  ? mvpCards.map((card) => (
                      <MvpCard
                        key={card.id}
                        card={card}
                        releaseId={row.key}
                        releaseLabel={releaseLabels.get(row.key)}
                        compact={compact}
                        selected={card.id === selectedMvpId}
                        onSelect={onSelectMvp}
                      />
                    ))
                  : features.map((feature) => (
                      <FeatureCard
                        key={feature.id}
                        feature={feature}
                        compact={compact}
                        selected={feature.id === selectedId}
                        onSelect={onSelect}
                        density={density?.get(feature.id) ?? 0}
                        onActivate={onActivate}
                        hasUnreviewedConflict={unreviewedIds?.has(feature.id) ?? true}
                        releaseLabel={releaseLabels.get(feature.releaseId)}
                        accentToken={accentFor(feature, rowMode)}
                      />
                    ))}
                {capabilityCount > 0 && !isCapabilityView ? (
                  <span className="scope-map-grid__capability-note">
                    {capabilityCount} capabilit{capabilityCount === 1 ? 'y' : 'ies'} here
                  </span>
                ) : null}
                {canAdd ? (
                  <button
                    type="button"
                    className="scope-map-grid__add"
                    onClick={() => onAddToCell(row.key, phase.id)}
                    aria-label={`Add a feature to ${row.label}, ${phase.name}`}
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
