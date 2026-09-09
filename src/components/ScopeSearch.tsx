import { useEffect, useId, useRef, useState } from 'react'
import { MATCH_LABEL, type SearchHit, type SearchResult } from '@/lib/scope-search'

export type ScopeSearchProps = {
  value: string
  onChange: (value: string) => void
  results: SearchResult
  /** Enter, or a click, reveals the feature on the map (R-8.13). */
  onSelect: (hit: SearchHit) => void
}

/** Wraps the matched span so the term is visible in its context. */
export function Highlight({
  text,
  start,
  length,
}: {
  text: string
  start: number
  length: number
}) {
  if (start < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, start)}
      <mark className="scope-search__mark">{text.slice(start, start + length)}</mark>
      {text.slice(start + length)}
    </>
  )
}

/** Marks the first occurrence of a term anywhere in a block of text. */
export function HighlightText({ text, term }: { text: string; term: string }) {
  const needle = term.trim().toLowerCase()
  if (needle === '') return <>{text}</>
  const at = text.toLowerCase().indexOf(needle)
  if (at === -1) return <>{text}</>
  return <Highlight text={text} start={at} length={needle.length} />
}

export function ScopeSearch({ value, onChange, results, onSelect }: ScopeSearchProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  // "/" focuses search from anywhere, unless the user is already typing (R-10.4).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/') return
      const target = event.target as HTMLElement | null
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable === true
      if (typing) return
      event.preventDefault()
      inputRef.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const showResults = open && value.trim() !== ''
  const active = results.flat[activeIndex]

  const move = (delta: number) => {
    if (results.flat.length === 0) return
    setActiveIndex((current) => {
      const next = current + delta
      if (next < 0) return results.flat.length - 1
      if (next >= results.flat.length) return 0
      return next
    })
  }

  const choose = (hit: SearchHit) => {
    onSelect(hit)
    setOpen(false)
  }

  return (
    <div className="scope-search">
      <div className="scope-search__field">
        <label className="sr-only" htmlFor={`${listId}-input`}>
          Search the scope
        </label>
        <input
          id={`${listId}-input`}
          ref={inputRef}
          type="search"
          role="combobox"
          className="scope-search__input"
          placeholder="Search features, capabilities, assumptions…"
          autoComplete="off"
          aria-expanded={showResults}
          aria-controls={listId}
          aria-activedescendant={active ? `${listId}-${active.key}` : undefined}
          value={value}
          onChange={(event) => {
            onChange(event.target.value)
            setActiveIndex(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              move(1)
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              move(-1)
            } else if (event.key === 'Enter') {
              if (active) {
                event.preventDefault()
                choose(active)
              }
            } else if (event.key === 'Escape') {
              setOpen(false)
              inputRef.current?.blur()
            }
          }}
        />
        <span className="scope-search__hint" aria-hidden="true">
          /
        </span>
      </div>

      {showResults ? (
        <div className="scope-search__results" id={listId} role="listbox" aria-label="Search results">
          {results.total === 0 ? (
            <p className="scope-search__empty">
              Nothing matches “{value.trim()}”.
            </p>
          ) : (
            results.groups.map((group) => (
              <div key={group.kind} className="scope-search__group">
                {/* Grouped by what matched: an assumption hit means something
                    different from a title hit (R-8.12). */}
                <span className="scope-search__group-label">
                  {MATCH_LABEL[group.kind]} ({group.hits.length})
                </span>
                <ul className="scope-search__list">
                  {group.hits.map((hit) => (
                    <li key={hit.key}>
                      <button
                        type="button"
                        id={`${listId}-${hit.key}`}
                        role="option"
                        aria-selected={hit.key === active?.key}
                        className="scope-search__hit"
                        // The input keeps focus so typing continues to work;
                        // mousedown avoids the blur that would close the list.
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => choose(hit)}
                      >
                        <span className="scope-search__hit-title">{hit.title}</span>
                        <span className="scope-search__hit-context">
                          <Highlight
                            text={hit.context}
                            start={hit.matchStart}
                            length={hit.matchLength}
                          />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}
