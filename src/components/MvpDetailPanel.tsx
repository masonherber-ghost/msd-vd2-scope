import { useEffect, useRef, useState } from 'react'
import { InlineEditField } from '@/components/InlineEditField'
import { LinkPicker, type LinkOption } from '@/components/LinkPicker'
import { Button } from '@/components/ui/button'
import { mvpCardLabel, type MvpCardModel } from '@/lib/mvp-derive'
import { SOURCE_LABEL } from '@/lib/validators'

const ACTOR_LABEL: Record<string, string> = {
  employer: 'Employer',
  staff: 'Staff',
  jobseeker: 'Jobseeker',
  system: 'System',
}

/** The option that hands the record back to the sources. */
const UNSTATED = 'Not stated — placed by its capabilities'

const PLACEMENT_NOTE: Record<MvpCardModel['placement'], string> = {
  stated:
    'Placed by hand on the record itself, which outranks both derived placements. Set the release and stage back to “not stated” to hand it back to the sources.',
  capability: `Placed where the ${SOURCE_LABEL.sequencing} schedules its capabilities. Neither source gives an MSD feature a release of its own.`,
  feature:
    `This record owns no placed capability, so it is placed by the PwC features that cite it. That is a weaker footing than the ${SOURCE_LABEL.sequencing}’s own placement.`,
  unplaced: 'Nothing places this record: it owns no capability and no PwC feature cites it.',
}

export type MvpDetailPanelProps = {
  card: MvpCardModel
  onClose: () => void
  /** Opens a PwC feature in the feature view (R-8.16). */
  onSelectFeature?: (featureId: string) => void
  releaseLabels?: Map<string, string>
  phaseNames?: Map<string, string>
  /** Every capability, for the ownership editor. Omitted when read-only. */
  capabilityOptions?: LinkOption[]
  /** The capabilities this record currently owns. */
  ownedCapabilityIds?: number[]
  /** Rejects with the server's message, which the picker surfaces. */
  onSetCapabilities?: (capabilityIds: number[]) => Promise<unknown>
  /** Release and stage choices, for re-assigning the record. */
  releaseOptions?: { value: string; label: string }[]
  phaseOptions?: { value: string; label: string }[]
  /**
   * Places the record itself. This is the same field Manage writes, and it
   * outranks both derived placements, so a change here moves the card on the
   * map. `null` clears it and hands the record back to the sources.
   */
  onSetStatedPlacement?: (patch: {
    release_id?: string | null
    phase_id?: string | null
  }) => Promise<unknown>
  /** Renames the record. Rejects with the server's message. */
  onSaveTitle?: (title: string) => Promise<unknown>
  /** Saves a question, or clears it when the text is emptied. */
  onSaveQuestion?: (question: string | null) => Promise<unknown>
  onDirtyChange?: (dirty: boolean) => void
}

/**
 * The MSD-feature side of the detail panel.
 *
 * The title is editable in place — click it. Capabilities are editable here
 * and nowhere else: a capability is owned by
 * one MSD feature record, so this panel is that relationship's only home. The
 * PwC features are not — they *cite* this record, which is a different
 * relationship, and it is edited from the feature that does the citing.
 */
export function MvpDetailPanel({
  card,
  onClose,
  onSelectFeature,
  releaseLabels,
  phaseNames,
  capabilityOptions,
  ownedCapabilityIds = [],
  onSetCapabilities,
  releaseOptions,
  phaseOptions,
  onSetStatedPlacement,
  onSaveTitle,
  onSaveQuestion,
  onDirtyChange,
}: MvpDetailPanelProps) {
  const label = mvpCardLabel(card)
  // The lookup stays closed until the shown capability is tapped, so the
  // panel reads as the record rather than as one long checklist.
  const [editorOpen, setEditorOpen] = useState(false)
  // A different record arriving abandons an open editor. Tracked during
  // render rather than in an effect.
  const [editorFor, setEditorFor] = useState(card.id)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const editorWasOpen = useRef(false)
  const lastCardId = useRef(card.id)

  if (editorFor !== card.id) {
    setEditorFor(card.id)
    setEditorOpen(false)
  }

  /**
   * The lookup replaces the control that opened it, so focus has to follow it
   * in and come back out again (WCAG 2.4.3). Going in is the picker's own
   * `autoFocus`; coming back is here — but only when the lookup was dismissed,
   * not when a different record closed it.
   */
  useEffect(() => {
    const cardChanged = lastCardId.current !== card.id
    lastCardId.current = card.id

    if (editorOpen) {
      editorWasOpen.current = true
      return
    }
    if (editorWasOpen.current && !cardChanged) triggerRef.current?.focus()
    editorWasOpen.current = false
  }, [editorOpen, card.id])

  const canEdit = Boolean(onSetCapabilities && capabilityOptions)
  const placeName = (releaseId: string, phaseId: string) =>
    `${releaseLabels?.get(releaseId) ?? releaseId} · ${phaseNames?.get(phaseId) ?? phaseId}`

  return (
    <aside className="mvp-detail" aria-label={`MSD feature ${label}`}>
      <div className="mvp-detail__header">
        <div className="mvp-detail__heading">
          <span className="mvp-detail__ref">
            MSD feature {label}
            {card.scopeOption ? null : ' · no scope option'}
          </span>
          {onSaveTitle ? (
            // The title is the thing you click — a separate Edit button beside
            // a heading reads as a second title.
            <InlineEditField
              label="MSD feature title"
              value={card.title}
              variant="heading"
              headingClassName="mvp-detail__name"
              onSave={onSaveTitle}
              onDirtyChange={onDirtyChange}
            />
          ) : (
            <h2 className="mvp-detail__name">{card.title}</h2>
          )}
          <span className="mvp-detail__placement">
            {card.cells.length === 0
              ? 'Not placed'
              : card.cells.map((c) => placeName(c.releaseId, c.phaseId)).join(' · ')}
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>

      <p className="mvp-detail__note">{PLACEMENT_NOTE[card.placement]}</p>

      {card.question ? (
        <p className="mvp-detail__question" role="note">
          <span className="mvp-detail__question-label">Question:</span> {card.question}
        </p>
      ) : null}

      {onSaveQuestion ? (
        <section className="mvp-detail__section">
          <h3 className="mvp-detail__section-title">Question</h3>
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

      {releaseOptions && phaseOptions && onSetStatedPlacement ? (
        <section className="mvp-detail__section">
          <h3 className="mvp-detail__section-title">Placement</h3>
          <InlineEditField
            label="Release"
            value={card.stated.releaseId ?? ''}
            displayValue={
              card.stated.releaseId
                ? (releaseLabels?.get(card.stated.releaseId) ?? card.stated.releaseId)
                : 'Not stated'
            }
            options={[{ value: '', label: UNSTATED }, ...releaseOptions]}
            onSave={(release_id) => onSetStatedPlacement({ release_id: release_id || null })}
            onDirtyChange={onDirtyChange}
          />
          <InlineEditField
            label="Stage"
            value={card.stated.phaseId ?? ''}
            displayValue={
              card.stated.phaseId
                ? (phaseNames?.get(card.stated.phaseId) ?? card.stated.phaseId)
                : 'Not stated'
            }
            options={[{ value: '', label: UNSTATED }, ...phaseOptions]}
            onSave={(phase_id) => onSetStatedPlacement({ phase_id: phase_id || null })}
            onDirtyChange={onDirtyChange}
          />
          {/* A cell is a release AND a stage, so half a statement places
              nothing — say so rather than letting a half-set record look
              like the control did not work. */}
          <p className="mvp-detail__note">
            {card.placement === 'stated'
              ? 'This is where the record sits on the map. It outranks where its capabilities and citing features are.'
              : card.stated.releaseId || card.stated.phaseId
                ? `Set the ${card.stated.releaseId ? 'stage' : 'release'} too — a cell is a release and a stage, so half a statement places nothing and the record stays where the sources put it.`
                : 'Set both to place this record by hand. That outranks where its capabilities and citing features are, and moves the card on the map.'}
          </p>
        </section>
      ) : null}

      <section className="mvp-detail__section">
        <h3 className="mvp-detail__section-title">
          PwC features citing this ({card.pwcFeatures.length})
        </h3>
        {card.pwcFeatures.length === 0 ? (
          <p className="mvp-detail__note">
            No PwC feature cites this record. It reaches the map from the{' '}
            {SOURCE_LABEL.sequencing} alone.
          </p>
        ) : (
          <ul className="mvp-detail__list">
            {card.pwcFeatures.map((feature) => (
              <li key={feature.id}>
                {onSelectFeature ? (
                  <button
                    type="button"
                    className="mvp-detail__feature"
                    onClick={() => onSelectFeature(feature.id)}
                  >
                    <span className="mvp-detail__feature-id">{feature.id}</span>
                    <span className="mvp-detail__feature-name">{feature.name}</span>
                    <span className="mvp-detail__feature-place">
                      {placeName(feature.releaseId, feature.phaseId)}
                    </span>
                  </button>
                ) : (
                  <span className="mvp-detail__feature">
                    <span className="mvp-detail__feature-id">{feature.id}</span>
                    <span className="mvp-detail__feature-name">{feature.name}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mvp-detail__section">
        <h3 className="mvp-detail__section-title">
          Capabilities ({card.capabilities.length})
        </h3>
        {card.capabilities.length === 0 ? (
          <p className="mvp-detail__note">
            This record owns no capability. Where a ref carries several records, the
            option-agnostic one owns them by rule (D-3).
          </p>
        ) : (
          <ul className="mvp-detail__list">
            {card.capabilities.map((capability) => (
              <li key={capability.id} className="mvp-detail__capability">
                {canEdit ? (
                  // Tapping the capability that is there opens the lookup,
                  // the same way the PwC panel does it. Opens only — every row
                  // points at the one editor, so toggling would mean tapping a
                  // second capability shut it.
                  <button
                    type="button"
                    className="mvp-detail__capability-button"
                    onClick={() => setEditorOpen(true)}
                    aria-expanded={editorOpen}
                    aria-controls={editorOpen ? 'mvp-capability-editor' : undefined}
                  >
                    {capability.text}
                  </button>
                ) : (
                  <span className="mvp-detail__capability-text">{capability.text}</span>
                )}
                <span className="mvp-detail__capability-meta">
                  {ACTOR_LABEL[capability.actor]}
                  {capability.releaseId && capability.phaseId
                    ? ` · ${placeName(capability.releaseId, capability.phaseId)}`
                    : ' · not placed'}
                  {capability.ownerAmbiguous ? ' · owner chosen by rule' : ''}
                </span>
              </li>
            ))}
          </ul>
        )}

        {canEdit && !editorOpen ? (
          <Button
            ref={triggerRef}
            variant="outline"
            size="sm"
            onClick={() => setEditorOpen(true)}
            aria-expanded={false}
          >
            {card.capabilities.length === 0 ? 'Assign capabilities' : 'Change capabilities'}
          </Button>
        ) : null}

        {onSetCapabilities && capabilityOptions && editorOpen ? (
          <>
            <LinkPicker
              id="mvp-capability-editor"
              legend={`Capabilities owned by ${label}`}
              options={capabilityOptions}
              selectedIds={ownedCapabilityIds}
              onChange={onSetCapabilities}
              searchLabel="Search capabilities by text or ref"
              autoFocus
            />
            {/* Unticking leaves a capability owned by nothing rather than
                moving it somewhere unasked — said plainly, because an
                unowned capability disappears from this view. */}
            <p className="mvp-detail__note">
              Unticking one leaves it with no MSD feature until another record
              claims it. It is not deleted.
            </p>
            <Button variant="outline" size="sm" onClick={() => setEditorOpen(false)}>
              Done
            </Button>
          </>
        ) : null}
      </section>
    </aside>
  )
}
