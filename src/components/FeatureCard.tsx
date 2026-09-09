import { ConflictBadge } from '@/components/ConflictBadge'
import type { FeatureCardModel } from '@/lib/scope-derive'
import { densityBand } from '@/lib/scope-edges'

const ACTOR_LABEL: Record<string, string> = {
  employer: 'Employer',
  staff: 'Staff',
  jobseeker: 'Jobseeker',
  system: 'System',
}

export type FeatureCardProps = {
  feature: FeatureCardModel
  /** Hides the secondary detail when the map is zoomed out (R-8.7). */
  compact?: boolean
  selected?: boolean
  onSelect?: (featureId: string) => void
  /** How many other features share an MVP feature with this one (R-8.3). */
  density?: number
  /** Reveals this card's edges without requiring a click (R-10.3). */
  onActivate?: (featureId: string | null) => void
  /** True when at least one of this feature's conflicts is still unreviewed. */
  hasUnreviewedConflict?: boolean
}

export function FeatureCard({
  feature,
  compact = false,
  selected = false,
  onSelect,
  density = 0,
  onActivate,
  hasUnreviewedConflict = true,
}: FeatureCardProps) {
  const conflicts = feature.conflicts.release + feature.conflicts.phase

  return (
    <article
      className={[
        'feature-card',
        compact ? 'feature-card--compact' : '',
        selected ? 'feature-card--selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      // Labelled here only when there is no select button, so the card and
      // its button never carry the same name twice.
      aria-label={onSelect ? undefined : `${feature.id} ${feature.name}`}
      data-feature-id={feature.id}
      onMouseEnter={onActivate ? () => onActivate(feature.id) : undefined}
      onMouseLeave={onActivate ? () => onActivate(null) : undefined}
      onFocus={onActivate ? () => onActivate(feature.id) : undefined}
      onBlur={onActivate ? () => onActivate(null) : undefined}
    >
      <div className="feature-card__header">
        {onSelect ? (
          // Only phrasing content inside the button, so the markup stays
          // valid while the whole card remains clickable via ::after. The
          // name is set explicitly: JSX strips the newline between child
          // spans, which would otherwise announce as "F-001Invite employer".
          <button
            type="button"
            className="feature-card__select"
            aria-label={`${feature.id} ${feature.name}`}
            aria-pressed={selected}
            onClick={() => onSelect(feature.id)}
          >
            <span className="feature-card__id">{feature.id}</span>
          </button>
        ) : (
          <span className="feature-card__id">{feature.id}</span>
        )}
        <span className="feature-card__meta">
          {density > 0 ? (
            // Shown passively so load-bearing features read as important
            // before any interaction (R-8.3). The count carries the meaning;
            // the bars are only a scanning aid.
            <span
              className={`feature-card__density feature-card__density--${densityBand(density)}`}
              title={`Shares an MVP feature with ${density} other feature${
                density === 1 ? '' : 's'
              }`}
            >
              <span className="feature-card__density-bar" aria-hidden="true" />
              {density} link{density === 1 ? '' : 's'}
            </span>
          ) : null}
          {feature.capabilityCount > 0 ? (
            <span className="feature-card__id">
              {feature.capabilityCount} cap{feature.capabilityCount === 1 ? '' : 's'}
            </span>
          ) : null}
        </span>
      </div>

      <h3 className="feature-card__name">{feature.name}</h3>

      {feature.mvpFeatures.length > 0 ? (
        <ul className="feature-card__chips">
          {feature.mvpFeatures.map((mvp) => (
            <li
              key={`${mvp.ref}-${mvp.scopeOption ?? 'bare'}`}
              className="feature-card__chip"
            >
              {mvp.ref}
              {mvp.scopeOption ? (
                <span className="feature-card__chip-option">{mvp.scopeOption}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {feature.actorCounts.length > 0 ? (
        <ul className="feature-card__actors">
          {feature.actorCounts.map(({ actor, count }) => (
            <li key={actor} className={`feature-card__actor feature-card__actor--${actor}`}>
              {ACTOR_LABEL[actor]}
              <span className="feature-card__actor-count">{count}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {conflicts > 0 || feature.conflicts.unmatched > 0 || feature.overridden ? (
        <div className="feature-card__badges">
          {conflicts > 0 ? (
            <ConflictBadge
              count={conflicts}
              state={hasUnreviewedConflict ? 'unreviewed' : 'both_correct'}
            />
          ) : null}
          {feature.conflicts.unmatched > 0 ? (
            <span className="feature-card__badge feature-card__badge--unmatched">
              {feature.conflicts.unmatched} unmatched
            </span>
          ) : null}
          {feature.overridden ? (
            <span className="feature-card__badge feature-card__badge--overridden">
              corrected
            </span>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
