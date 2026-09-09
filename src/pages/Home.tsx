import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useRunImport, useScope } from '@/hooks/useScope'

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  )
}

export default function Home() {
  const scope = useScope()
  const runImport = useRunImport()

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold tracking-tight">Scope map</h1>

      <Card>
        <CardHeader>
          <CardTitle>Imported scope</CardTitle>
          <CardDescription>
            The whole graph, read in one request. The map itself lands in Phase 3.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {scope.isPending ? (
            <p className="text-sm text-muted-foreground">Loading scope…</p>
          ) : scope.isError ? (
            <div role="alert" className="flex flex-col items-start gap-2">
              <p className="text-sm text-destructive">{scope.error.message}</p>
              <Button variant="outline" size="sm" onClick={() => void scope.refetch()}>
                Try again
              </Button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                <Stat label="Releases" value={scope.data.counts.releases} />
                <Stat label="Phases" value={scope.data.counts.phases} />
                <Stat label="PwC features" value={scope.data.counts.pwcFeatures} />
                <Stat label="Assumptions" value={scope.data.counts.assumptions} />
                <Stat label="MVP features" value={scope.data.counts.mvpFeatures} />
                <Stat label="Capabilities" value={scope.data.counts.capabilities} />
                <Stat label="Feature → MVP" value={scope.data.counts.featureMvpLinks} />
                <Stat
                  label="Feature → capability"
                  value={scope.data.counts.featureCapabilityCitations}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="destructive">
                  {scope.data.counts.releaseConflicts} release conflicts
                </Badge>
                <Badge variant="secondary">
                  {scope.data.counts.phaseConflicts} phase conflicts
                </Badge>
                <Badge variant="outline">
                  {scope.data.counts.unmatchedLinks} unmatched links
                </Badge>
                <Badge variant="outline">
                  {scope.data.counts.unresolvedConflicts} unreviewed
                </Badge>
              </div>
            </>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              onClick={() => runImport.mutate()}
              disabled={runImport.isPending}
            >
              {runImport.isPending ? 'Importing…' : 'Re-import from documents'}
            </Button>
            {runImport.isError ? (
              <p role="alert" className="text-sm text-destructive">
                {runImport.error.message}
              </p>
            ) : null}
            {runImport.isSuccess ? (
              <p className="text-sm text-muted-foreground">
                Imported {runImport.data.summary.featureCapabilityEdges} edges from{' '}
                {runImport.data.summary.featureCapabilityCitations} citations.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
