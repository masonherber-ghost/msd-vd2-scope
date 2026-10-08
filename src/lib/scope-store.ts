import { ApiError, type ScopeGraph } from '@/lib/api-client'
import { auth } from '@/lib/firebase'
import { createFirestoreClient, type Session } from '@/lib/firestore-client'
import { deriveScopeGraph } from '@/lib/scope-graph'
import type { Plan } from '@/lib/scope-plan'
import type { RawScope } from '@/lib/scope-records'

/**
 * The signed-in user's store, held in memory between the one read and every
 * write after it.
 *
 * `load()` is the only read — seven collection reads, ~400 documents. Each
 * write is planned against the held store, committed, and the held store
 * becomes the plan's result, so the graph after a write is derived locally
 * instead of re-read: one commit, zero refetches.
 *
 * Writes run one at a time, each planned against the store the previous one
 * left — two quick edits never plan against the same stale snapshot.
 *
 * Single owner, so the held store is the truth until another device writes;
 * a reload picks that up.
 */

const client = createFirestoreClient()

let held: Session | null = null
let queue: Promise<unknown> = Promise.resolve()

function currentUid(): string {
  const uid = auth.currentUser?.uid
  if (!uid) throw new ApiError(401, 'Your session has ended. Sign in again.')
  return uid
}

export async function load(): Promise<ScopeGraph> {
  const uid = currentUid()
  const raw = await client.getRaw(uid)
  held = { uid, raw }
  return deriveScopeGraph(raw)
}

/** The graph as of the last load or write, for the signed-in user only. */
export function cached(): ScopeGraph | undefined {
  if (!held || held.uid !== auth.currentUser?.uid) return undefined
  return deriveScopeGraph(held.raw)
}

/** The held store, loading it first if this user has none yet. */
async function session(): Promise<Session> {
  const uid = currentUid()
  if (!held || held.uid !== uid) await load()
  return held!
}

export function heldRaw(): RawScope | undefined {
  return held && held.uid === auth.currentUser?.uid ? held.raw : undefined
}

/** Commits one write after any already in flight, and keeps its result. */
export function write<T>(commit: (session: Session) => Promise<Plan<T>>): Promise<T> {
  const run = queue.then(async () => {
    const current = await session()
    const plan = await commit(current)
    held = { uid: current.uid, raw: plan.next }
    return plan.result
  })
  // A failed write must not block the ones after it.
  queue = run.catch(() => undefined)
  return run
}

export const firestore = client

/** Forget everything — on sign-out, so the next account starts clean. */
export function reset(): void {
  held = null
}
