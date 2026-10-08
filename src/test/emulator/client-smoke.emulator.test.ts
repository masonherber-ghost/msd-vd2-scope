import fs from 'node:fs'
import path from 'node:path'
import { deleteApp, getApps, initializeApp as initializeAdmin } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore'
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type {
  RawScope,
  StoredCapability,
  StoredFeatureCapabilityLink,
  StoredPwcFeature,
} from '@/lib/scope-records'

/**
 * SMOKE: the browser's real data path — Web SDK, signed in, rules enforced,
 * no server — against the emulators. Unit tests and the oracle run through
 * pure functions or the Admin SDK, which bypasses rules; none of them prove
 * the browser can read anything. This does.
 *
 *   npm run test:smoke
 */

const PROJECT_ID = 'vd2-scope'
const rules = fs.readFileSync(path.resolve(import.meta.dirname, '../../../firestore.rules'), 'utf8')
// The emulator user is created with the pinned production UID — an emulator
// minting its own UID is the classic "sign-in works, every read is denied".
const OWNER_UID = /uid == '([^']+)'/.exec(rules)![1]
const OWNER = { email: 'owner@example.com', password: 'owner-password' }
const OTHER = { email: 'other@example.com', password: 'other-password' }

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'

const T = '2026-09-11 00:00:00'
const TIMESTAMP = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/

function feature(id: string, release_id: string, phase_id: string): StoredPwcFeature {
  return {
    id, name: `Feature ${id}`, foundational_build: '', release_id, phase_id,
    source_phase_label: 'Alpha', capability_note: null, question: null, notes: '',
    notes_edited: 0, display_order: Number(id.slice(2)), source: 'mapping', created_at: T, updated_at: T,
  }
}

function capability(id: number, mvp_feature_id: number, release_id: string): StoredCapability {
  return {
    id, mvp_feature_id, mvp_ref: 100 + mvp_feature_id, mvp_owner_ambiguous: 0, text: `Capability ${id}`,
    actor: 'staff', release_id, phase_id: 'alpha', source_phase_label: 'Alpha', question: null,
    source: 'sequencing', source_text: `Capability ${id}`, created_at: T, updated_at: T,
  }
}

function link(id: number, pwc_feature_id: string, capability_id: number, removed = false): StoredFeatureCapabilityLink {
  return {
    id, pwc_feature_id, capability_id, source_citations: 1, matched: 1, release_conflict: 0,
    phase_conflict: 0, feature_release_id: null, capability_release_id: null, feature_phase_label: null,
    capability_phase_label: null, phase_conflict_merged: 0, resolution_state: 'unreviewed',
    resolution_note: null, resolved_at: null, source: 'mapping', created_at: T, updated_at: T,
    removed_at: removed ? T : null,
  }
}

const SEED: RawScope = {
  releases: [
    { id: '1.1', label: 'Package 1.1', name: '', description: '', display_order: 1, in_mapping_source: 1, in_sequencing_source: 1, source: 'both', created_at: T, updated_at: T },
    { id: '2', label: 'Package 2', name: '', description: '', display_order: 2, in_mapping_source: 1, in_sequencing_source: 1, source: 'both', created_at: T, updated_at: T },
  ],
  phases: [
    { id: 'alpha', name: 'Alpha', epic_ref: '1', epic_description: '', display_order: 1, source: 'mapping', created_at: T, updated_at: T },
    { id: 'beta', name: 'Beta', epic_ref: '2', epic_description: '', display_order: 2, source: 'mapping', created_at: T, updated_at: T },
  ],
  pwcFeatures: [feature('F-001', '1.1', 'alpha'), feature('F-002', '1.1', 'alpha')],
  mvpFeatures: [
    { id: 1, ref: 101, scope_option: null, title: 'MVP one', release_id: null, phase_id: null, question: null, details: '', source: 'mapping', created_at: T, updated_at: T },
    { id: 2, ref: 102, scope_option: null, title: 'MVP two', release_id: null, phase_id: null, question: null, details: '', source: 'mapping', created_at: T, updated_at: T },
  ],
  capabilities: [capability(1, 1, '1.1'), capability(2, 1, '1.1'), capability(3, 2, '2')],
  featureMvpLinks: [
    { pwc_feature_id: 'F-001', mvp_feature_id: 1, source: 'mapping', created_at: T, updated_at: T, removed_at: null },
  ],
  featureCapabilityLinks: [link(1, 'F-001', 1), link(2, 'F-001', 2), link(3, 'F-002', 3, true)],
}

// Counters ahead of the max ids, as SQLite's are: a new id must come from them.
const SEQUENCES = { mvp_features: 10, capabilities: 20, pwc_feature_capabilities: 30 }

const COLLECTIONS = {
  releases: 'releases', phases: 'phases', pwcFeatures: 'pwc_features', mvpFeatures: 'mvp_features',
  capabilities: 'capabilities', featureMvpLinks: 'pwc_feature_mvp_features',
  featureCapabilityLinks: 'pwc_feature_capabilities',
} as const

async function clearEmulators() {
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' })
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: 'DELETE' })
}

beforeAll(async () => {
  await clearEmulators()
  const admin = initializeAdmin({ projectId: PROJECT_ID }, 'smoke-admin')
  await getAdminAuth(admin).createUser({ uid: OWNER_UID, ...OWNER })
  const store = getAdminFirestore(admin)
  const batch = store.batch()
  for (const [key, name] of Object.entries(COLLECTIONS)) {
    for (const row of SEED[key as keyof RawScope] as Record<string, unknown>[]) {
      const id = key === 'featureMvpLinks' ? `${row.pwc_feature_id}__${row.mvp_feature_id}` : String(row.id)
      batch.set(store.doc(`users/${OWNER_UID}/${name}/${id}`), row)
    }
  }
  batch.set(store.doc(`users/${OWNER_UID}/meta/sequences`), SEQUENCES)
  await batch.commit()
  await deleteApp(admin)
})

afterAll(async () => {
  for (const app of getApps()) await deleteApp(app)
})

const { auth, db } = await import('@/lib/firebase')
const { apiClient } = await import('@/lib/api-client')
const { createFirestoreClient } = await import('@/lib/firestore-client')
const { deriveScopeGraph } = await import('@/lib/scope-graph')

/** What Firestore actually holds — read fresh, bypassing the held store. */
const freshRaw = () => createFirestoreClient(db).getRaw(OWNER_UID)

describe('smoke — the browser data path against the emulators', () => {
  it('signs in as the pinned owner and reads every collection through the rules', async () => {
    const { user } = await signInWithEmailAndPassword(auth, OWNER.email, OWNER.password)
    expect(user.uid).toBe(OWNER_UID)

    const graph = await apiClient.scope.get()
    expect(graph.counts).toMatchObject({
      releases: 2, phases: 2, pwcFeatures: 2, mvpFeatures: 2, capabilities: 3,
      featureMvpLinks: 1,
      // The tombstoned link is stored but is not a link.
      featureCapabilityEdges: 2,
    })
    expect(graph.capabilities[0]).not.toHaveProperty('source_text')
  })

  it('round-trips a write in the stored field shapes', async () => {
    await apiClient.features.update('F-001', { notes: 'Checked against the table' })

    const stored = (await getDoc(doc(db, `users/${OWNER_UID}/pwc_features/F-001`))).data()!
    expect(stored).toMatchObject({ notes: 'Checked against the table', notes_edited: 1, source: 'mapping' })
    // 0/1 integers and SQLite-format UTC strings — never booleans or Timestamps.
    expect(typeof stored.notes_edited).toBe('number')
    expect(stored.updated_at).toMatch(TIMESTAMP)
    expect(stored.updated_at).not.toBe(T)
  })

  it('takes a new id from the counter, not from the max id, and advances it', async () => {
    const row = await apiClient.capabilities.create({
      mvp_ref: 102, text: 'A smoke capability', actor: 'system', release_id: '2', phase_id: 'beta',
    })
    expect(row.id).toBe(SEQUENCES.capabilities + 1)
    // Exactly one record with ref 102, so it is attached to it.
    expect(row.mvp_feature_id).toBe(2)

    const sequences = (await getDoc(doc(db, `users/${OWNER_UID}/meta/sequences`))).data()
    expect(sequences).toMatchObject({ capabilities: SEQUENCES.capabilities + 1 })
  })

  it('moves a capability and re-judges every link to it in the same commit', async () => {
    await apiClient.capabilities.update(1, { release_id: '2' })
    const raw = await freshRaw()
    const moved = raw.featureCapabilityLinks.find((l) => l.id === 1)!
    expect(moved).toMatchObject({ release_conflict: 1, feature_release_id: '1.1', capability_release_id: '2' })
  })

  it('refuses a guarded delete with the friendly message, and writes nothing', async () => {
    const before = await freshRaw()
    await expect(apiClient.capabilities.remove(2)).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/cite it\. Confirm the cascade/),
    })
    expect(await freshRaw()).toEqual(before)
  })

  it('cascades a confirmed delete, tombstones included', async () => {
    await apiClient.features.remove('F-002', true)
    const raw = await freshRaw()
    expect(raw.pwcFeatures.map((f) => f.id)).toEqual(['F-001'])
    expect(raw.featureCapabilityLinks.some((l) => l.pwc_feature_id === 'F-002')).toBe(false)
  })

  it('tombstones a removed link and revives it, through the inequality the derive filters on', async () => {
    await apiClient.features.setCapabilityLinks('F-001', [1])
    let raw = await freshRaw()
    expect(raw.featureCapabilityLinks.find((l) => l.id === 2)?.removed_at).toMatch(TIMESTAMP)

    await apiClient.features.setCapabilityLinks('F-001', [1, 2])
    raw = await freshRaw()
    expect(raw.featureCapabilityLinks.find((l) => l.id === 2)?.removed_at).toBeNull()
  })

  it('holds exactly what Firestore holds after every write — so skipping the refetch is safe', async () => {
    const held = apiClient.scope.cached()
    expect(held).toBeDefined()
    expect(held).toEqual(deriveScopeGraph(await freshRaw()))
  })

  it('denies another signed-in account, with the friendly message', async () => {
    await signOut(auth)
    await createUserWithEmailAndPassword(auth, OTHER.email, OTHER.password)
    expect(auth.currentUser?.uid).not.toBe(OWNER_UID)

    // The held store belongs to the owner; it is not served to anyone else.
    expect(apiClient.scope.cached()).toBeUndefined()
    await expect(
      getDocs(collection(db, `users/${OWNER_UID}/pwc_features`)),
    ).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(apiClient.scope.get()).rejects.toMatchObject({
      status: 403,
      message: expect.stringMatching(/does not have access/),
    })
  })

  it('denies a signed-out session', async () => {
    await signOut(auth)
    await expect(apiClient.scope.get()).rejects.toMatchObject({ status: 401 })
  })
})
