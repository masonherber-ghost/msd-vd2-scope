import { useState } from 'react'
import { HighlightText } from '@/components/ScopeSearch'
import { Button } from '@/components/ui/button'
import type { FeatureDetail } from '@/lib/feature-detail'

export type AssumptionListProps = {
  assumptions: FeatureDetail['assumptions']
  onAdd: (text: string) => Promise<unknown>
  onEdit: (id: number, text: string) => Promise<unknown>
  onMove: (id: number, direction: 'up' | 'down') => Promise<unknown>
  onDelete: (id: number) => Promise<unknown>
  /** A search term to mark in the assumption text (R-8.13). */
  highlight?: string
}

/**
 * Assumptions are an ordered list, so order is editable — with explicit
 * move-up and move-down controls, never drag-only (R-9.8).
 */
export function AssumptionList({
  assumptions,
  onAdd,
  onEdit,
  onMove,
  onDelete,
  highlight = '',
}: AssumptionListProps) {
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      return true
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save that change.')
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="assumption-list__add">
      {error ? (
        <p role="alert" className="assumption-list__error">
          {error}
        </p>
      ) : null}

      <ol className="assumption-list">
        {assumptions.map((assumption, index) => (
          <li key={assumption.id} className="assumption-list__item">
            <span className="assumption-list__position">{assumption.position}.</span>

            <div className="assumption-list__body">
              {editingId === assumption.id ? (
                <>
                  <label className="sr-only" htmlFor={`assumption-${assumption.id}`}>
                    Assumption {assumption.position}
                  </label>
                  <textarea
                    id={`assumption-${assumption.id}`}
                    className="assumption-list__input"
                    rows={3}
                    value={editDraft}
                    onChange={(event) => setEditDraft(event.target.value)}
                  />
                  <div className="assumption-list__controls">
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={async () => {
                        const ok = await run(() => onEdit(assumption.id, editDraft.trim()))
                        if (ok) setEditingId(null)
                      }}
                    >
                      Save
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <span className="assumption-list__text">
                    <HighlightText text={assumption.text} term={highlight} />
                  </span>
                  {assumption.source === 'manual' ? (
                    <span className="assumption-list__manual">added here</span>
                  ) : null}
                </>
              )}
            </div>

            {editingId === assumption.id ? null : (
              <div className="assumption-list__controls">
                <button
                  type="button"
                  className="assumption-list__control"
                  disabled={index === 0 || busy}
                  onClick={() => void run(() => onMove(assumption.id, 'up'))}
                  aria-label={`Move assumption ${assumption.position} up`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="assumption-list__control"
                  disabled={index === assumptions.length - 1 || busy}
                  onClick={() => void run(() => onMove(assumption.id, 'down'))}
                  aria-label={`Move assumption ${assumption.position} down`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="assumption-list__control"
                  disabled={busy}
                  onClick={() => {
                    setEditingId(assumption.id)
                    setEditDraft(assumption.text)
                  }}
                  aria-label={`Edit assumption ${assumption.position}`}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="assumption-list__control"
                  disabled={busy}
                  onClick={() => void run(() => onDelete(assumption.id))}
                  aria-label={`Delete assumption ${assumption.position}`}
                >
                  ✕
                </button>
              </div>
            )}
          </li>
        ))}
      </ol>

      <label className="sr-only" htmlFor="new-assumption">
        New assumption
      </label>
      <textarea
        id="new-assumption"
        className="assumption-list__input"
        rows={2}
        placeholder="Add an assumption"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <Button
        variant="outline"
        size="sm"
        disabled={busy || draft.trim() === ''}
        onClick={async () => {
          const ok = await run(() => onAdd(draft.trim()))
          if (ok) setDraft('')
        }}
      >
        Add assumption
      </Button>
    </div>
  )
}
