import { detailGroupsFor, type DetailKey, type DetailState } from '@/lib/card-detail'
import type { ViewMode } from '@/lib/scope-derive'

export type CardDetailBarProps = {
  id?: string
  view: ViewMode
  state: DetailState
  onToggle: (key: DetailKey) => void
  onShowAll: () => void
  onClose: () => void
}

/**
 * What each card is showing.
 *
 * A row of pressed/unpressed toggles rather than a popover: the map is the
 * thing being read, and a menu that has to stay open over it to be changed
 * fights the content. This sits above the grid, so you can see a toggle take
 * effect on the cards while deciding whether you wanted it.
 *
 * The toggles change with the view because the cards do — a capability card
 * has no MSD-ref chips to hide, and offering a control that changes nothing
 * is worse than offering none.
 */
export function CardDetailBar({
  id,
  view,
  state,
  onToggle,
  onShowAll,
  onClose,
}: CardDetailBarProps) {
  const groups = detailGroupsFor(view)
  const allShown = groups.every((group) => state[group.key])

  return (
    <section className="card-detail" id={id} aria-label="Card detail">
      <h2 className="card-detail__title">Show on each card</h2>

      <ul className="card-detail__list">
        {groups.map((group) => (
          <li key={group.key}>
            <button
              type="button"
              className="card-detail__toggle"
              aria-pressed={state[group.key]}
              title={group.hint}
              onClick={() => onToggle(group.key)}
            >
              {group.label}
            </button>
          </li>
        ))}
      </ul>

      <div className="card-detail__actions">
        <button
          type="button"
          className="card-detail__link"
          onClick={onShowAll}
          disabled={allShown}
        >
          Show all
        </button>
        <button type="button" className="card-detail__link" onClick={onClose}>
          Done
        </button>
      </div>
    </section>
  )
}
