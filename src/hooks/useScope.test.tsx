import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScopeGraph } from '@/lib/api-client'

const { state } = await vi.hoisted(async () => ({
  state: {
    calls: 0,
    fail: null as string | null,
    counts: { pwcFeatures: 48, capabilities: 107 },
    // What the data layer holds after a write; undefined before any load.
    held: undefined as ScopeGraph | undefined,
  },
}))

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>()
  return {
    ...actual,
    apiClient: {
      scope: {
        get: async () => {
          state.calls += 1
          if (state.fail) throw new actual.ApiError(0, state.fail)
          return { counts: { ...state.counts } } as unknown as ScopeGraph
        },
        cached: () => state.held,
      },
    },
  }
})

const { syncScopeAfterWrite, useScope } = await import('@/hooks/useScope')

function makeWrapper(
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  }),
) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

beforeEach(() => {
  state.calls = 0
  state.fail = null
  state.counts = { pwcFeatures: 48, capabilities: 107 }
  state.held = undefined
})

describe('useScope', () => {
  it('exposes the graph counts', async () => {
    const { result } = renderHook(() => useScope(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.counts.pwcFeatures).toBe(48)
  })

  it('reads the graph once, not once per view', async () => {
    const wrapper = makeWrapper()
    const { result } = renderHook(
      () => ({ a: useScope(), b: useScope(), c: useScope() }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.a.isSuccess).toBe(true))
    expect(state.calls).toBe(1)
  })

  it('surfaces a friendly message when the server is unreachable', async () => {
    state.fail = 'Cannot reach the server. Check that it is running, then try again.'
    const { result } = renderHook(() => useScope(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toMatch(/cannot reach the server/i)
  })
})

describe('syncScopeAfterWrite', () => {
  it('puts the graph a write produced into the cache without a read', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result } = renderHook(() => useScope(), { wrapper: makeWrapper(queryClient) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    // Read as a component would; the query only re-renders for what is read.
    expect(result.current.data?.counts.pwcFeatures).toBe(48)
    expect(state.calls).toBe(1)

    state.held = { counts: { pwcFeatures: 49, capabilities: 107 } } as unknown as ScopeGraph
    act(() => syncScopeAfterWrite(queryClient))

    await waitFor(() => expect(result.current.data?.counts.pwcFeatures).toBe(49))
    // Every view sees the write, and the whole store was not read again.
    expect(state.calls).toBe(1)
  })

  it('falls back to one refetch when nothing is held yet', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result } = renderHook(() => useScope(), { wrapper: makeWrapper(queryClient) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.counts.pwcFeatures).toBe(48)

    state.counts = { pwcFeatures: 50, capabilities: 107 }
    act(() => syncScopeAfterWrite(queryClient))

    await waitFor(() => expect(result.current.data?.counts.pwcFeatures).toBe(50))
    expect(state.calls).toBe(2)
  })

  it('does not re-read the store when the window regains focus', async () => {
    const { result } = renderHook(() => useScope(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    act(() => {
      window.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('focus'))
    })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(state.calls).toBe(1)
  })
})
