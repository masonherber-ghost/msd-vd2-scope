import type { FeatureCardModel } from '@/lib/scope-derive'

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
}

export function FeatureCard({ feature, compact = false }: FeatureCardProps) {
  const conflicts = feature.conflicts.release + feature.conflicts.phase

  return (
    <article
      className={`feature-card${compact ? ' feature-card--compact' : ''}`}
      aria-label={`${feature.id} ${feature.name}`}
    >
      <div className="feature-card__header">
        <span className="feature-card__id">{feature.id}</span>
        {feature.capabilityCount > 0 ? (
          <span className="feature-card__id">
            {feature.capabilityCount} cap{feature.capabilityCount === 1 ? '' : 's'}
          </span>
        ) : null}
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
            <span className="feature-card__badge feature-card__badge--conflict">
              <span aria-hidden="true">!</span>
              {conflicts} conflict{conflicts === 1 ? '' : 's'}
            </span>
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
