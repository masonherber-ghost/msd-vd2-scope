import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiClient } from '@/lib/api-client'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(impl: () => Promise<Response> | never) {
  vi.stubGlobal('fetch', vi.fn(impl))
}

describe('api-client', () => {
  it('returns parsed JSON on success', async () => {
    stubFetch(async () => new Response(JSON.stringify([{ id: 1, text: 'a' }]), { status: 200 }))
    await expect(apiClient.notes.list()).resolves.toEqual([{ id: 1, text: 'a' }])
  })

  it('reports a network failure as unreachable rather than a status code', async () => {
    stubFetch(() => {
      throw new TypeError('Failed to fetch')
    })

    await expect(apiClient.notes.list()).rejects.toBeInstanceOf(ApiError)
    await expect(apiClient.notes.list()).rejects.toThrow(/cannot reach the server/i)
  })

  it("surfaces the server's own message for a handled 4xx", async () => {
    stubFetch(
      async () =>
        new Response(JSON.stringify({ error: 'A note needs some text.' }), { status: 400 }),
    )

    await expect(apiClient.notes.create('')).rejects.toThrow('A note needs some text.')
  })

  it('falls back to a friendly message when a 5xx body is unparseable', async () => {
    // Nothing handled the request — treat it as unreachable, not as "500".
    stubFetch(async () => new Response('<html>502 Bad Gateway</html>', { status: 502 }))

    await expect(apiClient.notes.list()).rejects.toThrow(/cannot reach the server/i)
  })

  it('sends the note text as JSON', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ id: 1, text: 'hi' }), { status: 201 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await apiClient.notes.create('hi')

    const [path, init] = fetchMock.mock.calls[0]
    expect(path).toBe('/api/notes')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(init?.body as string)).toEqual({ text: 'hi' })
  })
})
