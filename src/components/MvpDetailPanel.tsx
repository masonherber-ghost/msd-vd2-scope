import { Button } from '@/components/ui/button'
import { mvpCardLabel, type MvpCardModel } from '@/lib/mvp-derive'

const ACTOR_LABEL: Record<string, string> = {
  employer: 'Employer',
  staff: 'Staff',
  jobseeker: 'Jobseeker',
  system: 'System',
}

const PLACEMENT_NOTE: Record<MvpCardModel['placement'], string> = {
  capability:
    'Placed where the sequencing table schedules its capabilities. Neither source gives an MSD feature a release of its own.',
  feature:
    'This record owns no placed capability, so it is placed by the PwC features that cite it. That is a weaker footing than the table’s own placement.',
  unplaced: 'Nothing places this record: it owns no capability and no PwC feature cites it.',
}

export type MvpDetailPanelProps = {
  card: MvpCardModel
  onClose: () => void
  /** Opens a PwC feature in the feature view (R-8.16). */
  onSelectFeature?: (featureId: string) => void
  releaseLabels?: Map<string, string>
  phaseNames?: Map<string, string>
}

/**
 * The MSD-feature side of the detail panel. Read-only: an MSD feature's
 * links are edited from the PwC feature that owns them, so offering a second
 * editor here would give the same relationship two homes.
 */
export function MvpDetailPanel({
  card,
  onClose,
  onSelectFeature,
  releaseLabels,
  phaseNames,
}: MvpDetailPanelProps) {
  const label = mvpCardLabel(card)
  const placeName = (releaseId: string, phaseId: string) =>
    `${releaseLabels?.get(releaseId) ?? releaseId} · ${phaseNames?.get(phaseId) ?? phaseId}`

  return (
    <aside className="mvp-detail" aria-label={`MSD feature ${label}`}>
      <div className="mvp-detail__header">
        <div className="mvp-detail__heading">
          <span className="mvp-detail__ref">
            MSD feature {label}
            {card.scopeOption ? null : ' · no scope option'}
          </span>
          <h2 className="mvp-detail__name">{card.title}</h2>
          <span className="mvp-detail__placement">
            {card.cells.length === 0
              ? 'Not placed'
              : card.cells.map((c) => placeName(c.releaseId, c.phaseId)).join(' · ')}
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>

      <p className="mvp-detail__note">{PLACEMENT_NOTE[card.placement]}</p>

      <section className="mvp-detail__section">
        <h3 className="mvp-detail__section-title">
          PwC features citing this ({card.pwcFeatures.length})
        </h3>
        {card.pwcFeatures.length === 0 ? (
          <p className="mvp-detail__note">
            No PwC feature cites this record. It reaches the map from the sequencing
            table alone.
          </p>
        ) : (
          <ul className="mvp-detail__list">
            {card.pwcFeatures.map((feature) => (
              <li key={feature.id}>
                {onSelectFeature ? (
                  <button
                    type="button"
                    className="mvp-detail__feature"
                    onClick={() => onSelectFeature(feature.id)}
                  >
                    <span className="mvp-detail__feature-id">{feature.id}</span>
                    <span className="mvp-detail__feature-name">{feature.name}</span>
                    <span className="mvp-detail__feature-place">
                      {placeName(feature.releaseId, feature.phaseId)}
                    </span>
                  </button>
                ) : (
                  <span className="mvp-detail__feature">
                    <span className="mvp-detail__feature-id">{feature.id}</span>
                    <span className="mvp-detail__feature-name">{feature.name}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mvp-detail__section">
        <h3 className="mvp-detail__section-title">
          Capabilities ({card.capabilities.length})
        </h3>
        {card.capabilities.length === 0 ? (
          <p className="mvp-detail__note">
            This record owns no capability. Where a ref carries several records, the
            option-agnostic one owns them by rule (D-3).
          </p>
        ) : (
          <ul className="mvp-detail__list">
            {card.capabilities.map((capability) => (
              <li key={capability.id} className="mvp-detail__capability">
                <span className="mvp-detail__capability-text">{capability.text}</span>
                <span className="mvp-detail__capability-meta">
                  {ACTOR_LABEL[capability.actor]}
                  {capability.releaseId && capability.phaseId
                    ? ` · ${placeName(capability.releaseId, capability.phaseId)}`
                    : ' · not placed'}
                  {capability.ownerAmbiguous ? ' · owner chosen by rule' : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  )
}
