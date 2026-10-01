import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScopeGraph } from '@/lib/api-client'

const { state } = await vi.hoisted(async () => ({
  state: { graph: null as ScopeGraph | null, fail: null as string | null },
}))

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>()
  return {
    ...actual,
    apiClient: {
      scope: {
        get: async () => {
          if (state.fail) throw new actual.ApiError(0, state.fail)
          return state.graph as ScopeGraph
        },
      },
    },
  }
})

const { makeScopeGraph } = await import('@/test/scope-fixture')
const ScopePrint = (await import('@/pages/ScopePrint')).default

function renderPage(search = '') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/print${search}`]}>
        <ScopePrint />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const sheet = async () => {
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument())
  return screen.getByRole('heading', { level: 1 }).closest('.print-sheet') as HTMLElement
}

beforeEach(() => {
  state.fail = null
  state.graph = makeScopeGraph()
})

describe('ScopePrint — the sheet', () => {
  it('names the map and the view it was taken from', async () => {
    renderPage('?view=mvp')
    const printed = await sheet()
    expect(within(printed).getByRole('heading', { level: 1 })).toHaveTextContent(
      'VD2 package scope map',
    )
    expect(printed).toHaveTextContent('View by MSD feature')
  })

  it('draws the map itself, not a picture of it', async () => {
    renderPage()
    const printed = await sheet()
    // The real grid, so the sheet cannot drift from what the map shows.
    expect(printed.querySelector('.scope-map-grid__table')).not.toBeNull()
    expect(within(printed).getByText('F-001')).toBeInTheDocument()
    expect(within(printed).getByText('Invite employer')).toBeInTheDocument()
  })

  it('offers nothing to click — a sheet is not a place to edit the map', async () => {
    renderPage()
    const printed = await sheet()
    expect(within(printed).queryAllByRole('button')).toHaveLength(0)
  })

  it('carries the key the cards are coloured against', async () => {
    renderPage()
    const printed = await sheet()
    expect(within(printed).getByRole('list', { name: 'Actors' })).toBeInTheDocument()
  })
})

describe('ScopePrint — what the sheet says about itself', () => {
  it('says so when nothing is narrowing the map', async () => {
    renderPage()
    expect(await sheet()).toHaveTextContent('Showing the whole map — no filters applied')
  })

  it('names the narrowing when filters came through the URL', async () => {
    renderPage('?release=1.1')
    const printed = await sheet()
    expect(printed).toHaveTextContent(/Filtered — .*Package 1\.1/)
  })

  it('applies those filters to the cards, not just to the caption', async () => {
    renderPage('?phase=manage-vacancies')
    const printed = await sheet()
    // Both fixture features sit in Access & Onboarding, so narrowing to the
    // other phase has to empty the map rather than print it in full.
    expect(within(printed).queryByText('F-001')).not.toBeInTheDocument()
    expect(within(printed).queryByText('F-002')).not.toBeInTheDocument()
  })

  it('leaves the cards alone when nothing is filtered', async () => {
    renderPage()
    const printed = await sheet()
    expect(within(printed).getByText('F-001')).toBeInTheDocument()
    expect(within(printed).getByText('F-002')).toBeInTheDocument()
  })
})

describe('ScopePrint — printing', () => {
  it('prints through the browser, so the sheet comes out as text', async () => {
    const print = vi.fn()
    vi.stubGlobal('print', print)
    const user = userEvent.setup()
    renderPage()
    await sheet()

    await user.click(screen.getByRole('button', { name: /Print \/ Save as PDF/ }))
    expect(print).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('offers the way back to the map it was taken from', async () => {
    renderPage('?view=mvp&release=1.1')
    await sheet()
    expect(screen.getByRole('link', { name: 'Back to the map' })).toHaveAttribute(
      'href',
      '/?view=mvp&release=1.1',
    )
  })

  it('says the map could not be loaded rather than printing an empty sheet', async () => {
    state.fail = 'Server unreachable'
    renderPage()
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded')
    expect(document.querySelector('.print-sheet')).toBeNull()
  })
})
