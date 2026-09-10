import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ConflictQueue } from '@/components/ConflictQueue'
import { Button } from '@/components/ui/button'
import { useResolveConflict } from '@/hooks/useEntityMutations'
import { useScope } from '@/hooks/useScope'
import { buildConflictModel, type ConflictRow } from '@/lib/scope-conflicts'
import { RESOLUTION_LABEL, RESOLUTION_STATES, type ResolutionState } from '@/lib/validators'

const STATE_PARAM = 'state'

/**
 * The work queue for the source disagreements — the questions neither
 * document can answer on its own (PRD §8.5).
 */
export default function Reconciliation() {
  const scope = useScope()
  const resolve = useResolveConflict()
  const [searchParams, setSearchParams] = useSearchParams()

  // Filter state lives in the URL, like every other view state (R-10.2).
  const stateFilter = searchParams.get(STATE_PARAM)

  const setStateFilter = (next: string | null) => {
    setSearchParams((current) => {
      const params = new URLSearchParams(current)
      if (next) params.set(STATE_PARAM, next)
      else params.delete(STATE_PARAM)
      return params
    })
  }

  const model = useMemo(
    () => (scope.data ? buildConflictModel(scope.data) : null),
    [scope.data],
  )

  const matches = (row: ConflictRow) =>
    !stateFilter || row.resolutionState === stateFilter

  const onResolve = (id: number, state: ResolutionState, note: string | null) =>
    resolve.mutateAsync({ id, state, note })

  if (scope.isPending) {
    return <p className="text-sm text-muted-foreground">Loading conflicts…</p>
  }

  if (scope.isError) {
    return (
      <div role="alert" className="flex flex-col items-start gap-2">
        <p className="text-sm text-destructive">{scope.error.message}</p>
        <Button variant="outline" size="sm" onClick={() => void scope.refetch()}>
          Try again
        </Button>
      </div>
    )
  }

  if (!model) return null

  // The rename that produced this release, if one did — without it a merged
  // release reads as source data and the disagreement disappears.
  const alias = scope.data?.releaseAliases.find(
    (a) => a.to === model.decompositionRelease?.releaseId,
  )

  const release = model.release.filter(matches)
  const phase = model.phase.filter(matches)
  const unmatched = model.unmatched.filter(matches)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Reconciliation</h1>
        <p className="text-sm text-muted-foreground">
          Where the mapping file and the sequencing table disagree. Both placements are kept —
          recording a decision here changes neither source.
        </p>
      </div>

      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
        <div className="flex gap-2">
          <dt>Release conflicts</dt>
          <dd className="font-medium text-foreground">{model.counts.release}</dd>
        </div>
        <div className="flex gap-2">
          <dt>Phase conflicts needing review</dt>
          <dd className="font-medium text-foreground">{model.counts.phase}</dd>
        </div>
        <div className="flex gap-2">
          <dt>Unmatched links</dt>
          <dd className="font-medium text-foreground">{model.counts.unmatched}</dd>
        </div>
        <div className="flex gap-2">
          <dt>Unreviewed</dt>
          <dd className="font-medium text-foreground">{model.counts.unreviewed}</dd>
        </div>
      </dl>

      {model.decomposition.length > 0 ? (
        <section
          className="flex flex-col gap-2 rounded-lg border border-border p-4"
          aria-labelledby="decomposition"
        >
          <h2 className="text-sm font-semibold" id="decomposition">
            {model.decompositionRelease?.label ?? 'This release'} decomposes across other
            releases
          </h2>
          <p className="text-sm text-muted-foreground">
            The mapping file files these features under one release, but the sequencing
            table schedules the capabilities they cite in several. The counts below are the
            capability links the table places somewhere else.
          </p>
          <ul className="flex flex-wrap gap-3 text-sm">
            {model.decomposition.map((entry) => (
              <li
                key={entry.releaseId}
                className="rounded-md border border-border px-3 py-2"
              >
                <span className="font-medium">{entry.label}</span>{' '}
                <span className="text-muted-foreground">
                  {entry.links} link{entry.links === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ul>
          {alias ? (
            <p className="text-xs text-muted-foreground">
              The mapping file calls this release {alias.from}; {alias.id} declares{' '}
              {alias.from} and the table&rsquo;s {alias.to} to be one release.
            </p>
          ) : null}
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Show</span>
        <Button
          variant={stateFilter === null ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStateFilter(null)}
        >
          All
        </Button>
        {RESOLUTION_STATES.map((state) => (
          <Button
            key={state}
            variant={stateFilter === state ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStateFilter(state)}
          >
            {RESOLUTION_LABEL[state]}
          </Button>
        ))}
      </div>

      <ConflictQueue
        title="Release conflicts"
        note="The feature ships in one release; the table delivers the capability in another."
        rows={release}
        featureSourceLabel="Mapping file — feature ships in"
        tableSourceLabel="Sequencing table — capability delivered in"
        onResolve={onResolve}
        emptyMessage="No release conflicts match this filter."
      />

      <ConflictQueue
        title="Phase conflicts"
        note={`${model.counts.phaseMerged} further phase disagreements are resolved by the canonical phase merge and are not listed — both sides mean the same phase.`}
        rows={phase}
        featureSourceLabel="Mapping file — feature sits in"
        tableSourceLabel="Sequencing table — capability placed in"
        onResolve={onResolve}
        emptyMessage="No phase conflicts match this filter."
      />

      <ConflictQueue
        title="Unmatched links"
        note="The mapping file cites text the table has no exact match for. Never merged on a prefix — a human confirms it."
        rows={unmatched}
        featureSourceLabel="Mapping file — cited by"
        tableSourceLabel="Sequencing table"
        onResolve={onResolve}
        emptyMessage="No unmatched links match this filter."
      />
    </div>
  )
}
