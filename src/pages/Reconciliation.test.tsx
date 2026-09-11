import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScopeGraph } from '@/lib/api-client'
import { DECOMPOSITION_RELEASE_ID } from '@/lib/scope-conflicts'

const { state } = await vi.hoisted(async () => ({
  state: {
    graph: null as ScopeGraph | null,
    writeFail: null as string | null,
    resolved: [] as { id: number; body: unknown }[],
  },
}))

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>()
  return {
    ...actual,
    apiClient: {
      scope: { get: async () => state.graph as ScopeGraph },
      conflicts: {
        resolve: async (id: number, body: unknown) => {
          if (state.writeFail) throw new actual.ApiError(409, state.writeFail)
          state.resolved.push({ id, body })
          // Mirror the write so a refetch shows the new state.
          state.graph = {
            ...(state.graph as ScopeGraph),
            featureCapabilityLinks: (state.graph as ScopeGraph).featureCapabilityLinks.map(
              (link) =>
                link.id === id
                  ? {
                      ...link,
                      ...(body as { resolution_state: string; resolution_note: string | null }),
                    }
                  : link,
            ),
          } as ScopeGraph
          return {} as never
        },
      },
    },
  }
})

const { makeScopeGraph } = await import('@/test/scope-fixture')
const Reconciliation = (await import('@/pages/Reconciliation')).default

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="url">{location.search}</output>
}

function renderPage(path = '/reconciliation') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/reconciliation"
            element={
              <>
                <Reconciliation />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const url = () => screen.getByTestId('url').textContent ?? ''
const queue = (name: RegExp) => screen.getByRole('region', { name })

beforeEach(() => {
  state.graph = makeScopeGraph()
  state.writeFail = null
  state.resolved = []
})

describe('Reconciliation — grouping', () => {
  it('groups conflicts by type', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /^Release conflicts/ })).toBeInTheDocument(),
    )
    expect(screen.getByRole('heading', { name: /^Phase conflicts/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^Unmatched links/ })).toBeInTheDocument()
  })

  it('shows both placements side by side (R-7.1)', async () => {
    renderPage()
    await waitFor(() => expect(queue(/^Release conflicts/)).toBeInTheDocument())

    const row = within(queue(/^Release conflicts/)).getByRole('article', {
      name: /F-002 — Electronic T&Cs acceptance/,
    })
    expect(row).toHaveTextContent('PwC features sequencing — feature ships in')
    expect(row).toHaveTextContent('Release 1.1')
    expect(row).toHaveTextContent('MSD features sequencing — capability delivered in')
    expect(row).toHaveTextContent('Release 1.4')
  })

  it('explains the phase disagreements the canonical merge already settles', async () => {
    renderPage()
    await waitFor(() => expect(queue(/^Phase conflicts/)).toBeInTheDocument())
    expect(queue(/^Phase conflicts/)).toHaveTextContent(
      /1 further phase disagreements are resolved by the canonical phase merge/,
    )
  })

  it('lists the unmatched link rather than merging it', async () => {
    renderPage()
    await waitFor(() => expect(queue(/^Unmatched links/)).toBeInTheDocument())
    expect(queue(/^Unmatched links/)).toHaveTextContent('no exact match in the table')
    expect(queue(/^Unmatched links/)).toHaveTextContent(/never merged on a prefix/i)
  })
})

describe('Reconciliation — resolving (R-7.2, R-7.3)', () => {
  it('offers every resolution state', async () => {
    renderPage()
    await waitFor(() => expect(queue(/^Release conflicts/)).toBeInTheDocument())

    const select = within(queue(/^Release conflicts/)).getByLabelText(
      /Resolution for F-002/,
    )
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Unreviewed',
      'PwC features sequencing is right',
      'MSD features sequencing is right',
      'Both are correct',
      'Defect raised',
    ])
  })

  it('sends the decision without leaving the list', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(queue(/^Release conflicts/)).toBeInTheDocument())

    await user.selectOptions(
      within(queue(/^Release conflicts/)).getByLabelText(/Resolution for F-002/),
      'defect_raised',
    )

    await waitFor(() => expect(state.resolved).toHaveLength(1))
    expect(state.resolved[0]).toEqual({
      id: 102,
      body: { resolution_state: 'defect_raised', resolution_note: null },
    })
    // Still on the same page.
    expect(screen.getByRole('heading', { name: /^Release conflicts/ })).toBeInTheDocument()
  })

  it('saves a note against the decision', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(queue(/^Release conflicts/)).toBeInTheDocument())

    const note = within(queue(/^Release conflicts/)).getByLabelText(/Note for F-002/)
    await user.type(note, 'Raised with the programme')
    await user.tab()

    await waitFor(() => expect(state.resolved).toHaveLength(1))
    expect(state.resolved[0].body).toMatchObject({
      resolution_note: 'Raised with the programme',
    })
  })

  it("surfaces the server's message when a decision is rejected", async () => {
    const user = userEvent.setup()
    state.writeFail = 'There is no conflict 102.'
    renderPage()
    await waitFor(() => expect(queue(/^Release conflicts/)).toBeInTheDocument())

    await user.selectOptions(
      within(queue(/^Release conflicts/)).getByLabelText(/Resolution for F-002/),
      'table_wins',
    )

    await waitFor(() =>
      expect(screen.getAllByRole('alert')[0]).toHaveTextContent('There is no conflict 102.'),
    )
  })
})

describe('Reconciliation — filtering by state', () => {
  it('puts the filter in the URL', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(queue(/^Release conflicts/)).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Defect raised' }))
    await waitFor(() => expect(url()).toContain('state=defect_raised'))
  })

  it('shrinks the unreviewed list as work happens', async () => {
    renderPage('/reconciliation?state=unreviewed')
    await waitFor(() => expect(queue(/^Release conflicts/)).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Release conflicts (1)' })).toBeInTheDocument()

    // The same link is resolved, so it drops out of the unreviewed filter.
    state.graph = makeScopeGraph({
      featureCapabilityLinks: (state.graph as ScopeGraph).featureCapabilityLinks.map(
        (link) =>
          link.id === 102 ? { ...link, resolution_state: 'table_wins' as const } : link,
      ),
    })

    renderPage('/reconciliation?state=unreviewed')
    await waitFor(() =>
      expect(screen.getAllByRole('heading', { name: 'Release conflicts (0)' })[0]).toBeInTheDocument(),
    )
  })

  it('says so when a filter matches nothing, rather than showing a bare list', async () => {
    renderPage('/reconciliation?state=defect_raised')
    await waitFor(() => expect(queue(/^Release conflicts/)).toBeInTheDocument())
    expect(screen.getByText('No release conflicts match this filter.')).toBeInTheDocument()
  })
})

describe('Reconciliation — release decomposition (D-1)', () => {
  it('is hidden when nothing sits in the decomposed release', async () => {
    renderPage()
    await waitFor(() => expect(queue(/^Release conflicts/)).toBeInTheDocument())
    expect(screen.queryByRole('region', { name: /decomposes/i })).not.toBeInTheDocument()
  })

  it('shows where the table actually schedules that release\u2019s capabilities', async () => {
    const base = makeScopeGraph()
    state.graph = {
      ...base,
      pwcFeatures: base.pwcFeatures.map((f) =>
        f.id === 'F-002' ? { ...f, release_id: DECOMPOSITION_RELEASE_ID } : f,
      ),
      capabilities: base.capabilities.map((c) =>
        c.id === 12 ? { ...c, release_id: '1.1' } : c,
      ),
    }

    renderPage()
    await waitFor(() =>
      expect(screen.getByRole('region', { name: /decomposes/i })).toBeInTheDocument(),
    )
    const section = screen.getByRole('region', { name: /decomposes/i })
    // Named for the release it decomposes, and counting where the table puts it.
    expect(section).toHaveTextContent('Release 1.4')
    expect(section).toHaveTextContent('Release 1.1')
    expect(section).toHaveTextContent('1 link')
  })
})
