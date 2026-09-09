import { RESOLUTION_LABEL, type ResolutionState } from '@/lib/validators'

export type ConflictBadgeProps = {
  count: number
  /** Unreviewed conflicts are the ones that still need a decision. */
  state?: ResolutionState
  kind?: 'conflict' | 'unmatched'
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
  const noun = kind === 'unmatched' ? 'unmatched' : `conflict${count === 1 ? '' : 's'}`

  return (
    <span
      className={`conflict-badge conflict-badge--${unreviewed ? 'unreviewed' : 'reviewed'}`}
      title={unreviewed ? 'Not yet reviewed' : RESOLUTION_LABEL[state]}
    >
      <span className="conflict-badge__glyph" aria-hidden="true">
        {unreviewed ? '!' : '✓'}
      </span>
      {count} {noun}
      {unreviewed ? '' : ' · reviewed'}
    </span>
  )
}
