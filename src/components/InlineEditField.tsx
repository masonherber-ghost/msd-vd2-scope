import { useEffect, useRef, useState } from 'react'
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
  /** Reports whether an edit is in progress, for navigation protection. */
  onDirtyChange?: (dirty: boolean) => void
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
  onDirtyChange,
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

  if (!editing) {
    return (
      <div className="inline-edit">
        <span className="inline-edit__value">
          {displayValue ?? value ?? ''}
          {!displayValue && !value ? <em>Not set</em> : null}
        </span>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          Edit {label.toLowerCase()}
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
            if (event.key === 'Escape') cancel()
          }}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : multiline ? (
        <textarea
          id={inputId}
          ref={inputRef as React.Ref<HTMLTextAreaElement>}
          className="inline-edit__input"
          rows={4}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') cancel()
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
            if (event.key === 'Escape') cancel()
          }}
        />
      )}

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
