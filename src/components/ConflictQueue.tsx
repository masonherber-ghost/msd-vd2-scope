import { useState } from 'react'
import { ConflictBadge } from '@/components/ConflictBadge'
import { Button } from '@/components/ui/button'
import type { ConflictRow } from '@/lib/scope-conflicts'
import { RESOLUTION_LABEL, RESOLUTION_STATES, type ResolutionState } from '@/lib/validators'

export type ConflictQueueProps = {
  title: string
  note?: string
  rows: ConflictRow[]
  featureSourceLabel: string
  tableSourceLabel: string
  onResolve: (id: number, state: ResolutionState, note: string | null) => Promise<unknown>
  emptyMessage: string
}

/**
 * One group of conflicts. Both placements sit side by side and the decision
 * is made in place, without leaving the list (R-7.3).
 */
export function ConflictQueue({
  title,
  note,
  rows,
  featureSourceLabel,
  tableSourceLabel,
  onResolve,
  emptyMessage,
}: ConflictQueueProps) {
  // aria-labelledby takes a space-separated list of ids, so the id itself
  // must not contain a space or the label silently fails to resolve.
  const headingId = `queue-${title.replace(/\s+/g, '-').toLowerCase()}`

  return (
    <section className="conflict-queue" aria-labelledby={headingId}>
      <h2 className="conflict-queue__group-title" id={headingId}>
        {title} ({rows.length})
      </h2>
      {note ? <p className="conflict-queue__group-note">{note}</p> : null}

      {rows.length === 0 ? (
        <p className="conflict-queue__group-note">{emptyMessage}</p>
      ) : (
        <ul className="conflict-queue__list">
          {rows.map((row) => (
            <li key={`${row.kind}-${row.id}`}>
              <ConflictRowItem
                row={row}
                featureSourceLabel={featureSourceLabel}
                tableSourceLabel={tableSourceLabel}
                onResolve={onResolve}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ConflictRowItem({
  row,
  featureSourceLabel,
  tableSourceLabel,
  onResolve,
}: {
  row: ConflictRow
  featureSourceLabel: string
  tableSourceLabel: string
  onResolve: (id: number, state: ResolutionState, note: string | null) => Promise<unknown>
}) {
  const [note, setNote] = useState(row.resolutionNote ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const save = async (state: ResolutionState, nextNote: string | null) => {
    setSaving(true)
    setError(null)
    try {
      await onResolve(row.id, state, nextNote)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save that decision.')
    } finally {
      setSaving(false)
    }
  }

  const resolved = row.resolutionState !== 'unreviewed'
  const selectId = `resolution-${row.kind}-${row.id}`
  const noteId = `note-${row.kind}-${row.id}`

  return (
    <article
      className={`conflict-queue__row${resolved ? ' conflict-queue__row--resolved' : ''}`}
      aria-label={`${row.featureId} — ${row.capabilityText}`}
    >
      <div className="conflict-queue__heading">
        <span className="conflict-queue__feature">{row.featureId}</span>
        <span className="conflict-queue__capability">{row.capabilityText}</span>
        <span className="conflict-queue__meta">
          {row.capabilityRef} · {row.actor}
        </span>
        <ConflictBadge
          count={1}
          state={row.resolutionState}
          kind={row.kind === 'unmatched' ? 'unmatched' : 'conflict'}
        />
      </div>

      {/* Both placements recorded, neither discarded (R-7.1). */}
      <div className="conflict-queue__placements">
        <div className="conflict-queue__placement">
          <span className="conflict-queue__placement-source">{featureSourceLabel}</span>
          <span className="conflict-queue__placement-value">{row.featurePlacement}</span>
        </div>
        <div className="conflict-queue__placement">
          <span className="conflict-queue__placement-source">{tableSourceLabel}</span>
          <span className="conflict-queue__placement-value">{row.tablePlacement}</span>
        </div>
      </div>

      {error ? (
        <p role="alert" className="conflict-queue__error">
          {error}
        </p>
      ) : null}

      <div className="conflict-queue__resolution">
        <label className="sr-only" htmlFor={selectId}>
          Resolution for {row.featureId} {row.capabilityText}
        </label>
        <select
          id={selectId}
          className="conflict-queue__select"
          value={row.resolutionState}
          disabled={saving}
          onChange={(event) =>
            void save(event.target.value as ResolutionState, note.trim() || null)
          }
        >
          {RESOLUTION_STATES.map((state) => (
            <option key={state} value={state}>
              {RESOLUTION_LABEL[state]}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor={noteId}>
          Note for {row.featureId} {row.capabilityText}
        </label>
        <input
          id={noteId}
          className="conflict-queue__note"
          placeholder="Add a note"
          value={note}
          disabled={saving}
          onChange={(event) => setNote(event.target.value)}
          onBlur={() => {
            if ((row.resolutionNote ?? '') === note.trim()) return
            void save(row.resolutionState, note.trim() || null)
          }}
        />

        {resolved ? (
          <Button
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={() => void save('unreviewed', note.trim() || null)}
          >
            Reopen
          </Button>
        ) : null}
      </div>
    </article>
  )
}
