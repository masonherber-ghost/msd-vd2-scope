import type { CSSProperties } from 'react'
import { ConflictBadge } from '@/components/ConflictBadge'
import { ALL_DETAIL, type DetailState } from '@/lib/card-detail'
import type { CapabilityCardModel } from '@/lib/capability-derive'

const ACTOR_LABEL: Record<string, string> = {
  employer: 'Employer',
  staff: 'Staff',
  jobseeker: 'Jobseeker',
  system: 'System',
}

export type CapabilityCardProps = {
  card: CapabilityCardModel
  /** Hides the secondary detail when the map is zoomed out (R-8.7). */
  compact?: boolean
  selected?: boolean
  onSelect?: (capabilityId: number) => void
  /** Which regions of the card are showing. Defaults to all of them. */
  detail?: DetailState
}

/**
 * A capability on the map. Deliberately the plainest of the three cards:
 * this view is a stocktake of what each release and stage actually delivers,
 * so the text is the point and everything else is a label under it.
 */
export function CapabilityCard({
  card,
  compact = false,
  selected = false,
  onSelect,
  detail = ALL_DETAIL,
}: CapabilityCardProps) {
  const conflicts = card.conflicts.release + card.conflicts.phase
  const style = {
    '--card-accent': `var(--color-actor-${card.actor})`,
  } as CSSProperties

  return (
    <article
      className={[
        'capability-card',
        compact ? 'capability-card--compact' : '',
        selected ? 'capability-card--selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={onSelect ? undefined : card.text}
      style={style}
      data-capability-id={card.id}
    >
      {onSelect ? (
        // Only phrasing content in the button, so the markup stays valid
        // while ::after makes the whole card clickable.
        <button
          type="button"
          className="capability-card__select"
          aria-label={`${card.text} — ${ACTOR_LABEL[card.actor]}, MSD feature ${card.ref}`}
          aria-pressed={selected}
          onClick={() => onSelect(card.id)}
        >
          <span className="capability-card__text">{card.text}</span>
        </button>
      ) : (
        <span className="capability-card__text">{card.text}</span>
      )}

      {detail.actors || detail.refs ? (
      <div className="capability-card__meta">
        {/* The actor is named, never colour alone (R-10.6). */}
        {detail.actors ? (
        <span className={`capability-card__actor capability-card__actor--${card.actor}`}>
          {ACTOR_LABEL[card.actor]}
        </span>
        ) : null}
        {detail.refs ? (
        <>
        <span className="capability-card__ref">{card.ref}</span>
        {card.pwcFeatures.length > 0 ? (
          <span className="capability-card__citers">
            {card.pwcFeatures.map((f) => f.id).join(', ')}
          </span>
        ) : (
          <span className="capability-card__citers capability-card__citers--none">
            no PwC feature
          </span>
        )}
        </>
        ) : null}
      </div>
      ) : null}

      {(detail.questions && card.question !== null) ||
      (detail.conflicts && (conflicts > 0 || card.conflicts.unmatched > 0)) ? (
        <div className="capability-card__badges">
          {detail.questions && card.question !== null ? (
            <ConflictBadge count={1} kind="question" />
          ) : null}
          {detail.conflicts && conflicts > 0 ? (
            <ConflictBadge
              count={conflicts}
              state={card.conflicts.unreviewed > 0 ? 'unreviewed' : 'both_correct'}
            />
          ) : null}
          {detail.conflicts && card.conflicts.unmatched > 0 ? (
            <ConflictBadge count={card.conflicts.unmatched} kind="unmatched" />
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
