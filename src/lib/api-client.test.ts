import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiClient } from '@/lib/api-client'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(impl: () => Promise<Response> | never) {
  vi.stubGlobal('fetch', vi.fn(impl))
}

describe('api-client', () => {
  it('returns the parsed graph on success', async () => {
    stubFetch(async () => new Response(JSON.stringify({ counts: { pwcFeatures: 48 } })))
    await expect(apiClient.scope.get()).resolves.toEqual({ counts: { pwcFeatures: 48 } })
  })

  it('reports a network failure as unreachable rather than a status code', async () => {
    stubFetch(() => {
      throw new TypeError('Failed to fetch')
    })

    await expect(apiClient.scope.get()).rejects.toBeInstanceOf(ApiError)
    await expect(apiClient.scope.get()).rejects.toThrow(/cannot reach the server/i)
  })

  it("surfaces the server's own message for a handled 4xx", async () => {
    stubFetch(
      async () =>
        new Response(JSON.stringify({ error: 'No route for GET /scope' }), { status: 404 }),
    )
    await expect(apiClient.scope.get()).rejects.toThrow('No route for GET /scope')
  })

  it('surfaces a drift refusal from the import endpoint', async () => {
    stubFetch(
      async () =>
        new Response(
          JSON.stringify({ error: 'Import aborted — 1 count(s) drifted' }),
          { status: 409 },
        ),
    )
    await expect(apiClient.import.run()).rejects.toThrow(/drifted/)
  })

  it('falls back to a friendly message when a 5xx body is unparseable', async () => {
    // Nothing handled the request — treat it as unreachable, not as "502".
    stubFetch(async () => new Response('<html>502 Bad Gateway</html>', { status: 502 }))
    await expect(apiClient.scope.get()).rejects.toThrow(/cannot reach the server/i)
  })

  it('POSTs to the import endpoint', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ status: 'ok', summary: {} }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await apiClient.import.run()

    const [path, init] = fetchMock.mock.calls[0]
    expect(path).toBe('/api/import')
    expect(init?.method).toBe('POST')
  })
})
