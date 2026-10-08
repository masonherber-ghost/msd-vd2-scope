import fs from 'node:fs'
import path from 'node:path'
import { isDeepStrictEqual, parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { cert, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import {
  COLLECTIONS,
  SEQUENCES_DOC,
  docId,
  type CollectionKey,
} from '../src/lib/scope-records.js'
import { exportRawScope, exportSequences } from './sqlite-export.js'

/**
 * ONE-TIME SEED: copies the SQLite database into Firestore under
 * users/{uid}/, verbatim, then reads every document back and compares.
 *
 *   npx tsx admin/seed-firestore.ts --uid <UID> --emulator   # dry run, local
 *   npx tsx admin/seed-firestore.ts --uid <UID>              # production
 *
 * Uses the Admin SDK, which bypasses security rules. Production needs
 * admin/service-account.json (gitignored). Refuses to write over a store that
 * already has documents unless --force is given, so it can never clobber
 * edits made in the app after the cutover.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_DB = path.join(here, '..', 'server', 'msd-vd2-scope.db')
const SERVICE_ACCOUNT = path.join(here, 'service-account.json')
const PROJECT_ID = 'vd2-scope'

const { values } = parseArgs({
  options: {
    uid: { type: 'string' },
    db: { type: 'string', default: DEFAULT_DB },
    emulator: { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
  },
})

function fail(message: string): never {
  console.error(`[seed] ${message}`)
  process.exit(1)
}

if (!values.uid) fail('--uid is required (Firebase console → Authentication → Users).')
const uid = values.uid
if (!fs.existsSync(values.db)) fail(`No database at ${values.db}.`)

if (values.emulator) {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080'
  initializeApp({ projectId: PROJECT_ID })
} else {
  if (!fs.existsSync(SERVICE_ACCOUNT)) {
    fail(`No service account key at ${SERVICE_ACCOUNT}. See admin/README.md.`)
  }
  initializeApp({
    credential: cert(JSON.parse(fs.readFileSync(SERVICE_ACCOUNT, 'utf8'))),
    projectId: PROJECT_ID,
  })
}

const firestore = getFirestore()
const userDoc = firestore.doc(`users/${uid}`)
const target = values.emulator ? `emulator ${process.env.FIRESTORE_EMULATOR_HOST}` : PROJECT_ID

const sqlite = new Database(values.db, { readonly: true, fileMustExist: true })
const raw = exportRawScope(sqlite)
const sequences = exportSequences(sqlite)
sqlite.close()

const keys = Object.keys(COLLECTIONS) as CollectionKey[]

// Never seed over live data.
for (const key of keys) {
  const existing = (await userDoc.collection(COLLECTIONS[key]).count().get()).data().count
  if (existing > 0 && !values.force) {
    fail(
      `${COLLECTIONS[key]} already has ${existing} documents in ${target}. ` +
        'Seeding again would overwrite edits made since. Pass --force only if that is intended.',
    )
  }
}

console.log(`[seed] ${target} → users/${uid}/`)

const writer = firestore.bulkWriter()
writer.onWriteError((error) => {
  console.error(`[seed] write failed: ${error.documentRef.path} — ${error.message}`)
  return false
})
for (const key of keys) {
  const id = docId[key] as (row: unknown) => string
  for (const row of raw[key] as object[]) {
    void writer.set(userDoc.collection(COLLECTIONS[key]).doc(id(row)), row)
  }
}
void writer.set(userDoc.collection(SEQUENCES_DOC.split('/')[0]).doc(SEQUENCES_DOC.split('/')[1]), sequences)
await writer.close()

// Verify by reading everything back: counts, then every field of every doc.
let problems = 0
for (const key of keys) {
  const snapshot = await userDoc.collection(COLLECTIONS[key]).get()
  const expected = raw[key] as object[]
  const byId = new Map(snapshot.docs.map((d) => [d.id, d.data()]))
  const id = docId[key] as (row: unknown) => string
  const mismatched = expected.filter((row) => !isDeepStrictEqual(byId.get(id(row)), row))
  const ok = snapshot.size === expected.length && mismatched.length === 0
  if (!ok) problems += 1
  console.log(
    `[seed] ${ok ? 'ok  ' : 'FAIL'} ${COLLECTIONS[key].padEnd(26)} ${String(snapshot.size).padStart(4)} / ${expected.length}` +
      (mismatched.length > 0 ? `  (${mismatched.length} differ, e.g. ${id(mismatched[0])})` : ''),
  )
}
const storedSequences = (await firestore.doc(`users/${uid}/${SEQUENCES_DOC}`).get()).data()
if (!isDeepStrictEqual(storedSequences, sequences)) {
  problems += 1
  console.log(`[seed] FAIL sequences ${JSON.stringify(storedSequences)}`)
} else {
  console.log(`[seed] ok   sequences ${JSON.stringify(sequences)}`)
}

const total = keys.reduce((n, key) => n + (raw[key] as object[]).length, 0)
if (problems > 0) fail(`${problems} check(s) failed.`)
console.log(`[seed] done — ${total} documents written and verified.`)
process.exit(0)
