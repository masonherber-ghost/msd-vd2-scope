export type Note = {
  id: number
  text: string
  created_at: string
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const FRIENDLY_UNREACHABLE =
  'Cannot reach the server. Check that it is running, then try again.'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
      ...init,
    })
  } catch {
    // Network-level failure: the server is down or unreachable.
    throw new ApiError(0, FRIENDLY_UNREACHABLE)
  }

  if (!response.ok) {
    // An unparseable body usually means nothing handled the request at all,
    // so treat it as unreachable rather than surfacing a bare status code.
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    throw new ApiError(response.status, body?.error ?? FRIENDLY_UNREACHABLE)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export const apiClient = {
  health: () => request<{ status: string; uptime: number }>('/api/health'),

  notes: {
    list: () => request<Note[]>('/api/notes'),
    create: (text: string) =>
      request<Note>('/api/notes', { method: 'POST', body: JSON.stringify({ text }) }),
  },
}
