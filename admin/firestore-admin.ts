import fs from 'node:fs'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { fileURLToPath } from 'node:url'
import { cert, initializeApp } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import {
  COLLECTIONS,
  SEQUENCES_DOC,
  docId,
  type CollectionKey,
  type RawScope,
  type Sequences,
} from '../src/lib/scope-records.js'

/**
 * Admin SDK plumbing shared by the admin scripts. Bypasses security rules —
 * see README.md.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const SERVICE_ACCOUNT = path.join(here, 'service-account.json')
const RULES = path.join(here, '..', 'firestore.rules')
export const PROJECT_ID = 'vd2-scope'

export const KEYS = Object.keys(COLLECTIONS) as CollectionKey[]

export function fail(message: string): never {
  console.error(`[admin] ${message}`)
  process.exit(1)
}

/** The single owner, read from the deployed rules so the two cannot drift. */
export function ownerUid(): string {
  const uid = /uid == '([^']+)'/.exec(fs.readFileSync(RULES, 'utf8'))?.[1]
  if (!uid) fail('No owner UID pinned in firestore.rules.')
  return uid
}

/** Production uses admin/service-account.json; `emulator` needs no key. */
export function connect(emulator: boolean): { firestore: Firestore; target: string } {
  if (emulator) {
    process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080'
    initializeApp({ projectId: PROJECT_ID })
    return { firestore: getFirestore(), target: `emulator ${process.env.FIRESTORE_EMULATOR_HOST}` }
  }
  if (!fs.existsSync(SERVICE_ACCOUNT)) {
    fail(`No service account key at ${SERVICE_ACCOUNT}. See admin/README.md.`)
  }
  initializeApp({
    credential: cert(JSON.parse(fs.readFileSync(SERVICE_ACCOUNT, 'utf8'))),
    projectId: PROJECT_ID,
  })
  return { firestore: getFirestore(), target: PROJECT_ID }
}

const EMPTY_SEQUENCES: Sequences = {
  mvp_features: 0,
  capabilities: 0,
  pwc_feature_capabilities: 0,
}

/** The whole store and its counters — the same seven reads the app makes. */
export async function readStore(
  firestore: Firestore,
  uid: string,
): Promise<{ raw: RawScope; sequences: Sequences }> {
  const user = firestore.doc(`users/${uid}`)
  const snapshots = await Promise.all(KEYS.map((key) => user.collection(COLLECTIONS[key]).get()))
  const raw = Object.fromEntries(
    KEYS.map((key, i) => [key, snapshots[i].docs.map((d) => d.data())]),
  ) as RawScope
  const counters = (await firestore.doc(`users/${uid}/${SEQUENCES_DOC}`).get()).data()
  return { raw, sequences: { ...EMPTY_SEQUENCES, ...counters } }
}

export type StoreDiff = {
  key: CollectionKey
  set: { id: string; data: Record<string, unknown> }[]
  remove: string[]
}[]

/** Per document: new or changed → set the whole row; gone → delete. */
export function diffStores(before: RawScope, after: RawScope): StoreDiff {
  return KEYS.map((key) => {
    const id = docId[key] as (row: unknown) => string
    const old = new Map((before[key] as Record<string, unknown>[]).map((row) => [id(row), row]))
    const next = new Map((after[key] as Record<string, unknown>[]).map((row) => [id(row), row]))
    return {
      key,
      set: [...next]
        .filter(([docKey, row]) => !isDeepStrictEqual(old.get(docKey), row))
        .map(([docKey, data]) => ({ id: docKey, data })),
      remove: [...old.keys()].filter((docKey) => !next.has(docKey)),
    }
  })
}

/**
 * The store with every timestamp-only change undone. The import refreshes
 * `updated_at` on each row it upserts — as the SQLite UPSERT did — so a
 * re-run with nothing new would otherwise rewrite hundreds of documents.
 * Nothing in the app reads `updated_at`; keeping it meaning "content last
 * changed" costs nothing and saves the writes.
 */
export function withoutTimestampOnlyChanges(before: RawScope, after: RawScope): RawScope {
  return Object.fromEntries(
    KEYS.map((key) => {
      const id = docId[key] as (row: unknown) => string
      const old = new Map((before[key] as Record<string, unknown>[]).map((row) => [id(row), row]))
      return [
        key,
        (after[key] as Record<string, unknown>[]).map((row) => {
          const prior = old.get(id(row))
          if (!prior) return row
          return isDeepStrictEqual({ ...row, updated_at: prior.updated_at }, prior) ? prior : row
        }),
      ]
    }),
  ) as RawScope
}

export const diffSize = (diff: StoreDiff) =>
  diff.reduce((n, d) => n + d.set.length + d.remove.length, 0)

/**
 * Commits a diff in batches of 500 — Firestore's limit per batch. A diff that
 * fits in one batch is atomic; a larger one is not, but every script here is
 * idempotent, so re-running after a failure converges.
 */
export async function commitDiff(
  firestore: Firestore,
  uid: string,
  diff: StoreDiff,
  sequences?: Sequences,
): Promise<void> {
  const user = firestore.doc(`users/${uid}`)
  const ops: ((batch: FirebaseFirestore.WriteBatch) => void)[] = []
  for (const { key, set, remove } of diff) {
    const col = user.collection(COLLECTIONS[key])
    for (const { id, data } of set) ops.push((b) => b.set(col.doc(id), data))
    for (const id of remove) ops.push((b) => b.delete(col.doc(id)))
  }
  if (sequences) {
    ops.push((b) => b.set(firestore.doc(`users/${uid}/${SEQUENCES_DOC}`), sequences))
  }
  for (let i = 0; i < ops.length; i += 500) {
    const batch = firestore.batch()
    for (const op of ops.slice(i, i + 500)) op(batch)
    await batch.commit()
  }
}

/** Reads the store back and fails loudly unless it is exactly `expected`. */
export async function verifyStore(firestore: Firestore, uid: string, expected: RawScope) {
  const { raw } = await readStore(firestore, uid)
  const remaining = diffSize(diffStores(raw, expected))
  if (remaining > 0) fail(`Verification failed: ${remaining} document(s) differ from what was planned.`)
}
