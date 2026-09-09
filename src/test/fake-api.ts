import type { Note } from '@/lib/api-client'

/** Mirrors ApiError's shape without importing the module under mock. */
export class FakeApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * A stateful fake: writes mutate an in-memory store, so a create followed by
 * an invalidate-driven refetch genuinely round-trips. One canned response per
 * path would pass while the wiring is broken.
 */
export function createFakeApi() {
  let notes: Note[] = []
  let nextId = 1
  let failing: string | null = null

  return {
    /** Make every subsequent call fail, as a down server would. */
    failWith(message: string) {
      failing = message
    },
    recover() {
      failing = null
    },
    reset() {
      notes = []
      nextId = 1
      failing = null
    },
    seed(texts: string[]) {
      for (const text of texts) {
        notes = [{ id: nextId++, text, created_at: '2026-01-01 00:00:00' }, ...notes]
      }
    },
    get store(): Note[] {
      return notes
    },
    notes: {
      list: async (): Promise<Note[]> => {
        if (failing) throw new FakeApiError(0, failing)
        return [...notes]
      },
      create: async (text: string): Promise<Note> => {
        if (failing) throw new FakeApiError(0, failing)
        const note: Note = { id: nextId++, text, created_at: '2026-01-01 00:00:00' }
        notes = [note, ...notes]
        return note
      },
    },
  }
}
