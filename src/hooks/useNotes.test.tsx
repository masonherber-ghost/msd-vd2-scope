import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Hoisted above the vi.mock factory below, which needs it at module-eval time.
const { fake } = await vi.hoisted(async () => {
  const { createFakeApi } = await import('@/test/fake-api')
  return { fake: createFakeApi() }
})

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>()
  return { ...actual, apiClient: { notes: fake.notes } }
})

const { useCreateNote, useNotes } = await import('@/hooks/useNotes')

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

beforeEach(() => {
  fake.reset()
})

describe('useNotes', () => {
  it('exposes the notes returned by the API', async () => {
    fake.seed(['alpha', 'beta'])

    const { result } = renderHook(() => useNotes(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.map((n) => n.text)).toEqual(['beta', 'alpha'])
  })

  it('surfaces a friendly message when the server is unreachable', async () => {
    fake.failWith('Cannot reach the server. Check that it is running, then try again.')

    const { result } = renderHook(() => useNotes(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toContain('Cannot reach the server')
    // A friendly sentence, not a bare status code.
    expect(result.current.error?.message).not.toMatch(/^\d{3}$/)
  })
})

describe('useCreateNote', () => {
  it('creates a note and the list reflects it after invalidation', async () => {
    // Both hooks share one QueryClient, so the invalidate must drive the refetch.
    const wrapper = makeWrapper()
    const { result } = renderHook(
      () => ({ list: useNotes(), create: useCreateNote() }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))
    expect(result.current.list.data).toHaveLength(0)

    await act(async () => {
      await result.current.create.mutateAsync('a new note')
    })

    await waitFor(() => {
      expect(result.current.list.data?.map((n) => n.text)).toEqual(['a new note'])
    })
  })

  it('reports an error without adding anything to the store', async () => {
    fake.failWith('Cannot reach the server. Check that it is running, then try again.')

    const { result } = renderHook(() => useCreateNote(), { wrapper: makeWrapper() })

    await act(async () => {
      await result.current.mutateAsync('doomed').catch(() => undefined)
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(fake.store).toHaveLength(0)
  })
})
