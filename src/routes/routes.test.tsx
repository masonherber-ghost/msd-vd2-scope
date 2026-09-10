import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { Suspense } from 'react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>()
  return {
    ...actual,
    apiClient: {
      ...actual.apiClient,
      scope: { get: async () => (await import('@/test/scope-fixture')).makeScopeGraph() },
    },
  }
})

/** Rebuilds the app's own route table in memory, so this tests the real config. */
async function renderAt(path: string) {
  const { Layout } = await import('@/components/Layout')
  const ScopeMap = (await import('@/pages/ScopeMap')).default
  const NotFound = (await import('@/pages/NotFound')).default

  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <Layout />,
        children: [
          { index: true, element: <ScopeMap />, handle: { fluid: true } },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
    { initialEntries: [path] },
  )

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
        <Suspense fallback={null}>
          <RouterProvider router={router} />
        </Suspense>
    </QueryClientProvider>,
  )
}

describe('routing', () => {
  it('serves the scope map at the root', async () => {
    await renderAt('/')
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: /scope map/i })).toBeInTheDocument(),
    )
  })

  /** Contact and the 404 probe link are gone, but a wrong URL must still 404. */
  it('renders NotFound for an unknown path', async () => {
    await renderAt('/no-such-page')
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: /page not found/i })).toBeInTheDocument(),
    )
  })

  it('renders NotFound for the retired contact path', async () => {
    await renderAt('/contact')
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: /page not found/i })).toBeInTheDocument(),
    )
  })

  it('offers a way back from NotFound', async () => {
    await renderAt('/nope')
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /back to home/i })).toHaveAttribute('href', '/'),
    )
  })
})
