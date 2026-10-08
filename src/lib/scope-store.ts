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

// ---------------------------------------------------------------------------
// Sharing the held store with another tab of the app
// ---------------------------------------------------------------------------
//
// A tab opened from this one (the print view) starts with an empty cache, so
// it would read the whole store again — ~400 billed reads for data the
// opening tab already holds. Instead it asks over a BroadcastChannel; any open
// tab holding the same user's store answers with it. Same-origin only, never
// written to disk, and a tab only answers for the user it is signed in as.

const CHANNEL_NAME = 'msd-vd2-scope'

type ChannelMessage =
  | { type: 'request'; id: string; uid: string }
  | { type: 'reply'; id: string; uid: string; raw: RawScope }

let channel: BroadcastChannel | null = null

function shareChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME)
    channel.addEventListener('message', (event: MessageEvent) => {
      const message = event.data as ChannelMessage | undefined
      if (message?.type !== 'request') return
      // Only this tab's own user, and only once something is held.
      if (!held || held.uid !== message.uid || held.uid !== auth.currentUser?.uid) return
      channel!.postMessage({
        type: 'reply',
        id: message.id,
        uid: held.uid,
        raw: held.raw,
      } satisfies ChannelMessage)
    })
  }
  return channel
}

// Listening from the moment the store is first used, so the tab that opens
// the print view is always ready to answer.
shareChannel()

/** Asks the other open tabs for this user's store; null if none answers in time. */
function askOpenTabs(uid: string, timeoutMs: number): Promise<RawScope | null> {
  const ch = shareChannel()
  if (!ch) return Promise.resolve(null)
  const id = crypto.randomUUID()
  return new Promise((resolve) => {
    const done = (raw: RawScope | null) => {
      clearTimeout(timer)
      ch.removeEventListener('message', onMessage)
      resolve(raw)
    }
    const onMessage = (event: MessageEvent) => {
      const message = event.data as ChannelMessage | undefined
      if (message?.type === 'reply' && message.id === id && message.uid === uid) done(message.raw)
    }
    const timer = setTimeout(() => done(null), timeoutMs)
    ch.addEventListener('message', onMessage)
    ch.postMessage({ type: 'request', id, uid } satisfies ChannelMessage)
  })
}

/**
 * The graph from another open tab of the app when one holds it — zero reads —
 * otherwise the normal load. For a tab opened from the app (the print view),
 * whose opener is still open and is showing exactly what should be printed.
 */
export async function loadFromOpenTab(timeoutMs = 500): Promise<ScopeGraph> {
  const uid = currentUid()
  const raw = await askOpenTabs(uid, timeoutMs)
  if (!raw) return load()
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
