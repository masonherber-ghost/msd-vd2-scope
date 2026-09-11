import { Button } from '@/components/ui/button'
import { ConflictBadge } from '@/components/ConflictBadge'
import type { CapabilityCardModel } from '@/lib/capability-derive'
import { SOURCE_LABEL } from '@/lib/validators'

const ACTOR_LABEL: Record<string, string> = {
  employer: 'Employer',
  staff: 'Staff',
  jobseeker: 'Jobseeker',
  system: 'System',
}

export type CapabilityDetailPanelProps = {
  card: CapabilityCardModel
  onClose: () => void
  /** Opens a PwC feature in the feature view (R-8.16). */
  onSelectFeature?: (featureId: string) => void
  releaseLabels?: Map<string, string>
  phaseNames?: Map<string, string>
}

/**
 * A capability's own page: where the table puts it, the MSD feature it
 * belongs to, and the PwC features that asked for it.
 *
 * Read-only. A capability's placement is edited from the feature whose
 * conflict it causes, so offering a second editor here would give the same
 * decision two homes with no shared context.
 */
export function CapabilityDetailPanel({
  card,
  onClose,
  onSelectFeature,
  releaseLabels,
  phaseNames,
}: CapabilityDetailPanelProps) {
  const placement =
    card.releaseId && card.phaseId
      ? `${releaseLabels?.get(card.releaseId) ?? card.releaseId} · ${
          phaseNames?.get(card.phaseId) ?? card.phaseId
        }`
      : 'Not placed'
  const conflicts = card.conflicts.release + card.conflicts.phase

  return (
    <aside className="capability-detail" aria-label={`Capability: ${card.text}`}>
      <div className="capability-detail__header">
        <div className="capability-detail__heading">
          <span className="capability-detail__eyebrow">
            Capability · {ACTOR_LABEL[card.actor]}
          </span>
          <h2 className="capability-detail__name">{card.text}</h2>
          <span className="capability-detail__placement">{placement}</span>
        </div>
        <Button variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>

      {conflicts > 0 || card.conflicts.unmatched > 0 ? (
        <div className="capability-detail__badges">
          {conflicts > 0 ? (
            <ConflictBadge
              count={conflicts}
              state={card.conflicts.unreviewed > 0 ? 'unreviewed' : 'both_correct'}
            />
          ) : null}
          {card.conflicts.unmatched > 0 ? (
            <ConflictBadge count={card.conflicts.unmatched} kind="unmatched" />
          ) : null}
        </div>
      ) : null}

      {card.releaseId === null || card.phaseId === null ? (
        <p className="capability-detail__note">
          The {SOURCE_LABEL.sequencing} never matched this text, so it has no release or
          stage. Never merged on a prefix — a human confirms it.
        </p>
      ) : null}

      <section className="capability-detail__section">
        <h3 className="capability-detail__section-title">MSD feature</h3>
        {card.mvpFeature ? (
          <div className="capability-detail__mvp">
            <span className="capability-detail__mvp-ref">
              {card.mvpFeature.ref}
              {card.mvpFeature.scopeOption ? ` · ${card.mvpFeature.scopeOption}` : ''}
            </span>
            <span className="capability-detail__mvp-title">{card.mvpFeature.title}</span>
            {card.ownerAmbiguous ? (
              <span className="capability-detail__note">
                Ref {card.ref} carries more than one record, so the owner was chosen by
                rule rather than stated (D-3).
              </span>
            ) : null}
          </div>
        ) : (
          <p className="capability-detail__note">
            Ref {card.ref} did not resolve to an MSD feature record.
          </p>
        )}
      </section>

      <section className="capability-detail__section">
        <h3 className="capability-detail__section-title">
          PwC features citing this ({card.pwcFeatures.length})
        </h3>
        {card.pwcFeatures.length === 0 ? (
          <p className="capability-detail__note">
            No PwC feature cites this. It reaches the map from the{' '}
            {SOURCE_LABEL.sequencing} alone, which is worth a look: scope the table
            delivers that no feature asked for.
          </p>
        ) : (
          <ul className="capability-detail__list">
            {card.pwcFeatures.map((feature) => (
              <li key={feature.id}>
                {onSelectFeature ? (
                  <button
                    type="button"
                    className="capability-detail__feature"
                    onClick={() => onSelectFeature(feature.id)}
                  >
                    <span className="capability-detail__feature-id">{feature.id}</span>
                    <span className="capability-detail__feature-name">{feature.name}</span>
                    <span className="capability-detail__feature-place">
                      {releaseLabels?.get(feature.releaseId) ?? feature.releaseId}
                      {card.releaseId && feature.releaseId !== card.releaseId
                        ? ' · differs from this capability'
                        : ''}
                    </span>
                  </button>
                ) : (
                  <span className="capability-detail__feature">
                    <span className="capability-detail__feature-id">{feature.id}</span>
                    <span className="capability-detail__feature-name">{feature.name}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  )
}
