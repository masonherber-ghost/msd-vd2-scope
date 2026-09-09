import { useState } from 'react'
import { NavLink, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  useCreateCapability,
  useCreateMvpFeature,
  useCreatePhase,
  useCreateRelease,
  useDeleteCapability,
  useDeleteMvpFeature,
  useDeletePhase,
  useDeleteRelease,
  useMovePhase,
  useUpdateCapability,
  useUpdateMvpFeature,
  useUpdatePhase,
  useUpdateRelease,
} from '@/hooks/useEntityMutations'
import { useScope } from '@/hooks/useScope'

const ENTITIES = [
  { slug: 'releases', label: 'Releases' },
  { slug: 'phases', label: 'Phases' },
  { slug: 'mvp-features', label: 'MVP features' },
  { slug: 'capabilities', label: 'Capabilities' },
] as const

type EntitySlug = (typeof ENTITIES)[number]['slug']

/**
 * Bulk editing for the entities with no natural home on the map (R-9.2).
 * Features and assumptions are edited in the detail panel, in context.
 */
export default function Manage() {
  const { entity } = useParams<{ entity: string }>()
  const scope = useScope()
  const slug = (ENTITIES.find((e) => e.slug === entity)?.slug ?? 'releases') as EntitySlug

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Manage</h1>
        <p className="text-sm text-muted-foreground">
          Bulk editing for entities that have no single place on the map. Features and their
          assumptions are edited on the map itself.
        </p>
      </div>

      <nav aria-label="Entities" className="flex flex-wrap gap-2">
        {ENTITIES.map((item) => (
          <NavLink
            key={item.slug}
            to={`/manage/${item.slug}`}
            className={({ isActive }) =>
              [
                'rounded-md border border-border px-3 py-2 text-sm',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-accent hover:text-accent-foreground',
              ].join(' ')
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      {scope.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : scope.isError ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="text-sm text-destructive">{scope.error.message}</p>
          <Button variant="outline" size="sm" onClick={() => void scope.refetch()}>
            Try again
          </Button>
        </div>
      ) : slug === 'releases' ? (
        <Releases scope={scope.data} />
      ) : slug === 'phases' ? (
        <Phases scope={scope.data} />
      ) : slug === 'mvp-features' ? (
        <MvpFeatures scope={scope.data} />
      ) : (
        <Capabilities scope={scope.data} />
      )}
    </div>
  )
}

type Scope = NonNullable<ReturnType<typeof useScope>['data']>

/** Shared error surface: every write reports the server's own message. */
function useWriteError() {
  const [error, setError] = useState<string | null>(null)
  const run = async (action: () => Promise<unknown>) => {
    setError(null)
    try {
      await action()
      return true
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save that change.')
      return false
    }
  }
  return { error, run }
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <p role="alert" className="manage-table__error">
      {error}
    </p>
  )
}

// ---------------------------------------------------------------------------

function Releases({ scope }: { scope: Scope }) {
  const create = useCreateRelease()
  const update = useUpdateRelease()
  const remove = useDeleteRelease()
  const { error, run } = useWriteError()
  const [draft, setDraft] = useState({ id: '', label: '', name: '' })

  const featureCount = (id: string) =>
    scope.pwcFeatures.filter((f) => f.release_id === id).length

  return (
    <div className="manage-table">
      <ErrorLine error={error} />

      <div className="manage-table__scroll">
        <table className="manage-table__grid">
          <caption className="sr-only">Releases</caption>
          <thead>
            <tr>
              <th scope="col">Id</th>
              <th scope="col">Label</th>
              <th scope="col">Name</th>
              <th scope="col">Features</th>
              <th scope="col">Source</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {scope.releases.map((release) => (
              <tr key={release.id}>
                <td className="manage-table__mono">{release.id}</td>
                <td>{release.label}</td>
                <td>
                  <input
                    className="manage-table__input"
                    aria-label={`Name for ${release.label}`}
                    defaultValue={release.name}
                    onBlur={(event) => {
                      if (event.target.value === release.name) return
                      void run(() =>
                        update.mutateAsync({
                          id: release.id,
                          patch: { name: event.target.value },
                        }),
                      )
                    }}
                  />
                </td>
                <td className="manage-table__mono">{featureCount(release.id)}</td>
                <td className="manage-table__muted">{release.source}</td>
                <td>
                  <div className="manage-table__actions">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void run(() => remove.mutateAsync(release.id))}
                    >
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="manage-table__create">
        <h2 className="text-sm font-semibold">Add a release</h2>
        <div className="manage-table__create-fields">
          <input
            className="manage-table__input"
            aria-label="New release id"
            placeholder="2.1"
            value={draft.id}
            onChange={(event) => setDraft({ ...draft, id: event.target.value })}
          />
          <input
            className="manage-table__input"
            aria-label="New release label"
            placeholder="Release 2.1"
            value={draft.label}
            onChange={(event) => setDraft({ ...draft, label: event.target.value })}
          />
          <input
            className="manage-table__input"
            aria-label="New release name"
            placeholder="Name"
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </div>
        <Button
          size="sm"
          onClick={async () => {
            const ok = await run(() =>
              create.mutateAsync({ ...draft, description: '' }),
            )
            if (ok) setDraft({ id: '', label: '', name: '' })
          }}
        >
          Add release
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function Phases({ scope }: { scope: Scope }) {
  const create = useCreatePhase()
  const update = useUpdatePhase()
  const move = useMovePhase()
  const remove = useDeletePhase()
  const { error, run } = useWriteError()
  const [draft, setDraft] = useState({ id: '', name: '', epic_ref: '' })

  const featureCount = (id: string) =>
    scope.pwcFeatures.filter((f) => f.phase_id === id).length

  return (
    <div className="manage-table">
      <ErrorLine error={error} />

      <div className="manage-table__scroll">
        <table className="manage-table__grid">
          <caption className="sr-only">Phases</caption>
          <thead>
            <tr>
              <th scope="col">Order</th>
              <th scope="col">Name</th>
              <th scope="col">Epic</th>
              <th scope="col">Features</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {scope.phases.map((phase, index) => (
              <tr key={phase.id}>
                <td className="manage-table__mono">{phase.display_order}</td>
                <td>
                  <input
                    className="manage-table__input"
                    aria-label={`Name for ${phase.name}`}
                    defaultValue={phase.name}
                    onBlur={(event) => {
                      if (event.target.value === phase.name) return
                      void run(() =>
                        update.mutateAsync({
                          id: phase.id,
                          patch: { name: event.target.value },
                        }),
                      )
                    }}
                  />
                </td>
                <td>
                  <input
                    className="manage-table__input"
                    aria-label={`Epic ref for ${phase.name}`}
                    defaultValue={phase.epic_ref}
                    onBlur={(event) => {
                      if (event.target.value === phase.epic_ref) return
                      void run(() =>
                        update.mutateAsync({
                          id: phase.id,
                          patch: { epic_ref: event.target.value },
                        }),
                      )
                    }}
                  />
                </td>
                <td className="manage-table__mono">{featureCount(phase.id)}</td>
                <td>
                  {/* Explicit move controls, never drag-only (R-9.8). */}
                  <div className="manage-table__actions">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={index === 0}
                      aria-label={`Move ${phase.name} up`}
                      onClick={() =>
                        void run(() => move.mutateAsync({ id: phase.id, direction: 'up' }))
                      }
                    >
                      ↑
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={index === scope.phases.length - 1}
                      aria-label={`Move ${phase.name} down`}
                      onClick={() =>
                        void run(() => move.mutateAsync({ id: phase.id, direction: 'down' }))
                      }
                    >
                      ↓
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void run(() => remove.mutateAsync(phase.id))}
                    >
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="manage-table__create">
        <h2 className="text-sm font-semibold">Add a phase</h2>
        <div className="manage-table__create-fields">
          <input
            className="manage-table__input"
            aria-label="New phase id"
            placeholder="new-phase"
            value={draft.id}
            onChange={(event) => setDraft({ ...draft, id: event.target.value })}
          />
          <input
            className="manage-table__input"
            aria-label="New phase name"
            placeholder="New Phase"
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
          <input
            className="manage-table__input"
            aria-label="New phase epic ref"
            placeholder="200"
            value={draft.epic_ref}
            onChange={(event) => setDraft({ ...draft, epic_ref: event.target.value })}
          />
        </div>
        <Button
          size="sm"
          onClick={async () => {
            const ok = await run(() =>
              create.mutateAsync({ ...draft, epic_description: '' }),
            )
            if (ok) setDraft({ id: '', name: '', epic_ref: '' })
          }}
        >
          Add phase
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function MvpFeatures({ scope }: { scope: Scope }) {
  const create = useCreateMvpFeature()
  const update = useUpdateMvpFeature()
  const remove = useDeleteMvpFeature()
  const { error, run } = useWriteError()
  const [draft, setDraft] = useState<{
    ref: string
    scope_option: '' | '1A' | '1B'
    title: string
  }>({ ref: '', scope_option: '', title: '' })

  const linkCount = (id: number) =>
    scope.featureMvpLinks.filter((l) => l.mvp_feature_id === id).length

  return (
    <div className="manage-table">
      <ErrorLine error={error} />

      <div className="manage-table__scroll">
        <table className="manage-table__grid">
          <caption className="sr-only">MVP features</caption>
          <thead>
            <tr>
              <th scope="col">Ref</th>
              <th scope="col">Option</th>
              <th scope="col">Title</th>
              <th scope="col">Features</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {scope.mvpFeatures.map((mvp) => (
              <tr key={mvp.id}>
                <td className="manage-table__mono">{mvp.ref}</td>
                <td className="manage-table__mono">{mvp.scope_option ?? '—'}</td>
                <td>
                  <input
                    className="manage-table__input"
                    aria-label={`Title for MVP ${mvp.ref}${
                      mvp.scope_option ? ` Option ${mvp.scope_option}` : ''
                    }`}
                    defaultValue={mvp.title}
                    onBlur={(event) => {
                      if (event.target.value === mvp.title) return
                      void run(() =>
                        update.mutateAsync({
                          id: mvp.id,
                          patch: { title: event.target.value },
                        }),
                      )
                    }}
                  />
                </td>
                <td className="manage-table__mono">{linkCount(mvp.id)}</td>
                <td>
                  <div className="manage-table__actions">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void run(() => remove.mutateAsync(mvp.id))}
                    >
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="manage-table__create">
        <h2 className="text-sm font-semibold">Add an MVP feature</h2>
        <p className="manage-table__muted text-xs">
          Uniqueness is on ref plus option, so the same ref with a different option is a
          separate record.
        </p>
        <div className="manage-table__create-fields">
          <input
            className="manage-table__input"
            aria-label="New MVP ref"
            placeholder="994"
            value={draft.ref}
            onChange={(event) => setDraft({ ...draft, ref: event.target.value })}
          />
          <select
            className="manage-table__input"
            aria-label="New MVP scope option"
            value={draft.scope_option}
            onChange={(event) =>
              setDraft({
                ...draft,
                scope_option: event.target.value as '' | '1A' | '1B',
              })
            }
          >
            <option value="">No option</option>
            <option value="1A">Option 1A</option>
            <option value="1B">Option 1B</option>
          </select>
          <input
            className="manage-table__input"
            aria-label="New MVP title"
            placeholder="Title"
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          />
        </div>
        <Button
          size="sm"
          onClick={async () => {
            const ok = await run(() =>
              create.mutateAsync({
                ref: Number(draft.ref),
                scope_option: draft.scope_option === '' ? null : draft.scope_option,
                title: draft.title,
              }),
            )
            if (ok) setDraft({ ref: '', scope_option: '', title: '' })
          }}
        >
          Add MVP feature
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

const ACTORS = ['employer', 'staff', 'jobseeker', 'system'] as const

function Capabilities({ scope }: { scope: Scope }) {
  const create = useCreateCapability()
  const update = useUpdateCapability()
  const remove = useDeleteCapability()
  const { error, run } = useWriteError()
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState({
    mvp_ref: '',
    text: '',
    actor: 'employer' as (typeof ACTORS)[number],
    release_id: '',
    phase_id: '',
  })

  const visible = scope.capabilities.filter((capability) => {
    const needle = query.trim().toLowerCase()
    if (!needle) return true
    return (
      capability.text.toLowerCase().includes(needle) ||
      String(capability.mvp_ref).includes(needle)
    )
  })

  return (
    <div className="manage-table">
      <ErrorLine error={error} />

      <label className="sr-only" htmlFor="capability-filter">
        Search capabilities
      </label>
      <input
        id="capability-filter"
        type="search"
        className="manage-table__input"
        placeholder="Search capabilities by text or ref"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      <div className="manage-table__scroll">
        <table className="manage-table__grid">
          <caption className="sr-only">Capabilities</caption>
          <thead>
            <tr>
              <th scope="col">Ref</th>
              <th scope="col">Text</th>
              <th scope="col">Actor</th>
              <th scope="col">Release</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((capability) => (
              <tr key={capability.id}>
                <td className="manage-table__mono">{capability.mvp_ref}</td>
                <td>
                  <input
                    className="manage-table__input"
                    aria-label={`Text for capability ${capability.id}`}
                    defaultValue={capability.text}
                    onBlur={(event) => {
                      if (event.target.value === capability.text) return
                      void run(() =>
                        update.mutateAsync({
                          id: capability.id,
                          patch: { text: event.target.value },
                        }),
                      )
                    }}
                  />
                </td>
                <td>
                  <select
                    className="manage-table__input"
                    aria-label={`Actor for capability ${capability.id}`}
                    value={capability.actor}
                    onChange={(event) =>
                      void run(() =>
                        update.mutateAsync({
                          id: capability.id,
                          patch: {
                            actor: event.target.value as (typeof ACTORS)[number],
                          },
                        }),
                      )
                    }
                  >
                    {ACTORS.map((actor) => (
                      <option key={actor} value={actor}>
                        {actor}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="manage-table__mono">{capability.release_id ?? '—'}</td>
                <td>
                  <div className="manage-table__actions">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void run(() => remove.mutateAsync(capability.id))}
                    >
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="manage-table__create">
        <h2 className="text-sm font-semibold">Add a capability</h2>
        <div className="manage-table__create-fields">
          <input
            className="manage-table__input"
            aria-label="New capability ref"
            placeholder="994"
            value={draft.mvp_ref}
            onChange={(event) => setDraft({ ...draft, mvp_ref: event.target.value })}
          />
          <input
            className="manage-table__input"
            aria-label="New capability text"
            placeholder="What the actor can do"
            value={draft.text}
            onChange={(event) => setDraft({ ...draft, text: event.target.value })}
          />
          <select
            className="manage-table__input"
            aria-label="New capability actor"
            value={draft.actor}
            onChange={(event) =>
              setDraft({ ...draft, actor: event.target.value as (typeof ACTORS)[number] })
            }
          >
            {ACTORS.map((actor) => (
              <option key={actor} value={actor}>
                {actor}
              </option>
            ))}
          </select>
          <select
            className="manage-table__input"
            aria-label="New capability release"
            value={draft.release_id}
            onChange={(event) => setDraft({ ...draft, release_id: event.target.value })}
          >
            <option value="">Choose a release</option>
            {scope.releases.map((release) => (
              <option key={release.id} value={release.id}>
                {release.label}
              </option>
            ))}
          </select>
          <select
            className="manage-table__input"
            aria-label="New capability phase"
            value={draft.phase_id}
            onChange={(event) => setDraft({ ...draft, phase_id: event.target.value })}
          >
            <option value="">Choose a phase</option>
            {scope.phases.map((phase) => (
              <option key={phase.id} value={phase.id}>
                {phase.name}
              </option>
            ))}
          </select>
        </div>
        <Button
          size="sm"
          onClick={async () => {
            const ok = await run(() =>
              create.mutateAsync({ ...draft, mvp_ref: Number(draft.mvp_ref) }),
            )
            if (ok) setDraft({ ...draft, mvp_ref: '', text: '' })
          }}
        >
          Add capability
        </Button>
      </div>
    </div>
  )
}
