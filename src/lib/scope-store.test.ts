// @vitest-environment node
// A real BroadcastChannel: Node has one, jsdom does not.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RawScope } from '@/lib/scope-records'

const { auth, getRaw } = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'owner' } as { uid: string } | null },
  getRaw: vi.fn(),
}))

// The real modules start Firebase on import.
vi.mock('@/lib/firebase', () => ({ auth, db: {} }))
vi.mock('@/lib/firestore-client', () => ({
  createFirestoreClient: () => ({ getRaw }),
}))

const store = await import('@/lib/scope-store')

const T = '2026-10-09 00:00:00'

function rawWith(featureId: string): RawScope {
  return {
    releases: [],
    phases: [],
    pwcFeatures: [
      {
        id: featureId, name: 'Feature', foundational_build: '', release_id: '1.1', phase_id: 'p',
        source_phase_label: null, capability_note: null, question: null, notes: '', notes_edited: 0,
        display_order: 1, source: 'mapping', created_at: T, updated_at: T,
      },
    ],
    mvpFeatures: [],
    capabilities: [],
    featureMvpLinks: [],
    featureCapabilityLinks: [],
  }
}

type Message = { type: string; id?: string; uid?: string; raw?: RawScope }

/** Stands in for another tab of the app on the same channel. */
let otherTab: BroadcastChannel

beforeEach(() => {
  store.reset()
  auth.currentUser = { uid: 'owner' }
  getRaw.mockReset().mockResolvedValue(rawWith('F-001'))
  otherTab = new BroadcastChannel('msd-vd2-scope')
})

afterEach(() => {
  otherTab.close()
})

/** Posts a request as another tab would, and collects what comes back. */
function requestFromOtherTab(uid: string, waitMs = 100): Promise<Message[]> {
  const replies: Message[] = []
  const onMessage = (event: MessageEvent) => {
    const message = event.data as Message
    if (message.type === 'reply') replies.push(message)
  }
  otherTab.addEventListener('message', onMessage)
  otherTab.postMessage({ type: 'request', id: 'r1', uid })
  return new Promise((resolve) =>
    setTimeout(() => {
      otherTab.removeEventListener('message', onMessage)
      resolve(replies)
    }, waitMs),
  )
}

/** Makes the other tab answer every request with this store, as a given user. */
function otherTabHolds(raw: RawScope, uid: string) {
  otherTab.addEventListener('message', (event: MessageEvent) => {
    const message = event.data as Message
    if (message.type === 'request') {
      otherTab.postMessage({ type: 'reply', id: message.id, uid, raw })
    }
  })
}

describe('answering another tab', () => {
  it('hands over the held store to a tab signed in as the same user', async () => {
    await store.load()
    const replies = await requestFromOtherTab('owner')
    expect(replies).toHaveLength(1)
    expect(replies[0]).toMatchObject({ type: 'reply', id: 'r1', uid: 'owner' })
    expect(replies[0].raw?.pwcFeatures[0].id).toBe('F-001')
  })

  it('never answers for a different user', async () => {
    await store.load()
    expect(await requestFromOtherTab('someone-else')).toEqual([])
  })

  it('stays quiet when it holds nothing yet', async () => {
    expect(await requestFromOtherTab('owner')).toEqual([])
  })
})

describe('loadFromOpenTab', () => {
  it('takes the store from an open tab instead of reading Firestore', async () => {
    otherTabHolds(rawWith('F-042'), 'owner')

    const graph = await store.loadFromOpenTab()
    expect(graph.pwcFeatures.map((f) => f.id)).toEqual(['F-042'])
    expect(getRaw).not.toHaveBeenCalled()
    // And holds it, so this tab can answer in turn.
    expect(store.cached()?.pwcFeatures.map((f) => f.id)).toEqual(['F-042'])
  })

  it("ignores another user's store and reads its own", async () => {
    otherTabHolds(rawWith('F-099'), 'someone-else')

    const graph = await store.loadFromOpenTab(50)
    expect(graph.pwcFeatures.map((f) => f.id)).toEqual(['F-001'])
    expect(getRaw).toHaveBeenCalledOnce()
  })

  it('reads Firestore when no tab answers in time', async () => {
    const graph = await store.loadFromOpenTab(50)
    expect(graph.pwcFeatures.map((f) => f.id)).toEqual(['F-001'])
    expect(getRaw).toHaveBeenCalledWith('owner')
  })
})
