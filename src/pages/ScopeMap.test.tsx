import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScopeGraph } from '@/lib/api-client'

const { state } = await vi.hoisted(async () => ({
  state: {
    graph: null as ScopeGraph | null,
    fail: null as string | null,
    /** Makes the next feature write fail, as a rejecting server would. */
    writeFail: null as string | null,
    nextId: 'F-004',
    created: [] as unknown[],
    patched: [] as unknown[],
    deleted: [] as unknown[],
    mvpLinkCalls: [] as { id: string; mvpFeatureIds: number[] }[],
    capabilityLinkCalls: [] as { id: string; capabilityIds: number[] }[],
    resolved: [] as { id: number; body: unknown }[],
  },
}))

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>()
  const failWrite = () => {
    if (state.writeFail) throw new actual.ApiError(409, state.writeFail)
  }
  return {
    ...actual,
    apiClient: {
      scope: {
        get: async () => {
          if (state.fail) throw new actual.ApiError(0, state.fail)
          return state.graph as ScopeGraph
        },
      },
      import: { run: async () => ({ status: 'ok', summary: {} as never }) },
      features: {
        nextId: async () => ({ id: state.nextId }),
        create: async (body: Record<string, unknown>) => {
          failWrite()
          state.created.push(body)
          return { ...body, source: 'manual' }
        },
        update: async (id: string, patch: Record<string, unknown>) => {
          failWrite()
          state.patched.push({ id, patch })
          return { id, ...patch, source: 'manual' }
        },
        setMvpLinks: async (id: string, mvpFeatureIds: number[]) => {
          failWrite()
          state.mvpLinkCalls.push({ id, mvpFeatureIds })
          return { pwc_feature_id: id, mvpFeatureIds }
        },
        setCapabilityLinks: async (id: string, capabilityIds: number[]) => {
          failWrite()
          state.capabilityLinkCalls.push({ id, capabilityIds })
          return { pwc_feature_id: id, capabilityIds }
        },
        remove: async (id: string, cascade: boolean) => {
          failWrite()
          state.deleted.push({ id, cascade })
          return {
            deleted: 1,
            cascaded: { assumptions: 0, mvpLinks: 0, capabilityLinks: 0 },
          }
        },
      },
      conflicts: {
        resolve: async (id: number, body: unknown) => {
          failWrite()
          state.resolved.push({ id, body })
          // Mirror the write so a refetch shows the new state.
          state.graph = {
            ...(state.graph as ScopeGraph),
            featureCapabilityLinks: (state.graph as ScopeGraph).featureCapabilityLinks.map(
              (link) =>
                link.id === id
                  ? {
                      ...link,
                      ...(body as {
                        resolution_state: string
                        resolution_note: string | null
                      }),
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
const ScopeMap = (await import('@/pages/ScopeMap')).default

/** Exposes the current URL so tests can assert filter state reaches it. */
function LocationProbe() {
  const location = useLocation()
  return <output data-testid="url">{location.search}</output>
}

function renderPage(initialUrl = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <Routes>
          <Route
            path="/"
            element={
              <>
                {children}
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
  return render(<ScopeMap />, { wrapper })
}

const url = () => screen.getByTestId('url').textContent ?? ''

/** The link lookups stay closed until the shown item is tapped. */
async function openMvpEditor(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /change MVP features|link an MVP/i }))
  return screen.getByRole('group', { name: /linked MVP features/i })
}

async function openCapabilityEditor(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole('button', { name: /change assigned capabilities|assign capabilities/i }),
  )
  return screen.getByRole('group', { name: /assigned capabilities/i })
}

/** The rail is hidden until asked for, so most filter tests open it first. */
async function openFilters(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^filters/i }))
  return screen.getByRole('complementary', { name: 'Filters' })
}

beforeEach(() => {
  state.graph = makeScopeGraph()
  state.fail = null
  state.writeFail = null
  state.nextId = 'F-004'
  state.created = []
  state.patched = []
  state.deleted = []
  state.mvpLinkCalls = []
  state.capabilityLinkCalls = []
  state.resolved = []
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

describe('ScopeMap page', () => {
  it('renders the grid from the graph', async () => {
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))
    expect(screen.getByRole('heading', { level: 1, name: /scope map/i })).toBeInTheDocument()
  })

  it('reports the totals below the grid', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Features')).toBeInTheDocument())
    expect(screen.getByText('1 of 4')).toBeInTheDocument()
  })

  it('surfaces a friendly error and offers a retry', async () => {
    state.fail = 'Cannot reach the server. Check that it is running, then try again.'
    renderPage()

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('alert')).toHaveTextContent(/cannot reach the server/i)
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('explains that an empty cell is information', async () => {
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))
    expect(
      screen.getByText(/an empty cell is information: nothing in that phase lands there/i),
    ).toBeInTheDocument()
  })
})

describe('ScopeMap zoom controls (R-8.7)', () => {
  it('exposes zoom in, zoom out, fit and reset', async () => {
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))

    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '100%' })).toBeInTheDocument()
  })

  it('changes the zoom level and announces it', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))

    // Queried by role, not by text: the reset button is also labelled "100%".
    const readout = screen.getByRole('status', { name: 'Zoom level' })

    await user.click(screen.getByRole('button', { name: '100%' }))
    expect(readout).toHaveTextContent('100%')

    await user.click(screen.getByRole('button', { name: 'Zoom out' }))
    expect(readout).toHaveTextContent('90%')

    await user.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(readout).toHaveTextContent('100%')
  })

  it('clamps zoom out at the minimum', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))

    await user.click(screen.getByRole('button', { name: '100%' }))
    for (let i = 0; i < 12; i++) {
      const button = screen.getByRole('button', { name: 'Zoom out' })
      if ((button as HTMLButtonElement).disabled) break
      await user.click(button)
    }
    expect(screen.getByRole('status', { name: 'Zoom level' })).toHaveTextContent('40%')
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeDisabled()
  })
})

describe('ScopeMap filter rail', () => {
  it('is hidden until the filters button is pressed', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))

    expect(screen.queryByRole('complementary', { name: 'Filters' })).not.toBeInTheDocument()

    await openFilters(user)
    expect(screen.getByRole('complementary', { name: 'Filters' })).toBeInTheDocument()
  })

  it('opens as a column beside the map, not over it', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))

    await openFilters(user)
    // The map is still rendered — the rail is a column, never a modal.
    expect(screen.getAllByRole('cell')).toHaveLength(4)
    expect(screen.getByRole('complementary', { name: 'Filters' })).not.toHaveAttribute(
      'role',
      'dialog',
    )
  })

  it('closes again from the button and from the rail', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))

    await openFilters(user)
    await user.click(screen.getByRole('button', { name: /hide/i }))
    expect(screen.queryByRole('complementary', { name: 'Filters' })).not.toBeInTheDocument()

    await openFilters(user)
    await user.click(screen.getByRole('button', { name: /^filters/i }))
    expect(screen.queryByRole('complementary', { name: 'Filters' })).not.toBeInTheDocument()
  })

  it('counts the active filter groups on the button, so hiding loses nothing', async () => {
    renderPage('/?actor=staff&release=1.1')
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))

    // Rail closed, but the button still says the view is filtered.
    expect(screen.queryByRole('complementary', { name: 'Filters' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Filters, 2 active' })).toBeInTheDocument()
  })

  it('offers every filter group', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))
    await openFilters(user)

    for (const group of [
      'Release',
      'Phase',
      'Actor',
      'MVP feature',
      'Scope option',
      'Conflict state',
      'Source',
      'PwC feature',
    ]) {
      expect(screen.getByRole('group', { name: new RegExp(group, 'i') })).toBeInTheDocument()
    }
  })

  it('filters by source from the URL', async () => {
    // Both fixture features are imported, so a manual-only filter empties the
    // map — which replaces the grid, so there are no cells to wait for.
    renderPage('/?source=manual')
    await waitFor(() => expect(screen.getByText(/no features match/i)).toBeInTheDocument())
    expect(screen.getByText(/the Source filter is what excludes everything/i)).toBeInTheDocument()
  })

  it('keeps every feature when filtering to the mapping source', async () => {
    renderPage('/?source=mapping')
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))
    expect(screen.getByLabelText('F-001 Invite employer')).toBeInTheDocument()
    expect(screen.getByLabelText('F-002 Verify employer')).toBeInTheDocument()
  })

  it('offers the four provenance values', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))
    await openFilters(user)

    const source = screen.getByRole('group', { name: /^source/i })
    for (const label of [
      'Mapping file',
      'Sequencing table',
      'Both sources',
      'Added or edited here',
    ]) {
      expect(within(source).getByRole('checkbox', { name: new RegExp(label) })).toBeInTheDocument()
    }
  })

  it('writes the selected filter into the URL (R-10.2)', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))
    await openFilters(user)

    const release = screen.getByRole('group', { name: /release/i })
    await user.click(within(release).getByRole('checkbox', { name: /Release 1\.4/ }))

    await waitFor(() => expect(url()).toContain('release=1.4'))
  })

  it('reproduces a view from the URL alone', async () => {
    const user = userEvent.setup()
    renderPage('/?actor=staff')
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))

    // Only F-001 cites a staff capability — filtering applies even though
    // the rail is closed.
    expect(screen.getByLabelText('F-001 Invite employer')).toBeInTheDocument()
    expect(screen.queryByLabelText('F-002 Verify employer')).not.toBeInTheDocument()

    await openFilters(user)
    const actor = screen.getByRole('group', { name: /actor/i })
    expect(within(actor).getByRole('checkbox', { name: /Staff/ })).toBeChecked()
  })

  it('reports how many features survive the filters', async () => {
    const user = userEvent.setup()
    renderPage('/?actor=staff')
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))

    // The count is interpolated, so it spans several text nodes.
    const rail = await openFilters(user)
    expect(rail).toHaveTextContent('1 of 2 features')
  })

  it('shows a live count on each control (R-8.9)', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))
    await openFilters(user)

    const release = screen.getByRole('group', { name: /release/i })
    // Release 1.1 holds both features; 1.4 holds none.
    expect(within(release).getByText('Release 1.1').closest('label')).toHaveTextContent('2')
    expect(within(release).getByText('Release 1.4').closest('label')).toHaveTextContent('0')
  })

  it('clears everything with one control', async () => {
    const user = userEvent.setup()
    renderPage('/?actor=staff&release=1.1')
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))
    await openFilters(user)

    await user.click(screen.getByRole('button', { name: /clear all/i }))

    await waitFor(() => expect(url()).not.toContain('actor'))
    expect(url()).not.toContain('release')
    expect(screen.getByLabelText('F-002 Verify employer')).toBeInTheDocument()
  })

  it('disables clear-all when nothing is filtered', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))
    await openFilters(user)
    expect(screen.getByRole('button', { name: /clear all/i })).toBeDisabled()
  })
})

describe('ScopeMap zero-result state (R-8.10)', () => {
  it('names the filter responsible and offers to drop it', async () => {
    renderPage('/?actor=jobseeker')
    await waitFor(() => expect(screen.getByText(/no features match/i)).toBeInTheDocument())

    expect(screen.getByText(/the Actor filter is what excludes everything/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /drop Actor filter/i })).toBeInTheDocument()
  })

  it('dropping the named filter restores results', async () => {
    const user = userEvent.setup()
    renderPage('/?actor=jobseeker')
    await waitFor(() => expect(screen.getByText(/no features match/i)).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /drop Actor filter/i }))

    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))
    expect(screen.getByLabelText('F-001 Invite employer')).toBeInTheDocument()
  })

  it('says so when only the combination is at fault', async () => {
    renderPage('/?release=1.4&actor=jobseeker')
    await waitFor(() => expect(screen.getByText(/no features match/i)).toBeInTheDocument())
    expect(screen.getByText(/no single filter is responsible/i)).toBeInTheDocument()
  })

  it('never shows a bare empty panel', async () => {
    renderPage('/?actor=jobseeker')
    await waitFor(() => expect(screen.getByText(/no features match/i)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /clear all filters/i })).toBeInTheDocument()
  })

  it('offers to reveal the rail when it is hidden, so the cause is reachable', async () => {
    const user = userEvent.setup()
    renderPage('/?actor=jobseeker')
    await waitFor(() => expect(screen.getByText(/no features match/i)).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /show filters/i }))
    expect(screen.getByRole('complementary', { name: 'Filters' })).toBeInTheDocument()
  })
})

describe('ScopeMap selection and detail panel', () => {
  it('opens the panel beside the map, keeping the map visible', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))

    await user.click(screen.getByRole('button', { name: 'F-001 Invite employer' }))

    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Invite employer' })).toBeInTheDocument(),
    )
    // The map is still there — the panel opened beside it, not over it.
    expect(screen.getAllByRole('cell')).toHaveLength(4)
  })

  it('keeps the active filters when the panel opens', async () => {
    const user = userEvent.setup()
    renderPage('/?actor=staff')
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))

    await user.click(screen.getByRole('button', { name: 'F-001 Invite employer' }))

    await waitFor(() => expect(url()).toContain('selected=F-001'))
    expect(url()).toContain('actor=staff')
    expect(screen.queryByLabelText('F-002 Verify employer')).not.toBeInTheDocument()
  })

  it('puts the selection in the URL', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))

    await user.click(screen.getByRole('button', { name: 'F-002 Verify employer' }))
    await waitFor(() => expect(url()).toContain('selected=F-002'))
  })

  it('reopens the panel from the URL alone', async () => {
    renderPage('/?selected=F-002')
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Verify employer' })).toBeInTheDocument(),
    )
  })

  it('marks the selected card as pressed', async () => {
    renderPage('/?selected=F-002')
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))
    expect(screen.getByRole('button', { name: 'F-002 Verify employer' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('closes on Escape and clears the URL', async () => {
    const user = userEvent.setup()
    renderPage('/?selected=F-002')
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Verify employer' })).toBeInTheDocument(),
    )

    await user.keyboard('{Escape}')

    await waitFor(() => expect(url()).not.toContain('selected'))
    expect(screen.queryByRole('region', { name: 'Verify employer' })).not.toBeInTheDocument()
  })

  it('clicking the open card again closes the panel', async () => {
    const user = userEvent.setup()
    renderPage('/?selected=F-002')
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))

    await user.click(screen.getByRole('button', { name: 'F-002 Verify employer' }))
    await waitFor(() => expect(url()).not.toContain('selected'))
  })

  it('the pivot control filters the map without closing the panel (R-8.16)', async () => {
    const user = userEvent.setup()
    renderPage('/?selected=F-002')
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Verify employer' })).toBeInTheDocument(),
    )

    await user.click(
      screen.getByRole('button', { name: 'Filter the map to MVP feature 948' }),
    )

    await waitFor(() => expect(url()).toContain('mvp=948'))
    // Still open, and still on the same feature.
    expect(screen.getByRole('region', { name: 'Verify employer' })).toBeInTheDocument()
    expect(url()).toContain('selected=F-002')
  })

  it('a connected feature switches the panel to it', async () => {
    const user = userEvent.setup()
    state.graph = makeScopeGraph({
      featureMvpLinks: [
        { pwc_feature_id: 'F-001', mvp_feature_id: 1, source: 'mapping' },
        { pwc_feature_id: 'F-002', mvp_feature_id: 2, source: 'mapping' },
      ],
    })
    renderPage('/?selected=F-001')
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Invite employer' })).toBeInTheDocument(),
    )

    // Scoped to the panel: the map card for F-002 matches the same name.
    const panel = screen.getByRole('region', { name: 'Invite employer' })
    await user.click(within(panel).getByRole('button', { name: /F-002/ }))

    await waitFor(() => expect(url()).toContain('selected=F-002'))
    expect(screen.getByRole('region', { name: 'Verify employer' })).toBeInTheDocument()
  })
})

describe('ScopeMap create (R-9.7)', () => {
  it('pre-fills the release and phase from the cell the create started in', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))

    await user.click(
      screen.getByRole('button', { name: 'Add a feature to Release 1.4, Manage Vacancies' }),
    )

    expect(screen.getByRole('form', { name: /new pwc feature/i })).toBeInTheDocument()
    expect(screen.getByLabelText('Release')).toHaveValue('1.4')
    expect(screen.getByLabelText('Phase')).toHaveValue('manage-vacancies')
  })

  it('offers the next free id as an overridable default', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))

    await user.click(
      screen.getByRole('button', { name: 'Add a feature to Release 1.4, Manage Vacancies' }),
    )

    await waitFor(() => expect(screen.getByLabelText('Feature id')).toHaveValue('F-004'))

    await user.clear(screen.getByLabelText('Feature id'))
    await user.type(screen.getByLabelText('Feature id'), 'F-050')
    expect(screen.getByLabelText('Feature id')).toHaveValue('F-050')
  })

  it('sends the create and selects the new feature', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))

    await user.click(
      screen.getByRole('button', { name: 'Add a feature to Release 1.4, Manage Vacancies' }),
    )
    await waitFor(() => expect(screen.getByLabelText('Feature id')).toHaveValue('F-004'))
    await user.type(screen.getByLabelText('Name'), 'Brand new feature')
    await user.click(screen.getByRole('button', { name: /create feature/i }))

    await waitFor(() => expect(state.created).toHaveLength(1))
    expect(state.created[0]).toMatchObject({
      id: 'F-004',
      name: 'Brand new feature',
      release_id: '1.4',
      phase_id: 'manage-vacancies',
    })
    await waitFor(() => expect(url()).toContain('selected=F-004'))
  })

  it('blocks submission client-side when a field is invalid', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))

    await user.click(
      screen.getByRole('button', { name: 'Add a feature to Release 1.4, Manage Vacancies' }),
    )
    await waitFor(() => expect(screen.getByLabelText('Feature id')).toHaveValue('F-004'))
    // No name.
    await user.click(screen.getByRole('button', { name: /create feature/i }))

    expect(screen.getByText(/give the feature a name/i)).toBeInTheDocument()
    expect(state.created).toHaveLength(0)
  })

  it("surfaces the server's own message when the create is rejected", async () => {
    const user = userEvent.setup()
    state.writeFail = 'Feature F-004 already exists.'
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))

    await user.click(
      screen.getByRole('button', { name: 'Add a feature to Release 1.4, Manage Vacancies' }),
    )
    await waitFor(() => expect(screen.getByLabelText('Feature id')).toHaveValue('F-004'))
    await user.type(screen.getByLabelText('Name'), 'Duplicate')
    await user.click(screen.getByRole('button', { name: /create feature/i }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Feature F-004 already exists.'),
    )
  })
})

describe('ScopeMap inline edit', () => {
  it('saves a name change and sends only that field', async () => {
    const user = userEvent.setup()
    renderPage('/?selected=F-002')
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Verify employer' })).toBeInTheDocument(),
    )

    await user.click(screen.getByRole('button', { name: /edit name/i }))
    const input = screen.getByLabelText('Name')
    await user.clear(input)
    await user.type(input, 'Verify employer (renamed)')
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(state.patched).toHaveLength(1))
    expect(state.patched[0]).toEqual({
      id: 'F-002',
      patch: { name: 'Verify employer (renamed)' },
    })
  })

  it('cancels without sending anything', async () => {
    const user = userEvent.setup()
    renderPage('/?selected=F-002')
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Verify employer' })).toBeInTheDocument(),
    )

    await user.click(screen.getByRole('button', { name: /edit name/i }))
    await user.type(screen.getByLabelText('Name'), ' extra')
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(state.patched).toHaveLength(0)
  })

  it("keeps the draft and shows the server's message when the save fails (R-9.6)", async () => {
    const user = userEvent.setup()
    state.writeFail = 'Feature id must look like F-001.'
    renderPage('/?selected=F-002')
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Verify employer' })).toBeInTheDocument(),
    )

    await user.click(screen.getByRole('button', { name: /edit name/i }))
    const input = screen.getByLabelText('Name')
    await user.clear(input)
    await user.type(input, 'Rejected name')
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Feature id must look like F-001.',
      ),
    )
    // The typing is not lost, and the map still shows the stored value.
    expect(screen.getByLabelText('Name')).toHaveValue('Rejected name')
    expect(screen.getByRole('button', { name: 'F-002 Verify employer' })).toBeInTheDocument()
  })
})

describe('ScopeMap delete (R-9.4, R-9.5)', () => {
  it('states exactly what will be removed before deleting', async () => {
    const user = userEvent.setup()
    renderPage('/?selected=F-002')
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Verify employer' })).toBeInTheDocument(),
    )

    await user.click(screen.getByRole('button', { name: /delete F-002/i }))

    expect(screen.getByText(/This also removes/i)).toBeInTheDocument()
    expect(screen.getByText(/capabilities and MVP features themselves are kept/i)).toBeInTheDocument()
  })

  it('cascades only after the explicit confirmation', async () => {
    const user = userEvent.setup()
    renderPage('/?selected=F-002')
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Verify employer' })).toBeInTheDocument(),
    )

    await user.click(screen.getByRole('button', { name: /delete F-002/i }))
    expect(state.deleted).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: /delete and remove those rows/i }))

    await waitFor(() => expect(state.deleted).toHaveLength(1))
    expect(state.deleted[0]).toEqual({ id: 'F-002', cascade: true })
  })

  it('closes the panel after a successful delete', async () => {
    const user = userEvent.setup()
    renderPage('/?selected=F-002')
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Verify employer' })).toBeInTheDocument(),
    )

    await user.click(screen.getByRole('button', { name: /delete F-002/i }))
    await user.click(screen.getByRole('button', { name: /delete and remove those rows/i }))

    await waitFor(() => expect(url()).not.toContain('selected'))
  })

  it("surfaces the server's refusal and keeps the feature", async () => {
    const user = userEvent.setup()
    state.writeFail =
      'Cannot delete F-002 — 1 capability link references it. Confirm the cascade to remove them too.'
    renderPage('/?selected=F-002')
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Verify employer' })).toBeInTheDocument(),
    )

    await user.click(screen.getByRole('button', { name: /delete F-002/i }))
    await user.click(screen.getByRole('button', { name: /delete and remove those rows/i }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/Cannot delete F-002/),
    )
    // Rolled back — the card is still on the map.
    expect(screen.getByRole('button', { name: 'F-002 Verify employer' })).toBeInTheDocument()
  })
})

describe('ScopeMap unsaved-change protection (R-10.8)', () => {
  it('warns before discarding an in-progress edit', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderPage('/?selected=F-002')
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Verify employer' })).toBeInTheDocument(),
    )

    await user.click(screen.getByRole('button', { name: /edit name/i }))
    await user.type(screen.getByLabelText('Name'), ' changed')

    await user.click(screen.getByRole('button', { name: /^close$/i }))

    expect(confirmSpy).toHaveBeenCalledWith('You have unsaved changes. Discard them?')
    // Declined, so the panel stays open.
    expect(screen.getByRole('region', { name: 'Verify employer' })).toBeInTheDocument()
  })

  it('does not warn when nothing is dirty', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPage('/?selected=F-002')
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Verify employer' })).toBeInTheDocument(),
    )

    await user.click(screen.getByRole('button', { name: /^close$/i }))

    expect(confirmSpy).not.toHaveBeenCalled()
  })
})

describe('ScopeMap placement editing', () => {
  it('changes the release a feature sits in', async () => {
    const user = userEvent.setup()
    renderPage('/?selected=F-002')
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Verify employer' })).toBeInTheDocument(),
    )

    await user.click(screen.getByRole('button', { name: /edit release/i }))
    await user.selectOptions(screen.getByLabelText('Release'), '1.4')
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(state.patched).toHaveLength(1))
    expect(state.patched[0]).toEqual({ id: 'F-002', patch: { release_id: '1.4' } })
  })

  it('changes the phase a feature sits in', async () => {
    const user = userEvent.setup()
    renderPage('/?selected=F-002')
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Verify employer' })).toBeInTheDocument(),
    )

    await user.click(screen.getByRole('button', { name: /edit phase/i }))
    await user.selectOptions(screen.getByLabelText('Phase'), 'manage-vacancies')
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(state.patched).toHaveLength(1))
    expect(state.patched[0]).toEqual({
      id: 'F-002',
      patch: { phase_id: 'manage-vacancies' },
    })
  })

  it('offers every release and phase as a choice', async () => {
    const user = userEvent.setup()
    renderPage('/?selected=F-002')
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Verify employer' })).toBeInTheDocument(),
    )

    await user.click(screen.getByRole('button', { name: /edit release/i }))
    const select = screen.getByLabelText('Release')
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Release 1.1',
      'Release 1.4',
    ])
  })
})

describe('ScopeMap MVP link editing', () => {
  it('stays closed until the shown MVP item is tapped', async () => {
    const user = userEvent.setup()
    renderPage('/?selected=F-002')
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Verify employer' })).toBeInTheDocument(),
    )

    expect(
      screen.queryByRole('group', { name: /linked MVP features/i }),
    ).not.toBeInTheDocument()

    // The chip for the MVP feature that is already there.
    await user.click(screen.getByRole('button', { name: /948.*Verification methods/i }))
    expect(screen.getByRole('group', { name: /linked MVP features/i })).toBeInTheDocument()
  })

  it('closes again from Done', async () => {
    const user = userEvent.setup()
    renderPage('/?selected=F-002')
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Verify employer' })).toBeInTheDocument(),
    )

    await openMvpEditor(user)
    await user.click(screen.getByRole('button', { name: /^done$/i }))
    expect(
      screen.queryByRole('group', { name: /linked MVP features/i }),
    ).not.toBeInTheDocument()
  })

  it('lists every MVP record with its ref and option', async () => {
    const user = userEvent.setup()
    renderPage('/?selected=F-002')
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Verify employer' })).toBeInTheDocument(),
    )
    const picker = await openMvpEditor(user)
    expect(within(picker).getByText('938')).toBeInTheDocument()
    expect(within(picker).getByText('938 · Option 1A')).toBeInTheDocument()
    expect(within(picker).getByText('948 · Option 1B')).toBeInTheDocument()
  })

  it('shows the feature\'s current links as checked', async () => {
    const user = userEvent.setup()
    renderPage('/?selected=F-002')
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Verify employer' })).toBeInTheDocument(),
    )
    const picker = await openMvpEditor(user)
    // F-002 links to record 3 (ref 948 / 1B).
    expect(within(picker).getByRole('checkbox', { name: /948/ })).toBeChecked()
    expect(within(picker).getByRole('checkbox', { name: /938 · Option 1A/ })).not.toBeChecked()
  })

  it('adds an MVP feature, sending the complete new set', async () => {
    const user = userEvent.setup()
    renderPage('/?selected=F-002')
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Verify employer' })).toBeInTheDocument(),
    )

    const picker = await openMvpEditor(user)
    await user.click(within(picker).getByRole('checkbox', { name: /938 · Option 1A/ }))

    await waitFor(() => expect(state.mvpLinkCalls).toHaveLength(1))
    expect(state.mvpLinkCalls[0]).toEqual({ id: 'F-002', mvpFeatureIds: [3, 1] })
  })

  it('removes an MVP feature', async () => {
    const user = userEvent.setup()
    renderPage('/?selected=F-002')
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Verify employer' })).toBeInTheDocument(),
    )

    const picker = await openMvpEditor(user)
    await user.click(within(picker).getByRole('checkbox', { name: /948/ }))

    await waitFor(() => expect(state.mvpLinkCalls).toHaveLength(1))
    expect(state.mvpLinkCalls[0]).toEqual({ id: 'F-002', mvpFeatureIds: [] })
  })

  it('can be searched by ref or title', async () => {
    const user = userEvent.setup()
    renderPage('/?selected=F-002')
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Verify employer' })).toBeInTheDocument(),
    )

    const picker = await openMvpEditor(user)
    await user.type(
      within(picker).getByLabelText(/search MVP features/i),
      'Verification',
    )

    expect(within(picker).getByText('948 · Option 1B')).toBeInTheDocument()
    expect(within(picker).queryByText('938 · Option 1A')).not.toBeInTheDocument()
  })
})

describe('ScopeMap capability link editing', () => {
  it('stays closed until the shown capability is tapped', async () => {
    const user = userEvent.setup()
    renderPage('/?selected=F-002')
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Verify employer' })).toBeInTheDocument(),
    )

    expect(
      screen.queryByRole('group', { name: /assigned capabilities/i }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Electronic T&Cs acceptance' }))
    expect(screen.getByRole('group', { name: /assigned capabilities/i })).toBeInTheDocument()
  })

  it('lists capabilities with their ref, actor and release', async () => {
    const user = userEvent.setup()
    renderPage('/?selected=F-002')
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Verify employer' })).toBeInTheDocument(),
    )
    const picker = await openCapabilityEditor(user)
    expect(within(picker).getByText('Electronic T&Cs acceptance')).toBeInTheDocument()
    expect(within(picker).getByText(/948 · employer/)).toBeInTheDocument()
    expect(within(picker).getAllByText('Release 1.4').length).toBeGreaterThan(0)
  })

  it('shows the current assignment as checked', async () => {
    const user = userEvent.setup()
    renderPage('/?selected=F-002')
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Verify employer' })).toBeInTheDocument(),
    )
    const picker = await openCapabilityEditor(user)
    expect(
      within(picker).getByRole('checkbox', { name: /Electronic T&Cs acceptance/ }),
    ).toBeChecked()
  })

  it('assigns a capability from another MVP ref, sending the new set', async () => {
    const user = userEvent.setup()
    renderPage('/?selected=F-002')
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Verify employer' })).toBeInTheDocument(),
    )

    const picker = await openCapabilityEditor(user)
    await user.click(
      within(picker).getByRole('checkbox', { name: /Invite employer to register/ }),
    )

    await waitFor(() => expect(state.capabilityLinkCalls).toHaveLength(1))
    expect(state.capabilityLinkCalls[0]).toEqual({ id: 'F-002', capabilityIds: [12, 10] })
  })

  it('unassigns a capability', async () => {
    const user = userEvent.setup()
    renderPage('/?selected=F-002')
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Verify employer' })).toBeInTheDocument(),
    )

    const picker = await openCapabilityEditor(user)
    await user.click(
      within(picker).getByRole('checkbox', { name: /Electronic T&Cs acceptance/ }),
    )

    await waitFor(() => expect(state.capabilityLinkCalls).toHaveLength(1))
    expect(state.capabilityLinkCalls[0]).toEqual({ id: 'F-002', capabilityIds: [] })
  })

  it("surfaces the server's message when a link change is rejected", async () => {
    const user = userEvent.setup()
    state.writeFail = 'No capability with id 99999.'
    renderPage('/?selected=F-002')
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Verify employer' })).toBeInTheDocument(),
    )

    const picker = await openCapabilityEditor(user)
    await user.click(
      within(picker).getByRole('checkbox', { name: /Invite employer to register/ }),
    )

    await waitFor(() =>
      expect(within(picker).getByRole('alert')).toHaveTextContent(
        'No capability with id 99999.',
      ),
    )
  })
})

describe('ScopeMap MVP filter collapses until searched', () => {
  it('shows only the search field, not the whole list', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))
    await openFilters(user)

    const mvp = screen.getByRole('group', { name: /MVP feature/i })
    expect(within(mvp).getByLabelText('Search MVP features')).toBeInTheDocument()
    expect(within(mvp).queryByRole('checkbox')).not.toBeInTheDocument()
    expect(within(mvp).getByText(/type to search 2 MVP features/i)).toBeInTheDocument()
  })

  it('shows results once something is typed', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))
    await openFilters(user)

    const mvp = screen.getByRole('group', { name: /MVP feature/i })
    await user.type(within(mvp).getByLabelText('Search MVP features'), '938')

    expect(within(mvp).getByRole('checkbox', { name: /938/ })).toBeInTheDocument()
    expect(within(mvp).queryByRole('checkbox', { name: /948/ })).not.toBeInTheDocument()
  })

  it('collapses again when the search is cleared', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))
    await openFilters(user)

    const mvp = screen.getByRole('group', { name: /MVP feature/i })
    const search = within(mvp).getByLabelText('Search MVP features')
    await user.type(search, '938')
    expect(within(mvp).getByRole('checkbox', { name: /938/ })).toBeInTheDocument()

    await user.clear(search)
    expect(within(mvp).queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('keeps a selected ref visible while collapsed, so an active filter is never hidden', async () => {
    const user = userEvent.setup()
    renderPage('/?mvp=938')
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))
    await openFilters(user)

    const mvp = screen.getByRole('group', { name: /MVP feature/i })
    const checkbox = within(mvp).getByRole('checkbox', { name: /938/ })
    expect(checkbox).toBeChecked()
    expect(within(mvp).getByText(/1 selected\. type to find more/i)).toBeInTheDocument()
    // The unselected one stays hidden until searched for.
    expect(within(mvp).queryByRole('checkbox', { name: /948/ })).not.toBeInTheDocument()
  })
})

describe('ScopeMap PwC feature filter', () => {
  const featureGroup = () => screen.getByRole('group', { name: /^PwC feature/i })

  it('collapses to a search field like the MVP lookup', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))
    await openFilters(user)

    expect(within(featureGroup()).getByLabelText('Search PwC features')).toBeInTheDocument()
    expect(within(featureGroup()).queryByRole('checkbox')).not.toBeInTheDocument()
    expect(within(featureGroup()).getByText(/type to search 2 PwC features/i)).toBeInTheDocument()
  })

  it('finds a feature by id', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))
    await openFilters(user)

    await user.type(within(featureGroup()).getByLabelText('Search PwC features'), 'F-002')

    expect(within(featureGroup()).getByRole('checkbox', { name: /F-002/ })).toBeInTheDocument()
    expect(
      within(featureGroup()).queryByRole('checkbox', { name: /F-001/ }),
    ).not.toBeInTheDocument()
  })

  it('finds a feature by name', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))
    await openFilters(user)

    await user.type(within(featureGroup()).getByLabelText('Search PwC features'), 'Verify')

    expect(within(featureGroup()).getByRole('checkbox', { name: /F-002/ })).toBeInTheDocument()
  })

  it('narrows the map to the selected feature and writes it to the URL', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))
    await openFilters(user)

    await user.type(within(featureGroup()).getByLabelText('Search PwC features'), 'F-001')
    await user.click(within(featureGroup()).getByRole('checkbox', { name: /F-001/ }))

    await waitFor(() => expect(url()).toContain('feature=F-001'))
    expect(screen.getByLabelText('F-001 Invite employer')).toBeInTheDocument()
    expect(screen.queryByLabelText('F-002 Verify employer')).not.toBeInTheDocument()
  })

  it('reproduces the view from the URL, keeping the selection visible', async () => {
    const user = userEvent.setup()
    renderPage('/?feature=F-002')
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))

    expect(screen.getByLabelText('F-002 Verify employer')).toBeInTheDocument()
    expect(screen.queryByLabelText('F-001 Invite employer')).not.toBeInTheDocument()

    await openFilters(user)
    expect(within(featureGroup()).getByRole('checkbox', { name: /F-002/ })).toBeChecked()
    // The legend also says "1 selected", so match the collapsed note itself.
    expect(
      within(featureGroup()).getByText(/1 selected\. type to find more/i),
    ).toBeInTheDocument()
  })
})

describe('ScopeMap search (R-8.11 – R-8.13)', () => {
  const searchBox = () => screen.getByRole('combobox', { name: /search the scope/i })

  it('is always reachable, not behind a toggle', async () => {
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))
    expect(searchBox()).toBeInTheDocument()
  })

  it('focuses from the / key (R-10.4)', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))

    expect(searchBox()).not.toHaveFocus()
    await user.keyboard('/')
    expect(searchBox()).toHaveFocus()
  })

  it('does not steal a / typed into another field', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))
    await openFilters(user)

    const mvpSearch = within(screen.getByRole('group', { name: /MVP feature/i })).getByLabelText(
      'Search MVP features',
    )
    await user.click(mvpSearch)
    await user.keyboard('/')

    expect(mvpSearch).toHaveValue('/')
    expect(searchBox()).not.toHaveFocus()
  })

  it('groups results by what matched', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))

    await user.type(searchBox(), 'employer')

    const list = screen.getByRole('listbox', { name: /search results/i })
    expect(within(list).getByText(/^Feature name/)).toBeInTheDocument()
    expect(within(list).getAllByRole('option').length).toBeGreaterThan(0)
  })

  it('highlights the term inside the result', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))

    await user.type(searchBox(), 'Verify')

    const list = screen.getByRole('listbox', { name: /search results/i })
    expect(within(list).getAllByText('Verify')[0].tagName).toBe('MARK')
  })

  it('says so when nothing matches', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))

    await user.type(searchBox(), 'zzzzz')
    expect(screen.getByText(/nothing matches “zzzzz”/i)).toBeInTheDocument()
  })

  it('walks results with the arrow keys and selects with Enter', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))

    await user.type(searchBox(), 'F-002')
    // The first hit is active by default; Enter reveals it on the map.
    await user.keyboard('{Enter}')

    await waitFor(() => expect(url()).toContain('selected=F-002'))
    expect(url()).toContain('q=F-002')
    expect(screen.getByRole('region', { name: 'Verify employer' })).toBeInTheDocument()
  })

  it('moves the active option with ArrowDown', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))

    await user.type(searchBox(), 'employer')
    const first = screen.getAllByRole('option')[0]
    expect(first).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{ArrowDown}')
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'false')
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true')
  })

  it('wraps from the last option back to the first', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))

    await user.type(searchBox(), 'F-002')
    await user.keyboard('{ArrowUp}')

    const options = screen.getAllByRole('option')
    expect(options[options.length - 1]).toHaveAttribute('aria-selected', 'true')
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))

    await user.type(searchBox(), 'employer')
    expect(screen.getByRole('listbox', { name: /search results/i })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox', { name: /search results/i })).not.toBeInTheDocument()
  })

  it('highlights the term in the panel\'s long-form text on arrival', async () => {
    const base = makeScopeGraph()
    state.graph = {
      ...base,
      pwcFeatures: base.pwcFeatures.map((f) =>
        f.id === 'F-002'
          ? { ...f, foundational_build: 'Staff verify an employer before publishing.' }
          : f,
      ),
      assumptions: [
        {
          id: 1,
          pwc_feature_id: 'F-002',
          position: 1,
          text: 'Assumes an Omniscript saves the partial verification.',
          source: 'mapping',
        },
      ],
    }

    renderPage('/?selected=F-002&q=Omniscript')
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Verify employer' })).toBeInTheDocument(),
    )

    const panel = screen.getByRole('region', { name: 'Verify employer' })
    expect(within(panel).getByText('Omniscript').tagName).toBe('MARK')
  })

  it('leaves the panel unmarked when no term was carried', async () => {
    renderPage('/?selected=F-002')
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Verify employer' })).toBeInTheDocument(),
    )
    const panel = screen.getByRole('region', { name: 'Verify employer' })
    expect(panel.querySelector('mark')).toBeNull()
  })
})

describe('ScopeMap row-mode views (the design\'s transposed grid)', () => {
  it('defaults to grouping rows by release', async () => {
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))

    const rows = screen.getAllByRole('rowheader')
    expect(rows[0]).toHaveTextContent('Release 1.1')
    expect(screen.getByRole('button', { name: 'By release' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('renders phases across the top as stages', async () => {
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))

    const headers = screen.getAllByRole('columnheader')
    expect(headers[1]).toHaveTextContent('Stage 1')
    expect(headers[1]).toHaveTextContent('Access & Onboarding')
  })

  it('switches to actor rows', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))

    await user.click(screen.getByRole('button', { name: 'By actor' }))

    const rows = screen.getAllByRole('rowheader')
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Employers'),
      expect.stringContaining('MSD staff'),
      expect.stringContaining('Jobseekers'),
      expect.stringContaining('Systems'),
      expect.stringContaining('No actor recorded'),
    ])
  })

  it('shows a multi-actor feature in every row it belongs to', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))

    await user.click(screen.getByRole('button', { name: 'By actor' }))

    // F-001 cites a staff and an employer capability.
    expect(screen.getAllByRole('button', { name: 'F-001 Invite employer' })).toHaveLength(2)
  })

  it('loses no feature when the view changes', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))

    const inRelease = new Set(
      screen.getAllByRole('button', { name: /^F-\d{3} / }).map((b) => b.getAttribute('aria-label')),
    )

    await user.click(screen.getByRole('button', { name: 'By actor' }))
    const inActor = new Set(
      screen.getAllByRole('button', { name: /^F-\d{3} / }).map((b) => b.getAttribute('aria-label')),
    )

    expect(inActor).toEqual(inRelease)
  })

  it('keeps selection and filters across a view change', async () => {
    const user = userEvent.setup()
    renderPage('/?selected=F-002&actor=employer')
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Verify employer' })).toBeInTheDocument(),
    )

    await user.click(screen.getByRole('button', { name: 'By actor' }))

    expect(screen.getByRole('region', { name: 'Verify employer' })).toBeInTheDocument()
    expect(url()).toContain('actor=employer')
  })
})

describe('ScopeMap chrome from the design', () => {
  it('offers a release chip per release, with counts', async () => {
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))

    const chips = screen.getByRole('list', { name: /filter by release/i })
    expect(within(chips).getByRole('button', { name: /Release 1\.1/ })).toHaveTextContent(
      '2 features · 2 capabilities',
    )
    expect(within(chips).getByRole('button', { name: /Release 1\.4/ })).toHaveTextContent(
      '0 features · 1 capabilities',
    )
  })

  it('a release chip drives the release filter', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))

    const chips = screen.getByRole('list', { name: /filter by release/i })
    await user.click(within(chips).getByRole('button', { name: /Release 1\.4/ }))

    await waitFor(() => expect(url()).toContain('release=1.4'))
    expect(within(chips).getByRole('button', { name: /Release 1\.4/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('names every actor in the legend', async () => {
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))

    const legend = screen.getByRole('list', { name: 'Actors' })
    for (const name of ['Employers', 'MSD staff', 'Jobseekers', 'Systems']) {
      expect(within(legend).getByText(name)).toBeInTheDocument()
    }
  })

  it('closes with a release horizon per release', async () => {
    const base = makeScopeGraph()
    state.graph = {
      ...base,
      releases: base.releases.map((r) =>
        r.id === '1.1' ? { ...r, description: 'Invitation access for a trusted cohort.' } : r,
      ),
    }
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))

    const horizons = screen.getByRole('region', { name: /release horizons/i })
    expect(within(horizons).getAllByRole('listitem')).toHaveLength(2)
    expect(within(horizons).getByText('Pilot')).toBeInTheDocument()
    expect(
      within(horizons).getByText('Invitation access for a trusted cohort.'),
    ).toBeInTheDocument()
    // 1.4 exists only in the sequencing table, so it has no description.
    expect(
      within(horizons).getByText(/appears only in the sequencing table/i),
    ).toBeInTheDocument()
  })
})

describe('ScopeMap — the MSD feature view', () => {
  const openMsdView = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: 'By MSD feature' }))
  }

  it('offers the view as a third tab', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'By release' })).toBeInTheDocument(),
    )
    const tabs = screen.getByRole('group', { name: 'Map view' })
    expect(
      within(tabs)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['By release', 'By actor', 'By MSD feature'])
  })

  it('swaps PwC cards for MSD feature cards', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /^F-\d{3} / }).length).toBeGreaterThan(0),
    )

    await openMsdView(user)

    expect(screen.queryAllByRole('button', { name: /^F-\d{3} / })).toHaveLength(0)
    const cards = screen.getAllByRole('button', { name: /^MSD feature / })
    // One card per MVP record, including both records under ref 938.
    expect(cards.map((c) => c.getAttribute('aria-label'))).toEqual([
      'MSD feature 938 Additional users',
      'MSD feature 938 · 1A Additional users',
      'MSD feature 948 · 1B Verification methods',
    ])
  })

  it('puts a card where the table schedules its capability, not where its feature sits', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'By MSD feature' })).toBeInTheDocument(),
    )
    await openMsdView(user)

    // 948 is cited by F-002 in 1.1, but its capability is scheduled in 1.4.
    const cell = screen.getByRole('cell', { name: /Release 1\.4, Manage Vacancies/ })
    expect(
      within(cell).getByRole('button', { name: 'MSD feature 948 · 1B Verification methods' }),
    ).toBeInTheDocument()
  })

  it('carries the view in the URL so a link reproduces the tab', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'By MSD feature' })).toBeInTheDocument(),
    )
    await openMsdView(user)
    expect(url()).toContain('view=mvp')

    await user.click(screen.getByRole('button', { name: 'By release' }))
    expect(url()).not.toContain('view=mvp')
  })

  it('restores the view from the URL', async () => {
    renderPage('/?view=mvp')
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /^MSD feature / }).length).toBe(3),
    )
  })

  it('opens a detail panel naming the PwC features and capabilities', async () => {
    const user = userEvent.setup()
    renderPage('/?view=mvp')
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'MSD feature 938 Additional users' }),
      ).toBeInTheDocument(),
    )

    await user.click(screen.getByRole('button', { name: 'MSD feature 938 Additional users' }))

    const panel = screen.getByRole('complementary', { name: 'MSD feature 938' })
    expect(within(panel).getByText('PwC features citing this (1)')).toBeInTheDocument()
    expect(within(panel).getByText('F-001')).toBeInTheDocument()
    expect(within(panel).getByText('Capabilities (2)')).toBeInTheDocument()
    expect(within(panel).getByText('Invite employer to register')).toBeInTheDocument()
    expect(within(panel).getByText('Receive secure email invite')).toBeInTheDocument()
    expect(url()).toContain('selectedMvp=2')
  })

  it('says when a card was placed by its PwC feature rather than the table', async () => {
    const user = userEvent.setup()
    renderPage('/?view=mvp')
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'MSD feature 938 · 1A Additional users' }),
      ).toBeInTheDocument(),
    )

    await user.click(
      screen.getByRole('button', { name: 'MSD feature 938 · 1A Additional users' }),
    )

    const panel = screen.getByRole('complementary', { name: 'MSD feature 938 · 1A' })
    expect(within(panel).getByText(/placed by the PwC features that cite it/i)).toBeInTheDocument()
    expect(within(panel).getByText(/owns no capability/i)).toBeInTheDocument()
  })

  it('jumps from an MSD card to the PwC feature that cites it', async () => {
    const user = userEvent.setup()
    renderPage('/?view=mvp')
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'MSD feature 938 Additional users' }),
      ).toBeInTheDocument(),
    )
    await user.click(screen.getByRole('button', { name: 'MSD feature 938 Additional users' }))

    const panel = screen.getByRole('complementary', { name: 'MSD feature 938' })
    await user.click(within(panel).getByRole('button', { name: /F-001/ }))

    // Back in the feature view, with that feature's panel open.
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Invite employer' })).toBeInTheDocument(),
    )
    expect(url()).not.toContain('view=mvp')
    expect(url()).toContain('selected=F-001')
  })

  it('keeps each view its own selection', async () => {
    const user = userEvent.setup()
    renderPage('/?selected=F-002')
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Verify employer' })).toBeInTheDocument(),
    )

    await openMsdView(user)
    // The PwC panel cannot render here, and no MSD card is selected yet.
    expect(screen.queryByRole('region', { name: 'Verify employer' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'By release' }))
    expect(screen.getByRole('region', { name: 'Verify employer' })).toBeInTheDocument()
  })

  it('filters MSD cards with the same rail', async () => {
    renderPage('/?view=mvp&release=1.4')
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'MSD feature 948 · 1B Verification methods' }),
      ).toBeInTheDocument(),
    )
    expect(screen.getAllByRole('button', { name: /^MSD feature / })).toHaveLength(1)
  })

  it('does not offer to add a PwC feature from an MSD cell', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /^Add a feature to/ }).length).toBeGreaterThan(0),
    )
    await openMsdView(user)
    // The cell would have to invent a release and phase the sources never
    // state for the MSD feature it was opened from.
    expect(screen.queryAllByRole('button', { name: /^Add a feature to/ })).toHaveLength(0)
  })
})

describe('ScopeMap — an empty MSD view names the right filter', () => {
  it('blames the group that emptied this view, not the feature view', async () => {
    // actor=jobseeker matches no capability in the fixture, so no MSD card
    // survives — and the message has to say MSD features, not features.
    renderPage('/?view=mvp&actor=jobseeker')
    await waitFor(() =>
      expect(screen.getByText('No MSD features match these filters.')).toBeInTheDocument(),
    )
    expect(
      screen.getByRole('button', { name: 'Drop Actor filter' }),
    ).toBeInTheDocument()
  })
})

describe('ScopeMap — resolving a conflict from the feature detail panel', () => {
  /** F-002 cites capability 12, whose link (id 102) carries both conflicts. */
  const openF002 = async () => {
    renderPage('/?selected=F-002')
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Verify employer' })).toBeInTheDocument(),
    )
    return screen.getByRole('region', { name: 'Verify employer' })
  }

  it('offers a decision on a capability that conflicts', async () => {
    const panel = await openF002()
    expect(
      within(panel).getByLabelText(/Resolution for Electronic T&Cs acceptance/i),
    ).toBeInTheDocument()
  })

  it('offers none on a capability that agrees', async () => {
    renderPage('/?selected=F-001')
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Invite employer' })).toBeInTheDocument(),
    )
    const panel = screen.getByRole('region', { name: 'Invite employer' })
    // F-001's link 100 has no conflict at all, so there is nothing to decide.
    expect(
      within(panel).queryByLabelText(/Resolution for Invite employer to register/i),
    ).not.toBeInTheDocument()
  })

  it('offers none where the canonical merge already settled the phase', async () => {
    renderPage('/?selected=F-001')
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Invite employer' })).toBeInTheDocument(),
    )
    const panel = screen.getByRole('region', { name: 'Invite employer' })
    // Link 101 is a merged phase conflict: both sides mean the same phase.
    expect(
      within(panel).getByText(/Labelled differently:/i),
    ).toBeInTheDocument()
    expect(
      within(panel).queryByLabelText(/Resolution for Receive secure email invite/i),
    ).not.toBeInTheDocument()
  })

  it('records the decision against the link, not the capability', async () => {
    const user = userEvent.setup()
    const panel = await openF002()

    await user.selectOptions(
      within(panel).getByLabelText(/Resolution for Electronic T&Cs acceptance/i),
      'table_wins',
    )

    await waitFor(() => expect(state.resolved).toHaveLength(1))
    // 102 is the link id; 12 is the capability. Resolving the capability
    // would decide it for every feature citing it.
    expect(state.resolved[0]).toEqual({
      id: 102,
      body: { resolution_state: 'table_wins', resolution_note: null },
    })
  })

  it('saves a note against the decision', async () => {
    const user = userEvent.setup()
    const panel = await openF002()

    const note = within(panel).getByLabelText(/Note for Electronic T&Cs acceptance/i)
    await user.type(note, 'Confirmed with the delivery lead')
    await user.tab()

    await waitFor(() => expect(state.resolved).toHaveLength(1))
    expect(state.resolved[0].body).toEqual({
      resolution_state: 'unreviewed',
      resolution_note: 'Confirmed with the delivery lead',
    })
  })

  it('does not write when the note has not changed', async () => {
    const user = userEvent.setup()
    const panel = await openF002()
    await user.click(within(panel).getByLabelText(/Note for Electronic T&Cs acceptance/i))
    await user.tab()
    expect(state.resolved).toHaveLength(0)
  })

  it('offers to reopen once resolved, and does', async () => {
    const user = userEvent.setup()
    const panel = await openF002()

    await user.selectOptions(
      within(panel).getByLabelText(/Resolution for Electronic T&Cs acceptance/i),
      'both_correct',
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Reopen' })).toBeInTheDocument(),
    )

    await user.click(screen.getByRole('button', { name: 'Reopen' }))
    await waitFor(() => expect(state.resolved).toHaveLength(2))
    expect(state.resolved[1].body).toMatchObject({ resolution_state: 'unreviewed' })
  })

  it('surfaces a rejected decision without losing the panel', async () => {
    const user = userEvent.setup()
    const panel = await openF002()
    state.writeFail = 'That conflict was already resolved by someone else.'

    await user.selectOptions(
      within(panel).getByLabelText(/Resolution for Electronic T&Cs acceptance/i),
      'mapping_wins',
    )

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'That conflict was already resolved by someone else.',
      ),
    )
    expect(screen.getByRole('region', { name: 'Verify employer' })).toBeInTheDocument()
  })

  it('clears the unreviewed badge on the card once decided', async () => {
    const user = userEvent.setup()
    const panel = await openF002()

    // The card carries no aria-label of its own — its select button does —
    // so reach the card through the button.
    const card = () =>
      screen.getByRole('button', { name: /^F-002 / }).closest('article') as HTMLElement

    // F-002's link carries a release and an unmerged phase conflict.
    expect(within(card()).getByTitle('Not yet reviewed')).toHaveTextContent('2 conflicts')

    await user.selectOptions(
      within(panel).getByLabelText(/Resolution for Electronic T&Cs acceptance/i),
      'table_wins',
    )

    // The map badge reads the same resolution state, so deciding here has to
    // reach the card without a reload.
    await waitFor(() =>
      expect(within(card()).queryByTitle('Not yet reviewed')).not.toBeInTheDocument(),
    )
    expect(within(card()).getByText(/2 conflicts · reviewed/)).toBeInTheDocument()
  })
})
