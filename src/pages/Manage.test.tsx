import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScopeGraph } from '@/lib/api-client'

const { state } = await vi.hoisted(async () => ({
  state: {
    graph: null as ScopeGraph | null,
    writeFail: null as string | null,
    calls: [] as { kind: string; args: unknown[] }[],
  },
}))

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>()
  const record = (kind: string) =>
    async (...args: unknown[]) => {
      if (state.writeFail) throw new actual.ApiError(409, state.writeFail)
      state.calls.push({ kind, args })
      return {} as never
    }
  return {
    ...actual,
    apiClient: {
      scope: { get: async () => state.graph as ScopeGraph },
      releases: {
        create: record('releases.create'),
        update: record('releases.update'),
        remove: record('releases.remove'),
      },
      phases: {
        create: record('phases.create'),
        update: record('phases.update'),
        move: record('phases.move'),
        remove: record('phases.remove'),
      },
      mvpFeatures: {
        create: record('mvp.create'),
        update: record('mvp.update'),
        remove: record('mvp.remove'),
      },
      capabilities: {
        create: record('cap.create'),
        update: record('cap.update'),
        remove: record('cap.remove'),
      },
    },
  }
})

const { makeScopeGraph } = await import('@/test/scope-fixture')
const Manage = (await import('@/pages/Manage')).default

function renderManage(path = '/manage/releases') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/manage" element={<Manage />} />
          <Route path="/manage/:entity" element={<Manage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const called = (kind: string) => state.calls.filter((c) => c.kind === kind)

beforeEach(() => {
  state.graph = makeScopeGraph()
  state.writeFail = null
  state.calls = []
})

describe('Manage — navigation', () => {
  it('offers every bulk-editable entity', async () => {
    renderManage()
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())

    const nav = screen.getByRole('navigation', { name: 'Entities' })
    for (const label of ['Releases', 'Phases', 'MVP features', 'Capabilities']) {
      expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument()
    }
  })

  it('defaults to releases when no entity is named', async () => {
    renderManage('/manage')
    await waitFor(() =>
      expect(screen.getByRole('table', { name: /releases/i })).toBeInTheDocument(),
    )
  })

  it('says features and assumptions are edited on the map', async () => {
    renderManage()
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())
    expect(screen.getByText(/edited on the map itself/i)).toBeInTheDocument()
  })
})

describe('Manage — releases', () => {
  it('lists each release with how many features use it', async () => {
    renderManage('/manage/releases')
    await waitFor(() =>
      expect(screen.getByRole('table', { name: /releases/i })).toBeInTheDocument(),
    )
    const rows = screen.getAllByRole('row')
    // Header plus two releases.
    expect(rows).toHaveLength(3)
    expect(rows[1]).toHaveTextContent('Release 1.1')
    expect(rows[1]).toHaveTextContent('2')
  })

  it('saves a renamed release on blur', async () => {
    const user = userEvent.setup()
    renderManage('/manage/releases')
    await waitFor(() =>
      expect(screen.getByRole('table', { name: /releases/i })).toBeInTheDocument(),
    )

    const input = screen.getByLabelText('Name for Release 1.1')
    await user.clear(input)
    await user.type(input, 'Controlled Pilot')
    await user.tab()

    await waitFor(() => expect(called('releases.update')).toHaveLength(1))
    expect(called('releases.update')[0].args).toEqual(['1.1', { name: 'Controlled Pilot' }])
  })

  it('does not save when the value is unchanged', async () => {
    const user = userEvent.setup()
    renderManage('/manage/releases')
    await waitFor(() =>
      expect(screen.getByRole('table', { name: /releases/i })).toBeInTheDocument(),
    )

    await user.click(screen.getByLabelText('Name for Release 1.1'))
    await user.tab()

    expect(called('releases.update')).toHaveLength(0)
  })

  it('creates a release', async () => {
    const user = userEvent.setup()
    renderManage('/manage/releases')
    await waitFor(() =>
      expect(screen.getByRole('table', { name: /releases/i })).toBeInTheDocument(),
    )

    await user.type(screen.getByLabelText('New release id'), '2.1')
    await user.type(screen.getByLabelText('New release label'), 'Release 2.1')
    await user.click(screen.getByRole('button', { name: /add release/i }))

    await waitFor(() => expect(called('releases.create')).toHaveLength(1))
    expect(called('releases.create')[0].args[0]).toMatchObject({
      id: '2.1',
      label: 'Release 2.1',
    })
  })

  it("surfaces the server's refusal to delete", async () => {
    const user = userEvent.setup()
    state.writeFail = 'Cannot delete release 1.1 — 20 PwC features reference it.'
    renderManage('/manage/releases')
    await waitFor(() =>
      expect(screen.getByRole('table', { name: /releases/i })).toBeInTheDocument(),
    )

    await user.click(screen.getAllByRole('button', { name: /delete/i })[0])

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/Cannot delete release 1\.1/),
    )
  })
})

describe('Manage — phases reorder without drag (R-9.8)', () => {
  it('offers move-up and move-down on every phase', async () => {
    renderManage('/manage/phases')
    await waitFor(() =>
      expect(screen.getByRole('table', { name: /phases/i })).toBeInTheDocument(),
    )

    expect(
      screen.getByRole('button', { name: 'Move Access & Onboarding down' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Move Manage Vacancies up' }),
    ).toBeInTheDocument()
  })

  it('disables the controls at each end', async () => {
    renderManage('/manage/phases')
    await waitFor(() =>
      expect(screen.getByRole('table', { name: /phases/i })).toBeInTheDocument(),
    )

    expect(screen.getByRole('button', { name: 'Move Access & Onboarding up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Manage Vacancies down' })).toBeDisabled()
  })

  it('sends the move', async () => {
    const user = userEvent.setup()
    renderManage('/manage/phases')
    await waitFor(() =>
      expect(screen.getByRole('table', { name: /phases/i })).toBeInTheDocument(),
    )

    await user.click(screen.getByRole('button', { name: 'Move Manage Vacancies up' }))

    await waitFor(() => expect(called('phases.move')).toHaveLength(1))
    expect(called('phases.move')[0].args).toEqual(['manage-vacancies', 'up'])
  })

  it('shows the current order', async () => {
    renderManage('/manage/phases')
    await waitFor(() =>
      expect(screen.getByRole('table', { name: /phases/i })).toBeInTheDocument(),
    )
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('1')
    expect(rows[1]).toHaveTextContent('2')
  })
})

describe('Manage — MVP features', () => {
  it('shows ref and option separately, since both form the key', async () => {
    renderManage('/manage/mvp-features')
    await waitFor(() =>
      expect(screen.getByRole('table', { name: /MVP features/i })).toBeInTheDocument(),
    )
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('938')
    expect(rows).toHaveLength(3)
  })

  it('creates a record with no option', async () => {
    const user = userEvent.setup()
    renderManage('/manage/mvp-features')
    await waitFor(() =>
      expect(screen.getByRole('table', { name: /MVP features/i })).toBeInTheDocument(),
    )

    await user.type(screen.getByLabelText('New MVP ref'), '994')
    await user.type(screen.getByLabelText('New MVP title'), 'Something new')
    await user.click(screen.getByRole('button', { name: /add MVP feature/i }))

    await waitFor(() => expect(called('mvp.create')).toHaveLength(1))
    expect(called('mvp.create')[0].args[0]).toEqual({
      ref: 994,
      scope_option: null,
      title: 'Something new',
    })
  })

  it('creates a record with an option', async () => {
    const user = userEvent.setup()
    renderManage('/manage/mvp-features')
    await waitFor(() =>
      expect(screen.getByRole('table', { name: /MVP features/i })).toBeInTheDocument(),
    )

    await user.type(screen.getByLabelText('New MVP ref'), '951')
    await user.selectOptions(screen.getByLabelText('New MVP scope option'), '1B')
    await user.type(screen.getByLabelText('New MVP title'), 'Self-service')
    await user.click(screen.getByRole('button', { name: /add MVP feature/i }))

    await waitFor(() => expect(called('mvp.create')).toHaveLength(1))
    expect(called('mvp.create')[0].args[0]).toMatchObject({ ref: 951, scope_option: '1B' })
  })

  it('surfaces a duplicate rejection', async () => {
    const user = userEvent.setup()
    state.writeFail = 'MVP feature 951 Option 1A already exists.'
    renderManage('/manage/mvp-features')
    await waitFor(() =>
      expect(screen.getByRole('table', { name: /MVP features/i })).toBeInTheDocument(),
    )

    await user.type(screen.getByLabelText('New MVP ref'), '951')
    await user.type(screen.getByLabelText('New MVP title'), 'dup')
    await user.click(screen.getByRole('button', { name: /add MVP feature/i }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/already exists/),
    )
  })
})

describe('Manage — capabilities', () => {
  it('lists them with ref, actor and release', async () => {
    renderManage('/manage/capabilities')
    await waitFor(() =>
      expect(screen.getByRole('table', { name: /capabilities/i })).toBeInTheDocument(),
    )
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('938')
  })

  it('filters by text', async () => {
    const user = userEvent.setup()
    renderManage('/manage/capabilities')
    await waitFor(() =>
      expect(screen.getByRole('table', { name: /capabilities/i })).toBeInTheDocument(),
    )

    await user.type(screen.getByLabelText('Search capabilities'), 'Electronic')
    expect(screen.getAllByRole('row').slice(1)).toHaveLength(1)
  })

  it('changes an actor', async () => {
    const user = userEvent.setup()
    renderManage('/manage/capabilities')
    await waitFor(() =>
      expect(screen.getByRole('table', { name: /capabilities/i })).toBeInTheDocument(),
    )

    await user.selectOptions(screen.getByLabelText('Actor for capability 10'), 'system')

    await waitFor(() => expect(called('cap.update')).toHaveLength(1))
    expect(called('cap.update')[0].args).toEqual([10, { actor: 'system' }])
  })

  it('only offers the four known actors', async () => {
    renderManage('/manage/capabilities')
    await waitFor(() =>
      expect(screen.getByRole('table', { name: /capabilities/i })).toBeInTheDocument(),
    )
    const select = screen.getByLabelText('Actor for capability 10')
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'employer',
      'staff',
      'jobseeker',
      'system',
    ])
  })

  it('creates one with a release and phase', async () => {
    const user = userEvent.setup()
    renderManage('/manage/capabilities')
    await waitFor(() =>
      expect(screen.getByRole('table', { name: /capabilities/i })).toBeInTheDocument(),
    )

    await user.type(screen.getByLabelText('New capability ref'), '994')
    await user.type(screen.getByLabelText('New capability text'), 'Do a new thing')
    await user.selectOptions(screen.getByLabelText('New capability release'), '1.1')
    await user.selectOptions(
      screen.getByLabelText('New capability phase'),
      'manage-vacancies',
    )
    await user.click(screen.getByRole('button', { name: /add capability/i }))

    await waitFor(() => expect(called('cap.create')).toHaveLength(1))
    expect(called('cap.create')[0].args[0]).toEqual({
      mvp_ref: 994,
      text: 'Do a new thing',
      actor: 'employer',
      release_id: '1.1',
      phase_id: 'manage-vacancies',
    })
  })
})
