import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { KEYS, connect, ownerUid, readStore } from './firestore-admin.js'

/**
 * BACKUP: the whole store as one JSON file in backups/ — committable, and
 * restorable with admin/restore-firestore.ts.
 *
 *   npx tsx admin/backup-firestore.ts            # production
 *   npx tsx admin/backup-firestore.ts --emulator
 *
 * Costs the same ~400 reads as opening the app once.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const BACKUPS_DIR = path.join(here, '..', 'backups')

const { values } = parseArgs({
  options: {
    uid: { type: 'string' },
    emulator: { type: 'boolean', default: false },
  },
})

const uid = values.uid ?? ownerUid()
const { firestore, target } = connect(values.emulator)
const { raw, sequences } = await readStore(firestore, uid)

fs.mkdirSync(BACKUPS_DIR, { recursive: true })
// 2026-10-08T14-32-05 — filesystem-safe and lexically sortable.
const stamp = new Date().toISOString().replace(/\..+$/, '').replace(/:/g, '-')
const file = path.join(BACKUPS_DIR, `firestore-${stamp}.json`)
fs.writeFileSync(
  file,
  JSON.stringify({ project: target, uid, exportedAt: new Date().toISOString(), sequences, raw }, null, 2) + '\n',
)

const total = KEYS.reduce((n, key) => n + raw[key].length, 0)
console.log(`[backup] ${target} users/${uid}/ → ${path.relative(process.cwd(), file)} (${total} documents)`)
process.exit(0)
