import fs from 'node:fs'
import { parseArgs } from 'node:util'
import type { RawScope, Sequences } from '../src/lib/scope-records.js'
import {
  commitDiff,
  connect,
  diffSize,
  diffStores,
  fail,
  ownerUid,
  readStore,
  verifyStore,
} from './firestore-admin.js'

/**
 * RESTORE a backup made by admin/backup-firestore.ts: makes the store exactly
 * what the file holds — documents added since the backup are deleted.
 *
 *   npx tsx admin/restore-firestore.ts backups/firestore-….json          # dry run
 *   npx tsx admin/restore-firestore.ts backups/firestore-….json --apply  # write
 *
 * Take a fresh backup first: a restore discards every edit since the file.
 */

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    uid: { type: 'string' },
    emulator: { type: 'boolean', default: false },
    apply: { type: 'boolean', default: false },
  },
})

const file = positionals[0]
if (!file || !fs.existsSync(file)) fail('Give the backup file to restore, e.g. backups/firestore-….json')
const backup = JSON.parse(fs.readFileSync(file, 'utf8')) as { raw: RawScope; sequences: Sequences }

const uid = values.uid ?? ownerUid()
const { firestore, target } = connect(values.emulator)
const current = await readStore(firestore, uid)
const diff = diffStores(current.raw, backup.raw)

console.log(`[restore] ${file} → ${target} users/${uid}/`)
for (const { key, set, remove } of diff) {
  if (set.length + remove.length > 0) {
    console.log(`[restore]   ${key.padEnd(24)} ${set.length} written, ${remove.length} removed`)
  }
}
const changes = diffSize(diff)
if (changes === 0) {
  console.log('[restore] nothing to change — the store already matches the backup.')
  process.exit(0)
}
if (!values.apply) {
  console.log(`[restore] dry run — ${changes} document change(s). Re-run with --apply to write them.`)
  process.exit(0)
}

// Counters never move backwards: an id handed out after the backup must not
// be handed out again.
const sequences = Object.fromEntries(
  Object.entries(backup.sequences).map(([name, value]) => [
    name,
    Math.max(value, current.sequences[name as keyof Sequences]),
  ]),
) as Sequences
await commitDiff(firestore, uid, diff, sequences)
await verifyStore(firestore, uid, backup.raw)
console.log(`[restore] done — ${changes} document change(s) written and verified. Reload the app.`)
process.exit(0)
