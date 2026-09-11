import { CircleCheck, Filter } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { AssumptionList } from '@/components/AssumptionList'
import { InlineEditField } from '@/components/InlineEditField'
import { LinkPicker, type LinkOption } from '@/components/LinkPicker'
import { ConflictBadge } from '@/components/ConflictBadge'
import { HighlightText } from '@/components/ScopeSearch'
import { Button } from '@/components/ui/button'
import type { DetailCapability, FeatureDetail } from '@/lib/feature-detail'
import { RESOLUTION_LABEL, SOURCE_LABEL, type ResolutionState } from '@/lib/validators'
import { CapabilityResolutionModal } from '@/components/CapabilityResolutionModal'

const ACTOR_LABEL: Record<string, string> = {
  employer: 'Employer',
  staff: 'Staff',
  jobseeker: 'Jobseeker',
  system: 'System',
}

export type FeatureDetailPanelProps = {
  detail: FeatureDetail
  onClose: () => void
  /** Pivots the map to an MVP ref without closing the panel (R-8.16). */
  onPivotToMvp: (ref: number) => void
  onSelectFeature: (featureId: string) => void
  /** MVP refs currently pivoted to, so the chips can show as pressed. */
  activeMvpRefs: number[]
  /** Rejects with the server's message so the field can surface it. */
  onSaveField?: (patch: {
    name?: string
    foundational_build?: string
    release_id?: string
    phase_id?: string
  }) => Promise<unknown>
  onDelete?: (cascade: boolean) => Promise<unknown>
  onDirtyChange?: (dirty: boolean) => void
  /** The search term that led here, highlighted on arrival (R-8.13). */
  highlight?: string
  /** Release and phase choices, for editing the feature's placement. */
  releaseOptions?: { value: string; label: string }[]
  phaseOptions?: { value: string; label: string }[]
  /** Every MVP record and capability, for the link editors. */
  mvpOptions?: LinkOption[]
  capabilityOptions?: LinkOption[]
  onSetMvpLinks?: (mvpFeatureIds: number[]) => Promise<unknown>
  onSetCapabilityLinks?: (capabilityIds: number[]) => Promise<unknown>
  /** The feature's current link ids. */
  linkedMvpIds?: number[]
  linkedCapabilityIds?: number[]
  /**
   * Records that the capability's current placement stands, resolving the
   * link without moving anything (R-7.3). Omitted when read-only.
   */
  onKeepCapability?: (linkId: number, note: string | null) => Promise<unknown>
  /**
   * Moves a capability. One placement is shared by every feature citing it
   * (PRD §16 P-2), so this is not local to the open feature.
   */
  onMoveCapability?: (
    capabilityId: number,
    releaseId: string,
    phaseId: string,
  ) => Promise<unknown>
  /** Assumption editing, including explicit reordering (R-9.8). */
  onAddAssumption?: (text: string) => Promise<unknown>
  onEditAssumption?: (id: number, text: string) => Promise<unknown>
  onMoveAssumption?: (id: number, direction: 'up' | 'down') => Promise<unknown>
  onDeleteAssumption?: (id: number) => Promise<unknown>
}

export function FeatureDetailPanel({
  detail,
  onClose,
  onPivotToMvp,
  onSelectFeature,
  activeMvpRefs,
  onSaveField,
  onDelete,
  onDirtyChange,
  highlight = '',
  releaseOptions,
  phaseOptions,
  mvpOptions,
  capabilityOptions,
  onSetMvpLinks,
  onSetCapabilityLinks,
  linkedMvpIds = [],
  linkedCapabilityIds = [],
  onKeepCapability,
  onMoveCapability,
  onAddAssumption,
  onEditAssumption,
  onMoveAssumption,
  onDeleteAssumption,
}: FeatureDetailPanelProps) {
  const panelRef = useRef<HTMLElement>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  // A different feature arriving abandons any pending confirmation. Tracked
  // during render rather than in an effect.
  const [confirmingFor, setConfirmingFor] = useState(detail.id)
  // The lookups stay closed until the shown item is tapped, so the panel
  // reads as the feature rather than as two long checklists.
  const [mvpEditorOpen, setMvpEditorOpen] = useState(false)
  const [capabilityEditorOpen, setCapabilityEditorOpen] = useState(false)

  if (confirmingFor !== detail.id) {
    setConfirmingFor(detail.id)
    setConfirmingDelete(false)
    setDeleteError(null)
    setMvpEditorOpen(false)
    setCapabilityEditorOpen(false)
  }

  const canEditMvp = Boolean(onSetMvpLinks && mvpOptions)
  const canEditCapabilities = Boolean(onSetCapabilityLinks && capabilityOptions)

  const dependentTotal =
    detail.assumptions.length + detail.mvpFeatures.length + detail.capabilityCount

  const runDelete = async (cascade: boolean) => {
    if (!onDelete) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await onDelete(cascade)
    } catch (caught) {
      setDeleteError(
        caught instanceof Error ? caught.message : 'Could not delete that feature.',
      )
    } finally {
      setDeleting(false)
    }
  }

  // Escape closes, and the panel takes focus so it is keyboard reachable
  // without hunting for it (R-10.3, R-10.4).
  useEffect(() => {
    panelRef.current?.focus()
  }, [detail.id])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <section
      className="feature-detail"
      aria-labelledby="feature-detail-name"
      tabIndex={-1}
      ref={panelRef}
    >
      <div className="feature-detail__header">
        <div className="feature-detail__heading">
          <span className="feature-detail__id">{detail.id}</span>
          <h2 className="feature-detail__name" id="feature-detail-name">
            {detail.name}
          </h2>
          <span className="feature-detail__placement">
            {detail.releaseLabel} · {detail.phaseName} · epic {detail.epicRef}
          </span>
          {detail.sourcePhaseLabel && detail.sourcePhaseLabel !== detail.phaseName ? (
            <span className="feature-detail__placement">
              Source document filed this under “{detail.sourcePhaseLabel}”
            </span>
          ) : null}
        </div>
        <Button variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>

      {detail.overridden ? (
        <div className="feature-detail__section">
          <h3 className="feature-detail__section-title">Corrected source</h3>
          <p className="feature-detail__note">{detail.overrideRationale}</p>
        </div>
      ) : null}

      {onSaveField && releaseOptions && phaseOptions ? (
        <div className="feature-detail__section">
          <h3 className="feature-detail__section-title">Placement</h3>
          <InlineEditField
            label="Release"
            value={detail.releaseId}
            displayValue={detail.releaseLabel}
            options={releaseOptions}
            onSave={(release_id) => onSaveField({ release_id })}
            onDirtyChange={onDirtyChange}
          />
          <InlineEditField
            label="Phase"
            value={detail.phaseId}
            displayValue={`${detail.phaseName} · epic ${detail.epicRef}`}
            options={phaseOptions}
            onSave={(phase_id) => onSaveField({ phase_id })}
            onDirtyChange={onDirtyChange}
          />
        </div>
      ) : null}

      <div className="feature-detail__section">
        <h3 className="feature-detail__section-title">Name</h3>
        {onSaveField ? (
          <InlineEditField
            label="Name"
            value={detail.name}
            onSave={(name) => onSaveField({ name })}
            onDirtyChange={onDirtyChange}
          />
        ) : (
          <p className="feature-detail__prose">{detail.name}</p>
        )}
      </div>

      <div className="feature-detail__section">
        <h3 className="feature-detail__section-title">Included in foundational build</h3>
        {onSaveField ? (
          <InlineEditField
            label="Foundational build"
            value={detail.foundationalBuild}
            multiline
            onSave={(foundational_build) => onSaveField({ foundational_build })}
            onDirtyChange={onDirtyChange}
            highlight={highlight}
          />
        ) : (
          <p className="feature-detail__prose">
            <HighlightText text={detail.foundationalBuild} term={highlight} />
          </p>
        )}
      </div>

      <div className="feature-detail__section">
        <h3 className="feature-detail__section-title">
          Assumptions ({detail.assumptions.length})
        </h3>
        {onAddAssumption && onEditAssumption && onMoveAssumption && onDeleteAssumption ? (
          <AssumptionList
            assumptions={detail.assumptions}
            onAdd={onAddAssumption}
            onEdit={onEditAssumption}
            onMove={onMoveAssumption}
            onDelete={onDeleteAssumption}
            highlight={highlight}
          />
        ) : detail.assumptions.length === 0 ? (
          <p className="feature-detail__note">None recorded.</p>
        ) : (
          <ol className="feature-detail__list">
            {detail.assumptions.map((assumption) => (
              <li key={assumption.id}>
                <HighlightText text={assumption.text} term={highlight} />
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="feature-detail__section">
        <h3 className="feature-detail__section-title">
          MVP features ({detail.mvpFeatures.length})
        </h3>
        {detail.mvpFeatures.length === 0 ? (
          <p className="feature-detail__note">No MVP feature is mapped to this feature.</p>
        ) : (
          <ul className="feature-detail__chips">
            {detail.mvpFeatures.map((mvp) => {
              const pressed = activeMvpRefs.includes(mvp.ref)
              return (
                <li key={`${mvp.ref}-${mvp.scopeOption ?? 'bare'}`}>
                  <span className="feature-detail__chip-group">
                    {/* Tapping the item that is there opens the lookup. */}
                    <button
                      type="button"
                      className="feature-detail__chip"
                      onClick={
                        canEditMvp ? () => setMvpEditorOpen((open) => !open) : undefined
                      }
                      aria-expanded={canEditMvp ? mvpEditorOpen : undefined}
                      aria-controls={canEditMvp ? 'mvp-link-editor' : undefined}
                      title={mvp.title}
                    >
                      <span className="feature-detail__chip-ref">{mvp.ref}</span>
                      {mvp.scopeOption ? <span>Option {mvp.scopeOption}</span> : null}
                      <span>{mvp.title}</span>
                    </button>
                    {/* Pivot keeps its own control rather than sharing the tap
                        target with editing (R-8.16). */}
                    <button
                      type="button"
                      className="feature-detail__chip-action"
                      aria-pressed={pressed}
                      onClick={() => onPivotToMvp(mvp.ref)}
                      aria-label={`Filter the map to MVP feature ${mvp.ref}`}
                    >
                      <Filter aria-hidden="true" size={14} />
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>
        )}

        {canEditMvp && !mvpEditorOpen ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMvpEditorOpen(true)}
            aria-expanded={false}
            aria-controls="mvp-link-editor"
          >
            {detail.mvpFeatures.length === 0 ? 'Link an MVP feature' : 'Change MVP features'}
          </Button>
        ) : null}

        {onSetMvpLinks && mvpOptions && mvpEditorOpen ? (
          <>
            <LinkPicker
              id="mvp-link-editor"
              legend="Linked MVP features"
              options={mvpOptions}
              selectedIds={linkedMvpIds}
              onChange={onSetMvpLinks}
              searchLabel="Search MVP features by ref or title"
            />
            <Button variant="outline" size="sm" onClick={() => setMvpEditorOpen(false)}>
              Done
            </Button>
          </>
        ) : null}
      </div>

      <div className="feature-detail__section">
        <h3 className="feature-detail__section-title">
          Capabilities ({detail.capabilityCount})
        </h3>
        {detail.capabilityCount === 0 ? (
          <p className="feature-detail__note">
            {detail.capabilityNote
              ? `The ${SOURCE_LABEL.mapping} states: “${detail.capabilityNote}”.`
              : 'No capabilities are mapped to this feature.'}
          </p>
        ) : (
          detail.actorGroups.map((group) => (
            <div key={group.actor} className="feature-detail__actor-group">
              <h4 className="feature-detail__actor-name">
                {ACTOR_LABEL[group.actor]} ({group.capabilities.length})
              </h4>
              <ul className="feature-detail__plain-list">
                {group.capabilities.map((capability) => (
                  <li key={capability.id}>
                    <CapabilityRow
                      capability={capability}
                      detail={detail}
                      onOpenEditor={
                        canEditCapabilities
                          ? () => setCapabilityEditorOpen((open) => !open)
                          : undefined
                      }
                      editorOpen={capabilityEditorOpen}
                      onKeep={onKeepCapability}
                      onMove={onMoveCapability}
                      releaseOptions={releaseOptions}
                      phaseOptions={phaseOptions}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}

        {canEditCapabilities && !capabilityEditorOpen ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCapabilityEditorOpen(true)}
            aria-expanded={false}
            aria-controls="capability-link-editor"
          >
            {detail.capabilityCount === 0
              ? 'Assign capabilities'
              : 'Change assigned capabilities'}
          </Button>
        ) : null}

        {onSetCapabilityLinks && capabilityOptions && capabilityEditorOpen ? (
          <>
            <LinkPicker
              id="capability-link-editor"
              legend="Assigned capabilities"
              options={capabilityOptions}
              selectedIds={linkedCapabilityIds}
              onChange={onSetCapabilityLinks}
              searchLabel="Search capabilities by text or ref"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCapabilityEditorOpen(false)}
            >
              Done
            </Button>
          </>
        ) : null}
      </div>

      <div className="feature-detail__section">
        <h3 className="feature-detail__section-title">
          Connected features ({detail.connected.length})
        </h3>
        {detail.connected.length === 0 ? (
          <p className="feature-detail__note">
            No other feature maps to the same MVP feature.
          </p>
        ) : (
          <ul className="feature-detail__plain-list">
            {detail.connected.map((connection) => (
              <li key={connection.id}>
                <button
                  type="button"
                  className="feature-detail__connection"
                  onClick={() => onSelectFeature(connection.id)}
                >
                  <span className="feature-detail__connection-id">{connection.id}</span>
                  <span className="feature-detail__connection-name">
                    {connection.name}
                    <span className="feature-detail__capability-meta">
                      {' '}
                      · via {connection.sharedRefs.join(', ')} · {connection.releaseLabel}
                    </span>
                  </span>
                  {connection.crossesRelease ? (
                    <span className="feature-detail__crossing">crosses release</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {onDelete ? (
        <div className="feature-detail__section">
          <h3 className="feature-detail__section-title">Delete</h3>
          {!confirmingDelete ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmingDelete(true)}
            >
              Delete {detail.id}
            </Button>
          ) : (
            <div className="feature-detail__section">
              {/* States exactly what will be removed and how many (R-9.5). */}
              <p className="feature-detail__prose">
                Delete {detail.id}?{' '}
                {dependentTotal > 0
                  ? `This also removes ${detail.assumptions.length} assumption${
                      detail.assumptions.length === 1 ? '' : 's'
                    }, ${detail.mvpFeatures.length} MVP feature link${
                      detail.mvpFeatures.length === 1 ? '' : 's'
                    } and ${detail.capabilityCount} capability link${
                      detail.capabilityCount === 1 ? '' : 's'
                    }. The capabilities and MVP features themselves are kept — other features use them.`
                  : 'Nothing else references it.'}
              </p>
              {deleteError ? (
                <p role="alert" className="feature-detail__note">
                  {deleteError}
                </p>
              ) : null}
              <div className="feature-detail__actions">
                <Button
                  size="sm"
                  onClick={() => void runDelete(dependentTotal > 0)}
                  disabled={deleting}
                >
                  {deleting
                    ? 'Deleting…'
                    : dependentTotal > 0
                      ? 'Delete and remove those rows'
                      : `Delete ${detail.id}`}
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
            </div>
          )}
        </div>
      ) : null}
    </section>
  )
}

/**
 * Shows a capability with its own placement, and where that differs from the
 * feature's, both placements inline (R-8.15).
 */
function CapabilityRow({
  capability,
  detail,
  onOpenEditor,
  editorOpen,
  onKeep,
  onMove,
  releaseOptions,
  phaseOptions,
}: {
  capability: DetailCapability
  detail: FeatureDetail
  /** Tapping the capability that is there opens the lookup. */
  onOpenEditor?: () => void
  editorOpen?: boolean
  onKeep?: (linkId: number, note: string | null) => Promise<unknown>
  onMove?: (capabilityId: number, releaseId: string, phaseId: string) => Promise<unknown>
  releaseOptions?: { value: string; label: string }[]
  phaseOptions?: { value: string; label: string }[]
}) {
  const differs = capability.releaseDiffers || capability.phaseDiffers
  // Exactly what the reconciliation queue lists, so the same set of findings
  // is decidable in both places.
  // A phase conflict can only mean genuinely different phases now that both
  // documents' labels are canonicalised, so there is no merged case to skip.
  const resolvable =
    capability.releaseConflict || capability.phaseConflict || !capability.matched
  const canResolve = resolvable && onKeep !== undefined && onMove !== undefined
  /**
   * A decided conflict stops being reported as one. The callout exists to
   * put a question in front of someone; once it is answered, leaving it up
   * makes a reviewed row look identical to an open one, and the panel reads
   * as a list of problems that never shrinks. The decision is still one
   * click away, and the modal still states the disagreement in full.
   */
  const reviewed = resolvable && capability.resolutionState !== 'unreviewed'
  const [resolving, setResolving] = useState(false)

  return (
    <div className="feature-detail__capability">
      {onOpenEditor ? (
        <button
          type="button"
          className="feature-detail__capability-button"
          onClick={onOpenEditor}
          aria-expanded={editorOpen}
          aria-controls="capability-link-editor"
        >
          {capability.text}
        </button>
      ) : (
        <span className="feature-detail__capability-text">{capability.text}</span>
      )}
      <span className="feature-detail__capability-meta">
        {capability.matched
          ? `${capability.releaseLabel ?? 'no release'} · ${
              capability.phaseName ?? 'no phase'
            }`
          : `No exact match in the ${SOURCE_LABEL.sequencing}`}
        {capability.citations > 1 ? ` · cited ${capability.citations}×` : ''}
      </span>

      {differs && !reviewed ? (
        <div className="feature-detail__mismatch">
          {capability.releaseDiffers ? (
            <span>
              <span className="feature-detail__mismatch-label">Release differs:</span> the
              feature ships in {detail.releaseLabel}, the {SOURCE_LABEL.sequencing} delivers
              this capability in {capability.releaseLabel}.
            </span>
          ) : null}
          {capability.phaseDiffers ? (
            <span>
              <span className="feature-detail__mismatch-label">Phase differs:</span> the
              feature sits in {detail.phaseName}, the {SOURCE_LABEL.sequencing} places this
              capability in {capability.phaseName}.
            </span>
          ) : null}
        </div>
      ) : null}

      {!capability.matched && !reviewed ? (
        <div className="feature-detail__mismatch">
          <span>
            <span className="feature-detail__mismatch-label">Unmatched:</span> the{' '}
            {SOURCE_LABEL.mapping} cites this text, but the {SOURCE_LABEL.sequencing} has no
            exact match. Not merged on a prefix — a human confirms it.
          </span>
        </div>
      ) : null}

      {canResolve ? (
        <div
          className={`feature-detail__resolution${
            reviewed ? ' feature-detail__resolution--reviewed' : ''
          }`}
        >
          {reviewed ? (
            // Collapsed to a single control. Its accessible name carries the
            // decision in words, so the tick is never the only signal
            // (R-10.6), and `title` surfaces the same on hover.
            <button
              type="button"
              className="feature-detail__reviewed"
              onClick={() => setResolving(true)}
              title={`${RESOLUTION_LABEL[capability.resolutionState as ResolutionState]} — change this decision`}
              aria-label={`Reviewed: ${
                RESOLUTION_LABEL[capability.resolutionState as ResolutionState]
              }. Change the decision for ${capability.text}`}
            >
              <CircleCheck size={16} aria-hidden="true" />
            </button>
          ) : (
            <>
              <div className="feature-detail__resolution-head">
                <ConflictBadge
                  count={1}
                  state={capability.resolutionState as ResolutionState}
                  kind={capability.matched ? 'conflict' : 'unmatched'}
                />
              </div>
              <Button variant="outline" size="sm" onClick={() => setResolving(true)}>
                Resolve
              </Button>
            </>
          )}
          {resolving ? (
            <CapabilityResolutionModal
              open={resolving}
              onOpenChange={setResolving}
              capability={capability}
              detail={detail}
              releaseOptions={releaseOptions ?? []}
              phaseOptions={phaseOptions ?? []}
              // The note is not edited here, but it must survive: one may
              // have been written in the reconciliation queue.
              onKeep={() => onKeep!(capability.linkId, capability.resolutionNote)}
              onMove={(releaseId, phaseId) =>
                onMove!(capability.id, releaseId, phaseId)
              }
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}


