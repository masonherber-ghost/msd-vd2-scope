import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScopeGraph } from '@/lib/api-client'

const { store } = vi.hoisted(() => {
  const graph = { counts: { pwcFeatures: 48 } }
  const session = { uid: 'owner', raw: {} }
  const store = {
    loaded: false,
    load: vi.fn(async () => graph),
    cached: vi.fn(() => graph),
    heldRaw: vi.fn(() => ({ pwcFeatures: [] })),
    reset: vi.fn(),
    // Runs the commit against a fixed session and returns the plan's result,
    // as the real store does.
    write: vi.fn(async (commit: (s: typeof session) => Promise<{ result: unknown }>) =>
      (await commit(session)).result,
    ),
    firestore: {
      features: {
        nextId: vi.fn(() => ({ id: 'F-004' })),
        update: vi.fn(async (_s: unknown, id: string, body: unknown) => ({
          result: { id, ...(body as object) },
        })),
        remove: vi.fn(async () => {
          throw new Error('should be replaced per test')
        }),
      },
    },
  }
  return { store }
})

// The real store starts Firebase; this proves api-client only reaches for it
// when a call is made.
vi.mock('@/lib/scope-store', () => {
  store.loaded = true
  return store
})

const { ApiError, apiClient } = await import('@/lib/api-client')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('api-client', () => {
  it('does not start the data layer just by being imported', () => {
    expect(store.loaded).toBe(false)
    // Nothing is held yet, so there is nothing cached — and no load either.
    expect(apiClient.scope.cached()).toBeUndefined()
    expect(store.loaded).toBe(false)
  })

  it('reads the graph through the store', async () => {
    await expect(apiClient.scope.get()).resolves.toEqual({ counts: { pwcFeatures: 48 } })
    expect(store.load).toHaveBeenCalledOnce()
  })

  it('serves the held graph once loaded, without a read', async () => {
    await apiClient.scope.get()
    store.load.mockClear()

    expect(apiClient.scope.cached()).toEqual({ counts: { pwcFeatures: 48 } } as ScopeGraph)
    expect(store.load).not.toHaveBeenCalled()
  })

  it('routes a write through the queued store write and returns its result', async () => {
    const row = await apiClient.features.update('F-001', { name: 'Renamed' })

    expect(store.write).toHaveBeenCalledOnce()
    expect(store.firestore.features.update).toHaveBeenCalledWith(
      { uid: 'owner', raw: {} },
      'F-001',
      { name: 'Renamed' },
    )
    expect(row).toEqual({ id: 'F-001', name: 'Renamed' })
  })

  it('suggests the next feature id from the held store', async () => {
    await expect(apiClient.features.nextId()).resolves.toEqual({ id: 'F-004' })
    expect(store.load).not.toHaveBeenCalled()
  })

  it("passes the data layer's friendly error through unchanged", async () => {
    store.firestore.features.remove.mockRejectedValueOnce(
      new ApiError(409, 'Cannot delete F-001 — 2 capability links reference it.'),
    )
    await expect(apiClient.features.remove('F-001')).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/cannot delete F-001/i),
    })
  })

  it('forgets the held store on reset', async () => {
    await apiClient.scope.get()
    apiClient.reset()
    expect(store.reset).toHaveBeenCalledOnce()
  })
})
