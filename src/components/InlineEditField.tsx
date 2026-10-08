import { useEffect, useRef, useState } from 'react'
import { MarkdownText } from '@/components/MarkdownText'
import { HighlightText } from '@/components/ScopeSearch'
import { Button } from '@/components/ui/button'

export type InlineEditFieldProps = {
  label: string
  value: string
  /** Rejects with the server's message; the caller surfaces it. */
  onSave: (next: string) => Promise<unknown>
  multiline?: boolean
  /** When present, the field edits as a select rather than a text input. */
  options?: { value: string; label: string }[]
  /** Shown instead of the raw value when not editing. */
  displayValue?: string
  /** A search term to mark in the displayed value (R-8.13). */
  highlight?: string
  /** Reports whether an edit is in progress, for navigation protection. */
  onDirtyChange?: (dirty: boolean) => void
  /**
   * `heading` makes the value itself the thing you click, rendered as the
   * panel's own heading rather than a labelled field beside an Edit button.
   * Used where the value *is* the title, so a separate control would sit
   * oddly next to it.
   */
  variant?: 'field' | 'heading'
  /** Class for the heading, so the caller keeps its own type styling. */
  headingClassName?: string
  /** Button label when there is no value yet — "Add a question", not "Edit". */
  addLabel?: string
  /**
   * The value is markdown: rendered when shown, edited as source in a
   * multi-line field. Implies `multiline`.
   */
  markdown?: boolean
  /** Shown when there is no value, in place of "Not set". */
  emptyText?: string
}

/**
 * Click a field, edit in place, save (R-9.2). Enter saves a single-line
 * field, Escape cancels, and a failed save keeps the draft so nothing typed
 * is lost.
 */
export function InlineEditField({
  label,
  value,
  onSave,
  multiline = false,
  options,
  displayValue,
  highlight = '',
  onDirtyChange,
  variant = 'field',
  headingClassName,
  addLabel,
  markdown = false,
  emptyText,
}: InlineEditFieldProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Tracks which value the draft belongs to, so a different feature arriving
  // resets the editor during render rather than in an effect.
  const [editingValue, setEditingValue] = useState(value)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null)

  if (editingValue !== value) {
    setEditingValue(value)
    setDraft(value)
    setEditing(false)
    setError(null)
  }

  const dirty = editing && draft.trim() !== value.trim()

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const cancel = () => {
    setDraft(value)
    setEditing(false)
    setError(null)
  }

  /**
   * Escape cancels the edit and stops there. These fields sit inside the
   * detail panels, which are modals, and a modal closes on Escape too —
   * without this, cancelling an edit would also close the panel around it.
   */
  const cancelOnEscape = (event: { stopPropagation: () => void }) => {
    event.stopPropagation()
    cancel()
  }

  const save = async () => {
    const next = draft.trim()
    if (next === value.trim()) {
      cancel()
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(next)
      setEditing(false)
    } catch (caught) {
      // Keep the draft so the typing is not lost.
      setError(caught instanceof Error ? caught.message : 'Could not save that change.')
    } finally {
      setSaving(false)
    }
  }

  if (!editing && variant === 'heading') {
    return (
      <h2 className={headingClassName}>
        <button
          type="button"
          className="inline-edit__heading-button"
          onClick={() => setEditing(true)}
          aria-label={`Edit ${label.toLowerCase()}: ${displayValue ?? value}`}
        >
          <HighlightText text={displayValue ?? value ?? ''} term={highlight} />
          {!displayValue && !value ? <em>Not set</em> : null}
        </button>
      </h2>
    )
  }

  if (!editing) {
    return (
      <div className={markdown ? 'inline-edit inline-edit--markdown' : 'inline-edit'}>
        {markdown && value ? (
          <div className="inline-edit__value">
            <MarkdownText text={value} highlight={highlight} />
          </div>
        ) : (
          <span className="inline-edit__value">
            <HighlightText text={displayValue ?? value ?? ''} term={highlight} />
            {!displayValue && !value ? <em>{emptyText ?? 'Not set'}</em> : null}
          </span>
        )}
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          {!value && addLabel ? addLabel : `Edit ${label.toLowerCase()}`}
        </Button>
      </div>
    )
  }

  const inputId = `inline-edit-${label.replace(/\s+/g, '-').toLowerCase()}`

  return (
    <div className="inline-edit inline-edit--editing">
      <label className="inline-edit__label" htmlFor={inputId}>
        {label}
      </label>
      {options ? (
        <select
          id={inputId}
          ref={inputRef as React.Ref<HTMLSelectElement>}
          className="inline-edit__input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') cancelOnEscape(event)
          }}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : multiline || markdown ? (
        <textarea
          id={inputId}
          ref={inputRef as React.Ref<HTMLTextAreaElement>}
          className="inline-edit__input"
          rows={markdown ? 10 : 4}
          aria-describedby={markdown ? `${inputId}-hint` : undefined}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') cancelOnEscape(event)
          }}
        />
      ) : (
        <input
          id={inputId}
          ref={inputRef as React.Ref<HTMLInputElement>}
          className="inline-edit__input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void save()
            if (event.key === 'Escape') cancelOnEscape(event)
          }}
        />
      )}

      {markdown ? (
        <p id={`${inputId}-hint`} className="inline-edit__hint">
          Markdown: <code>1.</code> numbered list, <code>-</code> bullet,{' '}
          <code>**bold**</code>, <code>_italic_</code>, <code>[text](url)</code>
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="inline-edit__error">
          {error}
        </p>
      ) : null}

      <div className="inline-edit__actions">
        <Button size="sm" onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="outline" size="sm" onClick={cancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
