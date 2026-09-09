import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import type { DetailCapability, FeatureDetail } from '@/lib/feature-detail'

const ACTOR_LABEL: Record<string, string> = {
  employer: 'Employer',
  staff: 'Staff',
  jobseeker: 'Jobseeker',
  system: 'System',
}

export type FeatureDetailPanelProps = {
  detail: FeatureDetail
  onClose: () => void
  /** Pivots the map to an MVP ref without closing the panel (R-8.16). */
  onPivotToMvp: (ref: number) => void
  onSelectFeature: (featureId: string) => void
  /** MVP refs currently pivoted to, so the chips can show as pressed. */
  activeMvpRefs: number[]
}

export function FeatureDetailPanel({
  detail,
  onClose,
  onPivotToMvp,
  onSelectFeature,
  activeMvpRefs,
}: FeatureDetailPanelProps) {
  const panelRef = useRef<HTMLElement>(null)

  // Escape closes, and the panel takes focus so it is keyboard reachable
  // without hunting for it (R-10.3, R-10.4).
  useEffect(() => {
    panelRef.current?.focus()
  }, [detail.id])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <section
      className="feature-detail"
      aria-labelledby="feature-detail-name"
      tabIndex={-1}
      ref={panelRef}
    >
      <div className="feature-detail__header">
        <div className="feature-detail__heading">
          <span className="feature-detail__id">{detail.id}</span>
          <h2 className="feature-detail__name" id="feature-detail-name">
            {detail.name}
          </h2>
          <span className="feature-detail__placement">
            {detail.releaseLabel} · {detail.phaseName} · epic {detail.epicRef}
          </span>
          {detail.sourcePhaseLabel && detail.sourcePhaseLabel !== detail.phaseName ? (
            <span className="feature-detail__placement">
              Source document filed this under “{detail.sourcePhaseLabel}”
            </span>
          ) : null}
        </div>
        <Button variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>

      {detail.overridden ? (
        <div className="feature-detail__section">
          <h3 className="feature-detail__section-title">Corrected source</h3>
          <p className="feature-detail__note">{detail.overrideRationale}</p>
        </div>
      ) : null}

      <div className="feature-detail__section">
        <h3 className="feature-detail__section-title">Included in foundational build</h3>
        <p className="feature-detail__prose">{detail.foundationalBuild}</p>
      </div>

      <div className="feature-detail__section">
        <h3 className="feature-detail__section-title">
          Assumptions ({detail.assumptions.length})
        </h3>
        {detail.assumptions.length === 0 ? (
          <p className="feature-detail__note">None recorded.</p>
        ) : (
          <ol className="feature-detail__list">
            {detail.assumptions.map((assumption) => (
              <li key={assumption.id}>{assumption.text}</li>
            ))}
          </ol>
        )}
      </div>

      <div className="feature-detail__section">
        <h3 className="feature-detail__section-title">
          MVP features ({detail.mvpFeatures.length})
        </h3>
        <ul className="feature-detail__chips">
          {detail.mvpFeatures.map((mvp) => {
            const pressed = activeMvpRefs.includes(mvp.ref)
            return (
              <li key={`${mvp.ref}-${mvp.scopeOption ?? 'bare'}`}>
                <button
                  type="button"
                  className="feature-detail__chip"
                  aria-pressed={pressed}
                  onClick={() => onPivotToMvp(mvp.ref)}
                  title={mvp.title}
                >
                  <span className="feature-detail__chip-ref">{mvp.ref}</span>
                  {mvp.scopeOption ? <span>Option {mvp.scopeOption}</span> : null}
                  <span>{mvp.title}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="feature-detail__section">
        <h3 className="feature-detail__section-title">
          Capabilities ({detail.capabilityCount})
        </h3>
        {detail.capabilityCount === 0 ? (
          <p className="feature-detail__note">
            {detail.capabilityNote
              ? `The mapping document states: “${detail.capabilityNote}”.`
              : 'No capabilities are mapped to this feature.'}
          </p>
        ) : (
          detail.actorGroups.map((group) => (
            <div key={group.actor} className="feature-detail__actor-group">
              <h4 className="feature-detail__actor-name">
                {ACTOR_LABEL[group.actor]} ({group.capabilities.length})
              </h4>
              <ul className="feature-detail__plain-list">
                {group.capabilities.map((capability) => (
                  <li key={capability.id}>
                    <CapabilityRow capability={capability} detail={detail} />
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>

      <div className="feature-detail__section">
        <h3 className="feature-detail__section-title">
          Connected features ({detail.connected.length})
        </h3>
        {detail.connected.length === 0 ? (
          <p className="feature-detail__note">
            No other feature maps to the same MVP feature.
          </p>
        ) : (
          <ul className="feature-detail__plain-list">
            {detail.connected.map((connection) => (
              <li key={connection.id}>
                <button
                  type="button"
                  className="feature-detail__connection"
                  onClick={() => onSelectFeature(connection.id)}
                >
                  <span className="feature-detail__connection-id">{connection.id}</span>
                  <span className="feature-detail__connection-name">
                    {connection.name}
                    <span className="feature-detail__capability-meta">
                      {' '}
                      · via {connection.sharedRefs.join(', ')} · {connection.releaseLabel}
                    </span>
                  </span>
                  {connection.crossesRelease ? (
                    <span className="feature-detail__crossing">crosses release</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

/**
 * Shows a capability with its own placement, and where that differs from the
 * feature's, both placements inline (R-8.15).
 */
function CapabilityRow({
  capability,
  detail,
}: {
  capability: DetailCapability
  detail: FeatureDetail
}) {
  const differs = capability.releaseDiffers || capability.phaseDiffers

  return (
    <div className="feature-detail__capability">
      <span className="feature-detail__capability-text">{capability.text}</span>
      <span className="feature-detail__capability-meta">
        {capability.matched
          ? `${capability.releaseLabel ?? 'no release'} · ${
              capability.phaseName ?? 'no phase'
            }`
          : 'No exact match in the sequencing table'}
        {capability.citations > 1 ? ` · cited ${capability.citations}×` : ''}
      </span>

      {differs ? (
        <div
          className={`feature-detail__mismatch${
            capability.phaseConflictMerged && !capability.releaseDiffers
              ? ' feature-detail__mismatch--merged'
              : ''
          }`}
        >
          {capability.releaseDiffers ? (
            <span>
              <span className="feature-detail__mismatch-label">Release differs:</span> the
              feature ships in {detail.releaseLabel}, the table delivers this capability in{' '}
              {capability.releaseLabel}.
            </span>
          ) : null}
          {capability.phaseDiffers ? (
            <span>
              <span className="feature-detail__mismatch-label">Phase differs:</span> the
              feature sits in {detail.phaseName}, the table places this capability in{' '}
              {capability.phaseName}.
            </span>
          ) : null}
        </div>
      ) : null}

      {/* A merged conflict resolves to the same canonical phase, so there is no
          placement difference to show — only a difference in how the two
          documents label it. Worth stating, but not as a finding. */}
      {capability.phaseConflictMerged && !capability.phaseDiffers ? (
        <div className="feature-detail__mismatch feature-detail__mismatch--merged">
          <span>
            <span className="feature-detail__mismatch-label">Labelled differently:</span> the
            mapping file says “{capability.featurePhaseLabel}” and the table says “
            {capability.capabilityPhaseLabel}”. Resolved by the canonical phase merge — the
            same phase.
          </span>
        </div>
      ) : null}

      {!capability.matched ? (
        <div className="feature-detail__mismatch">
          <span>
            <span className="feature-detail__mismatch-label">Unmatched:</span> the mapping
            document cites this text, but the table has no exact match. Not merged on a
            prefix — a human confirms it.
          </span>
        </div>
      ) : null}
    </div>
  )
}
