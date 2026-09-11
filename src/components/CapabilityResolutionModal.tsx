import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { DetailCapability, FeatureDetail } from '@/lib/feature-detail'
import { SOURCE_LABEL } from '@/lib/validators'

export type CapabilityResolutionModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  capability: DetailCapability
  detail: FeatureDetail
  releaseOptions: { value: string; label: string }[]
  phaseOptions: { value: string; label: string }[]
  /** Records that the capability's current placement stands. */
  onKeep: () => Promise<unknown>
  /** Moves the capability, for every feature citing it. */
  onMove: (releaseId: string, phaseId: string) => Promise<unknown>
}

type Choice = 'keep' | 'move'

/**
 * Resolving one capability's disagreement with its feature.
 *
 * Two ways out, which is what the disagreement actually offers: the
 * capability is where it should be and the feature can live with that, or it
 * is in the wrong place and should move.
 *
 * A capability has **one** placement shared by every feature citing it
 * (PRD §16 P-2), so a move is not local to this feature. The modal names the
 * others before the decision rather than reporting it afterwards.
 */
export function CapabilityResolutionModal({
  open,
  onOpenChange,
  capability,
  detail,
  releaseOptions,
  phaseOptions,
  onKeep,
  onMove,
}: CapabilityResolutionModalProps) {
  const [choice, setChoice] = useState<Choice>('keep')
  // Default the move target to the feature's own cell: the common case is
  // pulling the capability back to the feature that needs it.
  const [releaseId, setReleaseId] = useState(detail.releaseId)
  const [phaseId, setPhaseId] = useState(detail.phaseId)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const here = `${capability.releaseLabel ?? 'no release'} · ${
    capability.phaseName ?? 'no phase'
  }`

  const unchanged =
    releaseId === capability.releaseId && phaseId === capability.phaseId

  const confirm = async () => {
    setSaving(true)
    setError(null)
    try {
      if (choice === 'keep') await onKeep()
      else await onMove(releaseId, phaseId)
      onOpenChange(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save that decision.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="capability-resolve">
        <DialogHeader>
          <DialogTitle>Resolve this capability</DialogTitle>
          <DialogDescription>{capability.text}</DialogDescription>
        </DialogHeader>

        <dl className="capability-resolve__placements">
          <div>
            <dt>{SOURCE_LABEL.mapping}</dt>
            <dd>
              {detail.id} ships in {detail.releaseLabel} · {detail.phaseName}
            </dd>
          </div>
          <div>
            <dt>{SOURCE_LABEL.sequencing}</dt>
            <dd>delivers this capability in {here}</dd>
          </div>
        </dl>

        <fieldset className="capability-resolve__choices">
          <legend className="sr-only">How should this be resolved?</legend>

          <label className="capability-resolve__choice">
            <input
              type="radio"
              name="capability-resolution"
              value="keep"
              checked={choice === 'keep'}
              disabled={saving}
              onChange={() => setChoice('keep')}
            />
            <span>
              <span className="capability-resolve__choice-label">Keep it here</span>
              <span className="capability-resolve__choice-hint">
                Stays in {here}. The disagreement is recorded as decided and drops out
                of the unreviewed queue.
              </span>
            </span>
          </label>

          <label className="capability-resolve__choice">
            <input
              type="radio"
              name="capability-resolution"
              value="move"
              checked={choice === 'move'}
              disabled={saving}
              onChange={() => setChoice('move')}
            />
            <span>
              <span className="capability-resolve__choice-label">Move it to</span>
              <span className="capability-resolve__choice-hint">
                Changes where the capability sits. Conflicts are re-judged against the
                new placement.
              </span>
            </span>
          </label>

          <div className="capability-resolve__target" aria-hidden={choice !== 'move'}>
            <label className="capability-resolve__field">
              <span>Release</span>
              <select
                className="capability-resolve__select"
                value={releaseId}
                disabled={saving || choice !== 'move'}
                onChange={(event) => setReleaseId(event.target.value)}
              >
                {releaseOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="capability-resolve__field">
              <span>Phase</span>
              <select
                className="capability-resolve__select"
                value={phaseId}
                disabled={saving || choice !== 'move'}
                onChange={(event) => setPhaseId(event.target.value)}
              >
                {phaseOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>

        {choice === 'move' && capability.otherFeatures.length > 0 ? (
          <p className="capability-resolve__warning" role="status">
            This capability is also cited by{' '}
            {capability.otherFeatures.map((f) => f.id).join(', ')}. It has one placement,
            so moving it moves it for {capability.otherFeatures.length === 1 ? 'that' : 'those'}{' '}
            {capability.otherFeatures.length === 1 ? 'feature' : 'features'} too.
          </p>
        ) : null}

        {choice === 'move' && unchanged ? (
          <p className="capability-resolve__warning" role="status">
            That is where it already sits. Pick a different release or phase, or keep it
            here.
          </p>
        ) : null}

        {error ? (
          <p className="capability-resolve__error" role="alert">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={() => void confirm()} disabled={saving || (choice === 'move' && unchanged)}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
