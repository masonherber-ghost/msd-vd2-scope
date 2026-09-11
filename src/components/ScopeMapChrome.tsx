import type { CSSProperties } from 'react'
import { ACTOR_ROWS, releaseTokenSuffix, type ViewMode } from '@/lib/scope-derive'
import type { ReleaseRow } from '@/lib/api-client'
import { SOURCE_LABEL } from '@/lib/validators'

const accent = (token: string) => ({ '--chip-accent': `var(${token})` }) as CSSProperties

const VIEW_TABS: { mode: ViewMode; label: string; lede: string }[] = [
  {
    mode: 'release',
    label: 'By PwC release',
    lede: 'the release they ship in',
  },
  {
    mode: 'actor',
    label: 'By actor',
    lede: 'who acts',
  },
  {
    mode: 'mvp',
    label: 'By MSD feature',
    lede: 'the release their capabilities are scheduled in',
  },
  {
    mode: 'capability',
    label: 'By capability',
    lede: 'the release the table delivers them in',
  },
]

export type ScopeMapChromeProps = {
  view: ViewMode
  onViewChange: (mode: ViewMode) => void
  releases: ReleaseRow[]
  featuresByRelease: Map<string, number>
  capabilitiesByRelease: Map<string, number>
  /** Releases currently filtered to, so a chip can read as pressed. */
  activeReleases: string[]
  onToggleRelease: (releaseId: string) => void
}

/** The framing the design puts around the grid: view tabs, release chips
 *  and the actor legend. */
export function ScopeMapChrome({
  view,
  onViewChange,
  releases,
  featuresByRelease,
  capabilitiesByRelease,
  activeReleases,
  onToggleRelease,
}: ScopeMapChromeProps) {
  return (
    <>
      <div className="scope-chrome__tabs" role="group" aria-label="Map view">
        {VIEW_TABS.map((tab) => (
          <button
            key={tab.mode}
            type="button"
            className="scope-chrome__tab"
            aria-pressed={view === tab.mode}
            onClick={() => onViewChange(tab.mode)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="scope-chrome__intro">
        <div>
          <span className="scope-chrome__eyebrow">Discovery artefact · Scope map</span>
          <h1 className="scope-chrome__title">VD2 release scope map</h1>
          <p className="scope-chrome__lede">
            {view === 'mvp'
              ? 'MSD features plotted across the seven canonical journey phases, each card naming the PwC features that cite it. '
              : view === 'capability'
                ? 'Capabilities plotted across the seven canonical journey phases, each card naming its actor, its MSD feature and the PwC features citing it. '
                : 'PwC features plotted across the seven canonical journey phases, each card naming the MVP features it cites. '}
            Rows group them by{' '}
            {VIEW_TABS.find((t) => t.mode === view)?.lede ?? 'the release they ship in'}. An
            empty cell is information: nothing in that phase lands there.
          </p>
        </div>

        <ul className="scope-chrome__chips" aria-label="Filter by release">
          {releases.map((release) => {
            const pressed = activeReleases.includes(release.id)
            return (
              <li key={release.id}>
                <button
                  type="button"
                  className="scope-chrome__chip"
                  style={accent(`--color-release-${releaseTokenSuffix(release.id)}`)}
                  aria-pressed={pressed}
                  onClick={() => onToggleRelease(release.id)}
                >
                  <span className="scope-chrome__chip-label">{release.label}</span>
                  <span className="scope-chrome__chip-count">
                    {featuresByRelease.get(release.id) ?? 0} features ·{' '}
                    {capabilitiesByRelease.get(release.id) ?? 0} capabilities
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <ul className="scope-chrome__legend" aria-label="Actors">
        <li className="scope-chrome__legend-title">Actors</li>
        {ACTOR_ROWS.filter((row) => row.key !== 'no-actor').map((row) => (
          <li key={row.key} className="scope-chrome__legend-item">
            <span
              className="scope-chrome__legend-dot"
              style={
                { '--legend-accent': `var(--color-actor-${row.tokenSuffix})` } as CSSProperties
              }
              aria-hidden="true"
            />
            <span className="scope-chrome__legend-name">{row.label}</span>
            <span className="scope-chrome__legend-note">{row.blurb}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

export type ReleaseHorizonsProps = {
  releases: ReleaseRow[]
  featuresByRelease: Map<string, number>
  capabilitiesByRelease: Map<string, number>
}

/** What each release adds — the design's closing section. */
export function ReleaseHorizons({
  releases,
  featuresByRelease,
  capabilitiesByRelease,
}: ReleaseHorizonsProps) {
  return (
    <section aria-labelledby="release-horizons">
      <h2 className="scope-chrome__section-title" id="release-horizons">
        Release horizons
      </h2>
      <p className="scope-chrome__lede" style={{ marginBottom: 'var(--spacing-6)' }}>
        What each release carries. Descriptions come from the {SOURCE_LABEL.mapping}; a
        release the {SOURCE_LABEL.sequencing} alone knows about has none.
      </p>
      <ul className="scope-chrome__horizons">
        {releases.map((release) => (
          <li
            key={release.id}
            className="scope-chrome__horizon"
            style={
              {
                '--horizon-accent': `var(--color-release-${releaseTokenSuffix(release.id)})`,
              } as CSSProperties
            }
          >
            <span className="scope-chrome__horizon-tag">
              {release.label} · {featuresByRelease.get(release.id) ?? 0} features ·{' '}
              {capabilitiesByRelease.get(release.id) ?? 0} capabilities
            </span>
            <span className="scope-chrome__horizon-name">
              {release.name || 'No name recorded'}
            </span>
            <span className="scope-chrome__horizon-desc">
              {release.description ||
                `This release appears only in the ${SOURCE_LABEL.sequencing}.`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
