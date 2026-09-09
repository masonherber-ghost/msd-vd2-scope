import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
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
      import: { run: async () => ({ status: 'ok', summary: {} as never }) },
    },
  }
})

const { makeScopeGraph } = await import('@/test/scope-fixture')
const ScopeMap = (await import('@/pages/ScopeMap')).default

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return render(<ScopeMap />, { wrapper })
}

beforeEach(() => {
  state.graph = makeScopeGraph()
  state.fail = null
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
