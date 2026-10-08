import { Flag } from 'lucide-react'
import { RESOLUTION_LABEL, type ResolutionState } from '@/lib/validators'

export type ConflictBadgeProps = {
  count: number
  /** Unreviewed conflicts are the ones that still need a decision. */
  state?: ResolutionState
  kind?: 'conflict' | 'unmatched' | 'question'
}

/**
 * Marks a feature or capability carrying a conflict, so one is visible on the
 * map without opening the reconciliation view (R-7.4).
 */
export function ConflictBadge({
  count,
  state = 'unreviewed',
  kind = 'conflict',
}: ConflictBadgeProps) {
  if (count <= 0) return null

  const unreviewed = state === 'unreviewed'
  const noun =
    kind === 'unmatched'
      ? 'unmatched'
      : kind === 'question'
        ? `question${count === 1 ? '' : 's'}`
        : `conflict${count === 1 ? '' : 's'}`
  // A question is flagged, not warned about — and the same flag wherever it
  // appears, so one signal means one thing across the whole map.
  const glyph = unreviewed ? '!' : '✓'

  return (
    <span
      className={[
        'conflict-badge',
        `conflict-badge--${unreviewed ? 'unreviewed' : 'reviewed'}`,
        kind === 'question' ? 'conflict-badge--question' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      title={
        kind === 'question'
          ? 'A question has been raised'
          : unreviewed
            ? 'Not yet reviewed'
            : RESOLUTION_LABEL[state]
      }
    >
      {kind === 'question' ? (
        <Flag className="conflict-badge__flag" aria-hidden="true" />
      ) : (
        <span className="conflict-badge__glyph" aria-hidden="true">
          {glyph}
        </span>
      )}
      {count} {noun}
      {unreviewed ? '' : ' · reviewed'}
    </span>
  )
}
