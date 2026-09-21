import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ConflictBadge } from '@/components/ConflictBadge'
import { InlineEditField } from '@/components/InlineEditField'
import type { CapabilityCardModel } from '@/lib/capability-derive'
import { SOURCE_LABEL } from '@/lib/validators'

const ACTOR_LABEL: Record<string, string> = {
  employer: 'Employer',
  staff: 'Staff',
  jobseeker: 'Jobseeker',
  system: 'System',
}

export type CapabilityDetailPanelProps = {
  card: CapabilityCardModel
  onClose: () => void
  /** Opens a PwC feature in the feature view (R-8.16). */
  onSelectFeature?: (featureId: string) => void
  /** Opens the owning MSD feature in the MSD-feature view (R-8.16). */
  onSelectMvpFeature?: (mvpFeatureId: number) => void
  releaseLabels?: Map<string, string>
  phaseNames?: Map<string, string>
  /** Rejects with the server's message, which the field surfaces. */
  onSaveText?: (text: string) => Promise<unknown>
  /** Saves a question, or clears it when the text is emptied. */
  onSaveQuestion?: (question: string | null) => Promise<unknown>
  onDirtyChange?: (dirty: boolean) => void
  /**
   * Deletes the capability. `cascade` also removes the citations pointing at
   * it, so the panel has to ask for it explicitly. Rejects with the server's
   * message.
   */
  onDelete?: (cascade: boolean) => Promise<unknown>
}

/**
 * A capability's own page: where the table puts it, the MSD feature it
 * belongs to, and the PwC features that asked for it.
 *
 * The text is editable in place — click the title — and the capability can be
 * deleted from here. Placement is not editable: it is edited from the feature
 * whose conflict it causes, so offering a second editor here would give the
 * same decision two homes with no shared context.
 */
export function CapabilityDetailPanel({
  card,
  onClose,
  onSelectFeature,
  releaseLabels,
  phaseNames,
  onSelectMvpFeature,
  onSaveText,
  onSaveQuestion,
  onDirtyChange,
  onDelete,
}: CapabilityDetailPanelProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  // A different capability arriving abandons a pending confirmation.
  const [confirmingFor, setConfirmingFor] = useState(card.id)
  const deleteTriggerRef = useRef<HTMLButtonElement>(null)
  const confirmationRef = useRef<HTMLParagraphElement>(null)
  const confirmationWasOpen = useRef(false)
  const lastCardId = useRef(card.id)

  if (confirmingFor !== card.id) {
    setConfirmingFor(card.id)
    setConfirmingDelete(false)
    setDeleteError(null)
  }

  /**
   * The control that was clicked is unmounted by its own confirmation, and
   * focus would land on <body> — a keyboard user would have to tab from the
   * top of the document to reach the question they just asked. Focus moves to
   * the confirmation text, which states what will be deleted before the
   * buttons that do it, and returns to the trigger when it is dismissed
   * (WCAG 2.4.3, 4.1.3).
   *
   * A capability arriving from elsewhere also closes the confirmation, and
   * that is not a dismissal — nobody asked for focus to move, so it doesn't.
   */
  useEffect(() => {
    const cardChanged = lastCardId.current !== card.id
    lastCardId.current = card.id

    if (confirmingDelete) {
      confirmationWasOpen.current = true
      confirmationRef.current?.focus()
      return
    }
    if (confirmationWasOpen.current && !cardChanged) deleteTriggerRef.current?.focus()
    confirmationWasOpen.current = false
  }, [confirmingDelete, card.id])

  const runDelete = async (cascade: boolean) => {
    if (!onDelete) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await onDelete(cascade)
    } catch (caught) {
      setDeleteError(
        caught instanceof Error ? caught.message : 'Could not delete that capability.',
      )
    } finally {
      setDeleting(false)
    }
  }

  const placement =
    card.releaseId && card.phaseId
      ? `${releaseLabels?.get(card.releaseId) ?? card.releaseId} · ${
          phaseNames?.get(card.phaseId) ?? card.phaseId
        }`
      : 'Not placed'
  const conflicts = card.conflicts.release + card.conflicts.phase

  return (
    <aside className="capability-detail" aria-label={`Capability: ${card.text}`}>
      <div className="capability-detail__header">
        <div className="capability-detail__heading">
          <span className="capability-detail__eyebrow">
            Capability · {ACTOR_LABEL[card.actor]}
          </span>
          {onSaveText ? (
            <InlineEditField
              label="Capability text"
              value={card.text}
              multiline
              variant="heading"
              headingClassName="capability-detail__name"
              onSave={onSaveText}
              onDirtyChange={onDirtyChange}
            />
          ) : (
            <h2 className="capability-detail__name">{card.text}</h2>
          )}
          <span className="capability-detail__placement">{placement}</span>
        </div>
        <Button variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>

      {conflicts > 0 || card.conflicts.unmatched > 0 ? (
        <div className="capability-detail__badges">
          {conflicts > 0 ? (
            <ConflictBadge
              count={conflicts}
              state={card.conflicts.unreviewed > 0 ? 'unreviewed' : 'both_correct'}
            />
          ) : null}
          {card.conflicts.unmatched > 0 ? (
            <ConflictBadge count={card.conflicts.unmatched} kind="unmatched" />
          ) : null}
        </div>
      ) : null}

      {card.question ? (
        <p className="capability-detail__question" role="note">
          <span className="capability-detail__question-label">Question:</span>{' '}
          {card.question}
        </p>
      ) : null}

      {onSaveQuestion ? (
        <section className="capability-detail__section">
          <h3 className="capability-detail__section-title">Question</h3>
          <InlineEditField
            label="Question"
            value={card.question ?? ''}
            multiline
            addLabel="Add a question"
            // Emptying it clears the question rather than storing a blank one.
            onSave={(next) => onSaveQuestion(next.trim() === '' ? null : next)}
            onDirtyChange={onDirtyChange}
          />
        </section>
      ) : null}

      {card.releaseId === null || card.phaseId === null ? (
        <p className="capability-detail__note">
          The {SOURCE_LABEL.sequencing} never matched this text, so it has no release or
          stage. Never merged on a prefix — a human confirms it.
        </p>
      ) : null}

      <section className="capability-detail__section">
        <h3 className="capability-detail__section-title">MSD feature</h3>
        {card.mvpFeature ? (
          (() => {
            const owner = card.mvpFeature
            const body = (
              <>
                <span className="capability-detail__mvp-ref">
                  {owner.ref}
                  {owner.scopeOption ? ` · ${owner.scopeOption}` : ''}
                </span>
                <span className="capability-detail__mvp-title">{owner.title}</span>
                {card.ownerAmbiguous ? (
                  <span className="capability-detail__note">
                    Ref {card.ref} carries more than one record, so the owner was chosen
                    by rule rather than stated (D-3).
                  </span>
                ) : null}
              </>
            )
            return onSelectMvpFeature ? (
              <button
                type="button"
                className="capability-detail__mvp"
                onClick={() => onSelectMvpFeature(owner.id)}
              >
                {body}
              </button>
            ) : (
              <div className="capability-detail__mvp">{body}</div>
            )
          })()
        ) : (
          <p className="capability-detail__note">
            Ref {card.ref} did not resolve to an MSD feature record.
          </p>
        )}
      </section>

      <section className="capability-detail__section">
        <h3 className="capability-detail__section-title">
          PwC features citing this ({card.pwcFeatures.length})
        </h3>
        {card.pwcFeatures.length === 0 ? (
          <p className="capability-detail__note">
            No PwC feature cites this. It reaches the map from the{' '}
            {SOURCE_LABEL.sequencing} alone, which is worth a look: scope the table
            delivers that no feature asked for.
          </p>
        ) : (
          <ul className="capability-detail__list">
            {card.pwcFeatures.map((feature) => {
              // Shown whether or not the row is clickable: a citing feature
              // sitting in another release is the finding, not a decoration
              // on the link to it.
              const body = (
                <>
                  <span className="capability-detail__feature-id">{feature.id}</span>
                  <span className="capability-detail__feature-name">{feature.name}</span>
                  <span className="capability-detail__feature-place">
                    {releaseLabels?.get(feature.releaseId) ?? feature.releaseId}
                    {card.releaseId && feature.releaseId !== card.releaseId
                      ? ' · differs from this capability'
                      : ''}
                  </span>
                </>
              )
              return (
                <li key={feature.id}>
                  {onSelectFeature ? (
                    <button
                      type="button"
                      className="capability-detail__feature"
                      onClick={() => onSelectFeature(feature.id)}
                    >
                      {body}
                    </button>
                  ) : (
                    <span className="capability-detail__feature">{body}</span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {onDelete ? (
        <section className="capability-detail__section">
          <h3 className="capability-detail__section-title">Delete</h3>
          {!confirmingDelete ? (
            <Button
              ref={deleteTriggerRef}
              variant="outline"
              size="sm"
              onClick={() => setConfirmingDelete(true)}
            >
              Delete this capability
            </Button>
          ) : (
            <>
              {/* States exactly what goes with it and how many (R-9.5), and
                  is what focus moves to, so it is read before the buttons. */}
              <p className="capability-detail__prose" ref={confirmationRef} tabIndex={-1}>
                Delete “{card.text}”?{' '}
                {card.pwcFeatures.length > 0
                  ? `This also removes the citation${
                      card.pwcFeatures.length === 1 ? '' : 's'
                    } from ${card.pwcFeatures
                      .map((feature) => feature.id)
                      .join(', ')}, and any conflict decision recorded against ${
                      card.pwcFeatures.length === 1 ? 'it' : 'them'
                    }. Those features are kept.`
                  : 'Nothing cites it.'}{' '}
                A re-import of the {SOURCE_LABEL.sequencing} would bring it back.
              </p>
              {deleteError ? (
                <p role="alert" className="capability-detail__note">
                  {deleteError}
                </p>
              ) : null}
              <div className="capability-detail__actions">
                <Button
                  size="sm"
                  onClick={() => void runDelete(card.pwcFeatures.length > 0)}
                  disabled={deleting}
                >
                  {deleting
                    ? 'Deleting…'
                    : card.pwcFeatures.length > 0
                      ? 'Delete and remove those citations'
                      : 'Delete it'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={deleting}
                >
                  Cancel
                </Button>
              </div>
            </>
          )}
        </section>
      ) : null}
    </aside>
  )
}
