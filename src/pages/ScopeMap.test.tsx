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
        remove: async (id: string, cascade: boolean) => {
          failWrite()
          state.deleted.push({ id, cascade })
          return {
            deleted: 1,
            cascaded: { assumptions: 0, mvpLinks: 0, capabilityLinks: 0 },
          }
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

beforeEach(() => {
  state.graph = makeScopeGraph()
  state.fail = null
  state.writeFail = null
  state.nextId = 'F-004'
  state.created = []
  state.patched = []
  state.deleted = []
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
    expect(screen.getByText(/an empty cell means nothing in that phase/i)).toBeInTheDocument()
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
  it('is always visible, never behind a toggle (R-8.8)', async () => {
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))
    expect(screen.getByRole('complementary', { name: 'Filters' })).toBeInTheDocument()
  })

  it('offers every filter group', async () => {
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))
    for (const group of [
      'Release',
      'Phase',
      'Actor',
      'MVP feature',
      'Scope option',
      'Conflict state',
      'Source',
    ]) {
      expect(screen.getByRole('group', { name: new RegExp(group, 'i') })).toBeInTheDocument()
    }
  })

  it('writes the selected filter into the URL (R-10.2)', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))

    const release = screen.getByRole('group', { name: /release/i })
    await user.click(within(release).getByRole('checkbox', { name: /Release 1\.4/ }))

    await waitFor(() => expect(url()).toContain('release=1.4'))
  })

  it('reproduces a view from the URL alone', async () => {
    renderPage('/?actor=staff')
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))

    // Only F-001 cites a staff capability.
    expect(screen.getByLabelText('F-001 Invite employer')).toBeInTheDocument()
    expect(screen.queryByLabelText('F-002 Verify employer')).not.toBeInTheDocument()
    const actor = screen.getByRole('group', { name: /actor/i })
    expect(within(actor).getByRole('checkbox', { name: /Staff/ })).toBeChecked()
  })

  it('reports how many features survive the filters', async () => {
    renderPage('/?actor=staff')
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))

    // The count is interpolated, so it spans several text nodes.
    const rail = screen.getByRole('complementary', { name: 'Filters' })
    expect(rail).toHaveTextContent('1 of 2 features')
  })

  it('shows a live count on each control (R-8.9)', async () => {
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))

    const release = screen.getByRole('group', { name: /release/i })
    // Release 1.1 holds both features; 1.4 holds none.
    expect(within(release).getByText('Release 1.1').closest('label')).toHaveTextContent('2')
    expect(within(release).getByText('Release 1.4').closest('label')).toHaveTextContent('0')
  })

  it('clears everything with one control', async () => {
    const user = userEvent.setup()
    renderPage('/?actor=staff&release=1.1')
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))

    await user.click(screen.getByRole('button', { name: /clear all/i }))

    await waitFor(() => expect(url()).not.toContain('actor'))
    expect(url()).not.toContain('release')
    expect(screen.getByLabelText('F-002 Verify employer')).toBeInTheDocument()
  })

  it('disables clear-all when nothing is filtered', async () => {
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('cell')).toHaveLength(4))
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

  it('an MVP chip pivots the map without closing the panel (R-8.16)', async () => {
    const user = userEvent.setup()
    renderPage('/?selected=F-002')
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Verify employer' })).toBeInTheDocument(),
    )

    await user.click(screen.getByRole('button', { name: /948/ }))

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
      screen.getByRole('button', { name: 'Add a feature to Manage Vacancies, Release 1.4' }),
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
      screen.getByRole('button', { name: 'Add a feature to Manage Vacancies, Release 1.4' }),
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
      screen.getByRole('button', { name: 'Add a feature to Manage Vacancies, Release 1.4' }),
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
      screen.getByRole('button', { name: 'Add a feature to Manage Vacancies, Release 1.4' }),
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
      screen.getByRole('button', { name: 'Add a feature to Manage Vacancies, Release 1.4' }),
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
