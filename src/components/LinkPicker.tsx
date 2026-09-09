import { useMemo, useState } from 'react'

export type LinkOption = {
  id: number
  label: string
  hint?: string
  /** Shown as a small badge, e.g. the capability's release. */
  badge?: string
  /** False when the option sits outside the feature's own MVP refs. */
  related?: boolean
}

export type LinkPickerProps = {
  legend: string
  options: LinkOption[]
  selectedIds: number[]
  /** Rejects with the server's message; this component surfaces it. */
  onChange: (nextIds: number[]) => Promise<unknown>
  searchLabel?: string
  /** Sorts selected options to the top, so the current set reads first. */
  selectedFirst?: boolean
}

/**
 * Adds and removes links one at a time, each change sent as the complete new
 * set. Saving on toggle means there is no dirty state to protect, and the
 * server's message surfaces in place if a change is rejected.
 */
export function LinkPicker({
  legend,
  options,
  selectedIds,
  onChange,
  searchLabel = 'Search',
  selectedFirst = true,
}: LinkPickerProps) {
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<number | null>(null)

  const selected = useMemo(() => new Set(selectedIds), [selectedIds])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const matches = needle
      ? options.filter(
          (option) =>
            option.label.toLowerCase().includes(needle) ||
            (option.hint ?? '').toLowerCase().includes(needle),
        )
      : options
    if (!selectedFirst) return matches
    return [...matches].sort(
      (a, b) => Number(selected.has(b.id)) - Number(selected.has(a.id)),
    )
  }, [options, query, selected, selectedFirst])

  const toggle = async (id: number) => {
    const next = selected.has(id)
      ? selectedIds.filter((value) => value !== id)
      : [...selectedIds, id]

    setPendingId(id)
    setError(null)
    try {
      await onChange(next)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save that change.')
    } finally {
      setPendingId(null)
    }
  }

  const searchId = `link-picker-${legend.replace(/\s+/g, '-').toLowerCase()}`

  return (
    <fieldset className="link-picker">
      <legend className="link-picker__summary">
        {legend} — {selectedIds.length} selected
      </legend>

      <label className="sr-only" htmlFor={searchId}>
        {searchLabel}
      </label>
      <input
        id={searchId}
        type="search"
        className="link-picker__search"
        placeholder={searchLabel}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {error ? (
        <p role="alert" className="link-picker__error">
          {error}
        </p>
      ) : null}

      <div className="link-picker__options">
        {visible.length === 0 ? (
          <p className="link-picker__empty">No matches.</p>
        ) : (
          visible.map((option) => (
            <label
              key={option.id}
              className={`link-picker__option${
                option.related === false ? ' link-picker__option--unrelated' : ''
              }`}
            >
              <input
                type="checkbox"
                className="link-picker__checkbox"
                checked={selected.has(option.id)}
                disabled={pendingId !== null}
                onChange={() => void toggle(option.id)}
              />
              <span className="link-picker__label">
                {option.label}
                {option.hint ? <span className="link-picker__hint">{option.hint}</span> : null}
              </span>
              {option.badge ? (
                <span className="link-picker__badge">{option.badge}</span>
              ) : null}
            </label>
          ))
        )}
      </div>
    </fieldset>
  )
}
