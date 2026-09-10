import type { CSSProperties } from 'react'
import { mvpCardLabel, type MvpCardModel } from '@/lib/mvp-derive'
import { releaseTokenSuffix } from '@/lib/scope-derive'

const ACTOR_LABEL: Record<string, string> = {
  employer: 'Employer',
  staff: 'Staff',
  jobseeker: 'Jobseeker',
  system: 'System',
}

export type MvpCardProps = {
  card: MvpCardModel
  /** The release cell this instance is rendered in — a card can straddle. */
  releaseId: string
  releaseLabel?: string
  /** Hides the secondary detail when the map is zoomed out (R-8.7). */
  compact?: boolean
  selected?: boolean
  onSelect?: (mvpId: number) => void
}

/**
 * An MSD (MVP) feature on the map. The mirror of `FeatureCard`: the ref is
 * the identity, and the PwC features that cite it are the supporting detail
 * rather than the subject.
 */
export function MvpCard({
  card,
  releaseId,
  releaseLabel,
  compact = false,
  selected = false,
  onSelect,
}: MvpCardProps) {
  const label = mvpCardLabel(card)
  const style = {
    '--card-accent': `var(--color-release-${releaseTokenSuffix(releaseId)})`,
    '--release-pill-bg': `var(--color-release-${releaseTokenSuffix(releaseId)})`,
    '--release-pill-fg': 'var(--color-primary-foreground)',
  } as CSSProperties

  const accessibleName = `MSD feature ${label} ${card.title}`

  return (
    <article
      className={[
        'mvp-card',
        compact ? 'mvp-card--compact' : '',
        selected ? 'mvp-card--selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={onSelect ? undefined : accessibleName}
      style={style}
      data-mvp-id={card.id}
    >
      <div className="mvp-card__header">
        {onSelect ? (
          // Same pattern as FeatureCard: only phrasing content in the button
          // so the markup stays valid while ::after makes the card clickable.
          // The name is explicit — JSX strips the newline between spans.
          <button
            type="button"
            className="mvp-card__select"
            aria-label={accessibleName}
            aria-pressed={selected}
            onClick={() => onSelect(card.id)}
          >
            <span className="mvp-card__ref">{label}</span>
          </button>
        ) : (
          <span className="mvp-card__ref">{label}</span>
        )}
        {releaseLabel ? (
          <span className="mvp-card__release">{releaseLabel}</span>
        ) : null}
      </div>

      <h3 className="mvp-card__title">{card.title}</h3>

      {card.pwcFeatures.length > 0 ? (
        <ul
          className="mvp-card__chips"
          aria-label={`PwC features citing ${label}`}
        >
          {card.pwcFeatures.map((feature) => (
            <li key={feature.id} className="mvp-card__chip" title={feature.name}>
              {feature.id}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mvp-card__note">No PwC feature cites this</p>
      )}

      {card.actorCounts.length > 0 ? (
        <ul className="mvp-card__actors">
          {card.actorCounts.map(({ actor, count }) => (
            <li key={actor} className={`mvp-card__actor mvp-card__actor--${actor}`}>
              {ACTOR_LABEL[actor]}
              <span className="mvp-card__actor-count">{count}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mvp-card__badges">
        <span className="mvp-card__badge">
          {card.capabilities.length} capabilit
          {card.capabilities.length === 1 ? 'y' : 'ies'}
        </span>
        {/* Placement is not a property of the record — say where it came
            from, or a fallback placement reads as fact. */}
        {card.placement === 'feature' ? (
          <span className="mvp-card__badge mvp-card__badge--derived">
            placed by its PwC feature
          </span>
        ) : null}
        {card.cells.length > 1 ? (
          <span className="mvp-card__badge mvp-card__badge--derived">
            spans {card.cells.length} cells
          </span>
        ) : null}
      </div>
    </article>
  )
}
