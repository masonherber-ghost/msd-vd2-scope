import { FirebaseError } from 'firebase/app'
import {
  collection,
  doc,
  getDocs,
  runTransaction,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore'
import { ApiError, type MoveDirection } from '@/lib/api-client'
import { db as defaultDb } from '@/lib/firebase'
import {
  COLLECTIONS,
  SEQUENCES_DOC,
  utcNow,
  type CollectionKey,
  type RawScope,
  type Sequences,
} from '@/lib/scope-records'
import {
  nextFreeFeatureId,
  planCreateCapability,
  planCreateFeature,
  planCreateMvpFeature,
  planCreatePhase,
  planCreateRelease,
  planDeleteCapability,
  planDeleteFeature,
  planDeleteMvpFeature,
  planDeletePhase,
  planDeleteRelease,
  planMovePhase,
  planResolveConflict,
  planSetFeatureCapabilityLinks,
  planSetFeatureMvpLinks,
  planSetMvpCapabilities,
  planSetMvpPlacement,
  planUpdateCapability,
  planUpdateFeature,
  planUpdateMvpFeature,
  planUpdatePhase,
  planUpdateRelease,
  type Plan,
  type PlanContext,
} from '@/lib/scope-plan'

/**
 * The browser's data layer: Firestore, directly, under `users/{uid}/`.
 *
 * Reads are the whole store in seven collection reads (~400 documents) — the
 * dataset is bounded, so every view derives from it and nothing queries per
 * view. Writes are planned by the pure functions in scope-plan.ts against the
 * cached store, then committed atomically.
 *
 * Every mutation returns its {@link Plan}: `result` is what the matching
 * Express endpoint returned, and `next` is the store with the writes applied,
 * so the caller patches its cache instead of refetching — one commit, one
 * read (the sequence counter), zero refetches.
 */

/** Who is writing, and the store their write is planned against. */
export type Session = { uid: string; raw: RawScope }

const EMPTY_SEQUENCES: Sequences = {
  mvp_features: 0,
  capabilities: 0,
  pwc_feature_capabilities: 0,
}

const userPath = (uid: string) => `users/${uid}`

/** Firestore rejects `undefined`; the store uses `null` for "no value". */
function defined(data: Record<string, unknown>): DocumentData {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined))
}

/**
 * Firebase errors become the same friendly ApiError the Express client threw,
 * so components keep showing a sentence rather than an error code.
 */
function toApiError(error: unknown): unknown {
  if (error instanceof ApiError) return error
  if (error instanceof FirebaseError) {
    if (error.code === 'permission-denied') {
      return new ApiError(403, 'This account does not have access to the scope data.')
    }
    if (error.code === 'unauthenticated') {
      return new ApiError(401, 'Your session has ended. Sign in again.')
    }
    if (error.code === 'unavailable' || error.code === 'deadline-exceeded') {
      return new ApiError(0, 'Cannot reach the database. Check your connection, then try again.')
    }
  }
  return new ApiError(500, 'Something went wrong saving that change.')
}

/**
 * When the counter document is missing, fall back to the highest id in the
 * store. The seed script writes the real AUTOINCREMENT values, which can be
 * higher (SQLite never reuses a deleted id); this only matters for a store
 * that was never seeded.
 */
function sequencesFrom(raw: RawScope, stored: Partial<Sequences> | undefined): Sequences {
  const max = (ids: number[]) => ids.reduce((m, id) => Math.max(m, id), 0)
  return {
    mvp_features: stored?.mvp_features ?? max(raw.mvpFeatures.map((r) => r.id)),
    capabilities: stored?.capabilities ?? max(raw.capabilities.map((r) => r.id)),
    pwc_feature_capabilities:
      stored?.pwc_feature_capabilities ?? max(raw.featureCapabilityLinks.map((r) => r.id)),
  }
}

export function createFirestoreClient(db: Firestore = defaultDb) {
  async function getRaw(uid: string): Promise<RawScope> {
    try {
      const keys = Object.keys(COLLECTIONS) as CollectionKey[]
      const snapshots = await Promise.all(
        keys.map((key) => getDocs(collection(db, userPath(uid), COLLECTIONS[key]))),
      )
      return Object.fromEntries(
        keys.map((key, i) => [key, snapshots[i].docs.map((d) => d.data())]),
      ) as RawScope
    } catch (error) {
      throw toApiError(error)
    }
  }

  /**
   * Plans against the cached store and commits in one transaction. The only
   * read is the AUTOINCREMENT counter, so a create can never hand out an id
   * twice. A planner that throws commits nothing.
   */
  async function commit<T>(
    session: Session,
    planner: (ctx: PlanContext) => Plan<T>,
  ): Promise<Plan<T>> {
    const sequencesRef = doc(db, userPath(session.uid), SEQUENCES_DOC)
    try {
      return await runTransaction(db, async (tx) => {
        const snapshot = await tx.get(sequencesRef)
        const plan = planner({
          raw: session.raw,
          now: utcNow(),
          sequences: sequencesFrom(
            session.raw,
            snapshot.exists() ? (snapshot.data() as Partial<Sequences>) : undefined,
          ),
        })

        for (const write of plan.writes) {
          const ref = doc(db, userPath(session.uid), COLLECTIONS[write.collection], write.id)
          if (write.op === 'set') tx.set(ref, defined(write.data))
          else if (write.op === 'update') tx.update(ref, defined(write.data))
          else tx.delete(ref)
        }
        if (Object.keys(plan.sequences).length > 0) {
          tx.set(sequencesRef, { ...EMPTY_SEQUENCES, ...snapshot.data(), ...plan.sequences })
        }
        return plan
      })
    } catch (error) {
      throw toApiError(error)
    }
  }

  return {
    getRaw,

    features: {
      /** Derived from the cached store — no read. */
      nextId: (raw: RawScope) => ({ id: nextFreeFeatureId(raw) }),
      create: (s: Session, body: unknown) => commit(s, (c) => planCreateFeature(c, body)),
      update: (s: Session, id: string, body: unknown) =>
        commit(s, (c) => planUpdateFeature(c, id, body)),
      setMvpLinks: (s: Session, id: string, mvpFeatureIds: number[]) =>
        commit(s, (c) => planSetFeatureMvpLinks(c, id, mvpFeatureIds)),
      setCapabilityLinks: (s: Session, id: string, capabilityIds: number[]) =>
        commit(s, (c) => planSetFeatureCapabilityLinks(c, id, capabilityIds)),
      remove: (s: Session, id: string, cascade = false) =>
        commit(s, (c) => planDeleteFeature(c, id, cascade)),
    },

    releases: {
      create: (s: Session, body: unknown) => commit(s, (c) => planCreateRelease(c, body)),
      update: (s: Session, id: string, body: unknown) =>
        commit(s, (c) => planUpdateRelease(c, id, body)),
      remove: (s: Session, id: string) => commit(s, (c) => planDeleteRelease(c, id)),
    },

    phases: {
      create: (s: Session, body: unknown) => commit(s, (c) => planCreatePhase(c, body)),
      update: (s: Session, id: string, body: unknown) =>
        commit(s, (c) => planUpdatePhase(c, id, body)),
      move: (s: Session, id: string, direction: MoveDirection) =>
        commit(s, (c) => planMovePhase(c, id, direction)),
      remove: (s: Session, id: string) => commit(s, (c) => planDeletePhase(c, id)),
    },

    mvpFeatures: {
      create: (s: Session, body: unknown) => commit(s, (c) => planCreateMvpFeature(c, body)),
      update: (s: Session, id: number, body: unknown) =>
        commit(s, (c) => planUpdateMvpFeature(c, id, body)),
      setPlacement: (s: Session, id: number, body: unknown) =>
        commit(s, (c) => planSetMvpPlacement(c, id, body)),
      setCapabilities: (s: Session, id: number, capabilityIds: number[]) =>
        commit(s, (c) => planSetMvpCapabilities(c, id, capabilityIds)),
      remove: (s: Session, id: number) => commit(s, (c) => planDeleteMvpFeature(c, id)),
    },

    capabilities: {
      create: (s: Session, body: unknown) => commit(s, (c) => planCreateCapability(c, body)),
      update: (s: Session, id: number, body: unknown) =>
        commit(s, (c) => planUpdateCapability(c, id, body)),
      remove: (s: Session, id: number, cascade = false) =>
        commit(s, (c) => planDeleteCapability(c, id, cascade)),
    },

    conflicts: {
      resolve: (s: Session, id: number, body: unknown) =>
        commit(s, (c) => planResolveConflict(c, id, body)),
    },
  }
}

export type FirestoreClient = ReturnType<typeof createFirestoreClient>
