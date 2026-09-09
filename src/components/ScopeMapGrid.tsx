import type { CSSProperties } from 'react'
import { FeatureCard } from '@/components/FeatureCard'
import { cellKey, releaseTokenSuffix, type ScopeMapModel } from '@/lib/scope-derive'

export type ScopeMapGridProps = {
  model: ScopeMapModel
  zoom: number
  /** Below this zoom, cards drop to ID-only so the map stays legible (R-8.7). */
  compactBelow?: number
  scrollRef?: React.Ref<HTMLDivElement>
  contentRef?: React.Ref<HTMLDivElement>
  selectedId?: string | null
  onSelect?: (featureId: string) => void
}

export function ScopeMapGrid({
  model,
  zoom,
  compactBelow = 0.7,
  scrollRef,
  contentRef,
  selectedId = null,
  onSelect,
}: ScopeMapGridProps) {
  const compact = zoom < compactBelow

  const style = {
    '--scope-zoom': zoom,
    '--scope-release-count': model.releases.length,
  } as CSSProperties

  return (
    <div className="scope-map-grid" ref={scrollRef}>
      <div className="scope-map-grid__scaler" style={style}>
        <div className="scope-map-grid__table" ref={contentRef} role="table">
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
            />
          ))}
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
}: {
  model: ScopeMapModel
  phase: ScopeMapModel['phases'][number]
  compact: boolean
  selectedId: string | null
  onSelect?: (featureId: string) => void
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
              <span className="scope-map-grid__empty-note">
                {capabilityCount > 0
                  ? `no features · ${capabilityCount} capabilit${
                      capabilityCount === 1 ? 'y' : 'ies'
                    }`
                  : 'no features'}
              </span>
            ) : (
              <>
                {features.map((feature) => (
                  <FeatureCard
                    key={feature.id}
                    feature={feature}
                    compact={compact}
                    selected={feature.id === selectedId}
                    onSelect={onSelect}
                  />
                ))}
                {capabilityCount > 0 ? (
                  <span className="scope-map-grid__capability-note">
                    {capabilityCount} capabilit{capabilityCount === 1 ? 'y' : 'ies'} in this
                    cell
                  </span>
                ) : null}
              </>
            )}
          </div>
        )
      })}
    </>
  )
}
