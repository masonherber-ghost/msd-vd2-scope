import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'

/**
 * 011 turns the assumptions table into one markdown field per feature. The
 * data already in the table has to survive that, in order, so this applies
 * the chain up to 010, seeds rows in the old shape, then applies 011.
 */
const here = path.dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = path.join(here, '..', 'migrations')
const NOTES_MIGRATION = '011_feature_notes.sql'

const files = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
const apply = (file: string, db: Database.Database) =>
  db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'))

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  for (const file of files.filter((f) => f < NOTES_MIGRATION)) apply(file, db)

  db.exec(`
    INSERT INTO releases (id, label, display_order) VALUES ('1.1', 'Release 1.1', 1);
    INSERT INTO phases (id, name, epic_ref, display_order) VALUES ('p', 'P', '177', 1);
    INSERT INTO pwc_features (id, name, release_id, phase_id, display_order)
      VALUES ('F-001', 'One', '1.1', 'p', 1),
             ('F-002', 'Two', '1.1', 'p', 2),
             ('F-003', 'Three', '1.1', 'p', 3);
    -- Inserted out of order: position, not id, is the order.
    INSERT INTO assumptions (pwc_feature_id, position, text, source) VALUES
      ('F-001', 2, 'Second.', 'mapping'),
      ('F-001', 1, 'First.', 'mapping'),
      ('F-002', 1, 'Imported.', 'mapping'),
      ('F-002', 2, 'Added here.', 'manual');
  `)
  apply(NOTES_MIGRATION, db)
})

const feature = (id: string) =>
  db.prepare('SELECT notes, notes_edited FROM pwc_features WHERE id = ?').get(id)

describe('011 feature notes', () => {
  it('backfills assumptions as a numbered markdown list, in position order', () => {
    expect(feature('F-001')).toEqual({ notes: '1. First.\n2. Second.', notes_edited: 0 })
  })

  it('marks notes edited where any assumption was added or edited by hand', () => {
    expect(feature('F-002')).toEqual({
      notes: '1. Imported.\n2. Added here.',
      notes_edited: 1,
    })
  })

  it('leaves a feature with no assumptions empty', () => {
    expect(feature('F-003')).toEqual({ notes: '', notes_edited: 0 })
  })

  it('drops the assumptions table', () => {
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE name = 'assumptions'").get(),
    ).toBeUndefined()
  })
})
