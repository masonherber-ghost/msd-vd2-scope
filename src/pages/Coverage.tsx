import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { useScope } from '@/hooks/useScope'
import { buildCoverage } from '@/lib/scope-coverage'

/** Where the scope is thin, duplicated or unusually coupled (PRD §8.6). */
export default function Coverage() {
  const scope = useScope()
  const model = useMemo(() => (scope.data ? buildCoverage(scope.data) : null), [scope.data])

  if (scope.isPending) {
    return <p className="text-sm text-muted-foreground">Loading coverage…</p>
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

  if (!model || !scope.data) return null

  const topCount = model.ranking[0]?.featureIds.length ?? 1

  return (
    <div className="coverage">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Coverage</h1>
        <p className="text-sm text-muted-foreground">
          Which MVP features carry the most scope, which cross a release boundary, and where
          the two documents leave gaps or say the same thing twice.
        </p>
      </div>

      <section className="coverage__section" aria-labelledby="ranking">
        <h2 className="coverage__title" id="ranking">
          MVP features by how many PwC features cite them ({model.ranking.length})
        </h2>
        <p className="coverage__note">
          A ref cited by several features is load-bearing: changing it moves more than one
          part of the plan.
        </p>
        <div className="coverage__scroll">
          <table className="coverage__table">
            <caption className="sr-only">MVP features ranked by citing features</caption>
            <thead>
              <tr>
                <th scope="col">Ref</th>
                <th scope="col">Cited by</th>
                <th scope="col">Features</th>
                <th scope="col">Capabilities</th>
                <th scope="col">Title</th>
              </tr>
            </thead>
            <tbody>
              {model.ranking.map((entry) => (
                <tr key={entry.ref}>
                  <td className="coverage__mono">{entry.ref}</td>
                  <td>
                    <span className="coverage__rank">
                      <span
                        className="coverage__rank-bar"
                        style={{
                          width: `${(entry.featureIds.length / topCount) * 3}rem`,
                        }}
                        aria-hidden="true"
                      />
                      <span className="coverage__mono">{entry.featureIds.length}</span>
                    </span>
                  </td>
                  <td className="coverage__mono coverage__muted">
                    {entry.featureIds.join(', ')}
                  </td>
                  <td className="coverage__mono">{entry.capabilityCount}</td>
                  <td className="coverage__muted">{entry.title}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="coverage__section" aria-labelledby="cross-release">
        <h2 className="coverage__title" id="cross-release">
          MVP features spanning more than one release ({model.crossRelease.length})
        </h2>
        <p className="coverage__note">
          These are the couplings that matter most to a delivery plan: one MVP feature is
          claimed by features shipping at different times.
        </p>
        {model.crossRelease.length === 0 ? (
          <p className="coverage__note">None — every MVP feature sits inside one release.</p>
        ) : (
          <ul className="coverage__list">
            {model.crossRelease.map((entry) => (
              <li key={entry.ref} className="coverage__chip">
                <span className="coverage__chip-label">
                  {entry.ref} · {entry.releaseIds.join(' + ')}
                </span>
                <span className="coverage__muted">{entry.featureIds.join(', ')}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="coverage__section" aria-labelledby="orphans">
        <h2 className="coverage__title" id="orphans">
          Orphans
        </h2>
        <p className="coverage__note">
          Gaps in both directions — scope that one document names and the other never
          reaches.
        </p>

        <h3 className="coverage__note">
          MVP features with no capabilities ({model.orphans.mvpWithoutCapabilities.length})
        </h3>
        <ul className="coverage__list">
          {model.orphans.mvpWithoutCapabilities.map((orphan) => (
            <li key={orphan.id} className="coverage__chip">
              <span className="coverage__chip-label">{orphan.label}</span>
              <span className="coverage__muted">{orphan.detail}</span>
            </li>
          ))}
        </ul>

        <h3 className="coverage__note">
          MVP features no PwC feature cites ({model.orphans.mvpWithoutFeature.length})
        </h3>
        <ul className="coverage__list">
          {model.orphans.mvpWithoutFeature.map((orphan) => (
            <li key={orphan.id} className="coverage__chip">
              <span className="coverage__chip-label">{orphan.label}</span>
              <span className="coverage__muted">{orphan.detail}</span>
            </li>
          ))}
        </ul>

        <h3 className="coverage__note">
          PwC features with no capabilities ({model.orphans.featuresWithoutCapabilities.length})
        </h3>
        <ul className="coverage__list">
          {model.orphans.featuresWithoutCapabilities.map((orphan) => (
            <li key={orphan.id} className="coverage__chip">
              <span className="coverage__chip-label">{orphan.label}</span>
              <span className="coverage__muted">{orphan.detail}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="coverage__section" aria-labelledby="per-release">
        <h2 className="coverage__title" id="per-release">
          Per release
        </h2>
        <div className="coverage__scroll">
          <table className="coverage__table">
            <caption className="sr-only">Counts and actor breakdown per release</caption>
            <thead>
              <tr>
                <th scope="col">Release</th>
                <th scope="col">Features</th>
                <th scope="col">Capabilities</th>
                <th scope="col">Actors</th>
              </tr>
            </thead>
            <tbody>
              {model.perRelease.map((row) => (
                <tr key={row.releaseId}>
                  <td className="coverage__mono">{row.label}</td>
                  <td className="coverage__mono">{row.features}</td>
                  <td className="coverage__mono">{row.capabilities}</td>
                  <td className="coverage__muted">
                    {row.actors.length === 0
                      ? '—'
                      : row.actors
                          .map((entry) => `${entry.actor} ${entry.count}`)
                          .join(' · ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="coverage__section" aria-labelledby="duplicates">
        <h2 className="coverage__title" id="duplicates">
          Near-duplicate capabilities ({model.nearDuplicates.length})
        </h2>
        <p className="coverage__note">
          Two capabilities under the same ref that probably say the same thing. Flagged for a
          human, never merged — if they are source duplication the capability count drops
          (D-4).
        </p>
        {model.nearDuplicates.length === 0 ? (
          <p className="coverage__note">None found.</p>
        ) : (
          <ul className="coverage__list" style={{ flexDirection: 'column' }}>
            {model.nearDuplicates.map((duplicate, index) => (
              <li key={`${duplicate.ref}-${index}`} className="coverage__duplicate">
                <span className="coverage__chip-label">{duplicate.ref}</span>
                <span className="coverage__duplicate-text">{duplicate.a}</span>
                <span className="coverage__duplicate-text">{duplicate.b}</span>
                <span className="coverage__duplicate-reason">
                  {duplicate.reason === 'prefix'
                    ? 'One contains the other — probably a truncation'
                    : `${Math.round(duplicate.similarity * 100)}% of the words are shared — probably a rewording`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
