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
      },
      import: {
        run: async () => {
          // A re-import changes what the next graph read returns.
          state.counts = { pwcFeatures: 49, capabilities: 107 }
          return { status: 'ok', summary: {} as never }
        },
      },
    },
  }
})

const { useRunImport, useScope } = await import('@/hooks/useScope')

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

beforeEach(() => {
  state.calls = 0
  state.fail = null
  state.counts = { pwcFeatures: 48, capabilities: 107 }
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

describe('useRunImport', () => {
  it('invalidates the graph so the new counts appear', async () => {
    const wrapper = makeWrapper()
    const { result } = renderHook(
      () => ({ scope: useScope(), run: useRunImport() }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.scope.isSuccess).toBe(true))
    expect(result.current.scope.data?.counts.pwcFeatures).toBe(48)

    await act(async () => {
      await result.current.run.mutateAsync()
    })

    await waitFor(() => {
      expect(result.current.scope.data?.counts.pwcFeatures).toBe(49)
    })
  })
})
