import { parseArgs } from 'node:util'
import { utcNow } from '../src/lib/scope-records.js'
import {
  commitDiff,
  connect,
  diffSize,
  diffStores,
  withoutTimestampOnlyChanges,
  fail,
  ownerUid,
  readStore,
  verifyStore,
} from './firestore-admin.js'
import { ImportDriftError, planImport } from './import/plan-import.js'
import { findCountDrift, loadScopeFromSources } from './import/scope-source.js'
import { ParseError } from './import/scope-types.js'

/**
 * RE-IMPORT the two source documents in _docs/ into Firestore.
 *
 *   npx tsx admin/import-scope.ts            # dry run: what would change
 *   npx tsx admin/import-scope.ts --apply    # write it, then verify
 *   npx tsx admin/import-scope.ts --emulator # against the local emulator
 *
 * Additive and non-destructive (R-11.4): manual rows, resolved conflicts,
 * tombstoned links and notes edited in the app are never overwritten. Refuses
 * a graph whose counts drift from the expected reconciliation (R-11.3).
 * Was POST /api/import, and the first-boot seed, on the Express server.
 */

const { values } = parseArgs({
  options: {
    uid: { type: 'string' },
    emulator: { type: 'boolean', default: false },
    apply: { type: 'boolean', default: false },
  },
})

const uid = values.uid ?? ownerUid()

let reconciled: ReturnType<typeof loadScopeFromSources>
try {
  reconciled = loadScopeFromSources()
} catch (error) {
  if (error instanceof ParseError) fail(`A source document could not be parsed. ${error.message}`)
  throw error
}

const s = reconciled.summary
console.log(
  `[import] sources: ${s.releases} releases · ${s.phases} phases · ${s.pwcFeatures} features · ` +
    `${s.assumptions} assumptions · ${s.mvpRecords} MVP records (${s.mvpRefs} refs) · ` +
    `${s.capabilities} capabilities`,
)
console.log(
  `[import] links: ${s.featureMvpLinks} feature→MVP, ${s.featureCapabilityLinks} feature→capability · ` +
    `conflicts: ${s.releaseConflicts} release, ${s.phaseConflicts} phase, ${s.unmatchedLinks} unmatched`,
)
for (const d of findCountDrift(reconciled)) {
  console.error(`[import] DRIFT ${d.key}: got ${d.actual}, expected ${d.expected}`)
}

const { firestore, target } = connect(values.emulator)
const before = await readStore(firestore, uid)

let plan: ReturnType<typeof planImport>
try {
  plan = planImport({ raw: before.raw, now: utcNow(), sequences: before.sequences }, reconciled)
} catch (error) {
  if (error instanceof ImportDriftError) fail(error.message)
  throw error
}

const next = withoutTimestampOnlyChanges(before.raw, plan.next)
const diff = diffStores(before.raw, next)
console.log(`[import] ${target} → users/${uid}/`)
for (const { key, set, remove } of diff) {
  if (set.length + remove.length > 0) {
    console.log(`[import]   ${key.padEnd(24)} ${set.length} written, ${remove.length} removed`)
  }
}
const summary = plan.result
for (const id of summary.removedReleases) console.log(`[import] drops stale release ${id}`)
for (const r of summary.retainedStaleReleases) {
  console.warn(
    `[import] release ${r.id} is no longer in the sources but still has ${r.features} feature(s) ` +
      `and ${r.capabilities} capability(ies) — kept`,
  )
}
for (const m of summary.removedMvpFeatures) {
  console.log(`[import] drops stale MVP record ${m.ref}${m.scope_option ? `/${m.scope_option}` : ''}`)
}
for (const m of summary.retainedStaleMvpFeatures) {
  console.warn(
    `[import] MVP record ${m.ref}${m.scope_option ? `/${m.scope_option}` : ''} is no longer ` +
      `produced by the sources but has ${m.dependents} dependant(s) — kept`,
  )
}

const changes = diffSize(diff)
if (changes === 0) {
  console.log('[import] nothing to change — the store already matches the sources.')
  process.exit(0)
}
if (!values.apply) {
  console.log(`[import] dry run — ${changes} document change(s). Re-run with --apply to write them.`)
  process.exit(0)
}

await commitDiff(firestore, uid, diff, { ...before.sequences, ...plan.sequences })
await verifyStore(firestore, uid, next)
console.log(`[import] done — ${changes} document change(s) written and verified.`)
console.log('[import] Reload the app: an open tab still holds the store as it was.')
process.exit(0)
