import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// A real in-memory database running the real migration — repositories are
// never tested against a mock, and the schema under test is the shipped one.
const db = new Database(':memory:')
db.pragma('foreign_keys = ON')

vi.mock('../database.js', () => ({ db }))

const here = path.dirname(fileURLToPath(import.meta.url))
const SCHEMA = fs.readFileSync(
  path.join(here, '..', 'migrations', '002_create_scope_schema.sql'),
  'utf8',
)

const {
  createAssumption,
  getAssumptionsForFeature,
  renumberAssumptions,
  replaceImportedAssumptions,
} = await import('./assumption-repository.js')
const { upsertImportedCapability, getAllCapabilities, findCapability } = await import(
  './capability-repository.js'
)
const { findMvpFeature, getAllMvpFeatures, upsertImportedMvpFeature, countMvpFeatureDependents } =
  await import('./mvp-feature-repository.js')
const { upsertImportedPhase } = await import('./phase-repository.js')
const { upsertImportedPwcFeature, countPwcFeatureDependents } = await import(
  './pwc-feature-repository.js'
)
const { upsertImportedRelease, getAllReleases } = await import('./release-repository.js')
const { upsertImportedFeatureMvpLink, upsertImportedFeatureCapabilityLink } = await import(
  './feature-link-repository.js'
)

function reset() {
  db.pragma('foreign_keys = OFF')
  // sqlite_sequence is internal to AUTOINCREMENT and cannot be dropped.
  for (const { name } of db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all() as { name: string }[]) {
    db.exec(`DROP TABLE IF EXISTS "${name}"`)
  }
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)

  upsertImportedRelease({
    id: '1.1',
    label: 'Release 1.1',
    name: 'Pilot',
    description: '',
    display_order: 1,
    in_mapping_source: true,
    in_sequencing_source: true,
    source: 'both',
  })
  upsertImportedPhase({
    id: 'manage-vacancies',
    name: 'Manage Vacancies',
    epic_ref: '177',
    epic_description: '',
    display_order: 3,
  })
  upsertImportedPwcFeature({
    id: 'F-001',
    name: 'Invite employer',
    foundational_build: '',
    release_id: '1.1',
    phase_id: 'manage-vacancies',
    source_phase_label: 'Manage Vacancies',
    capability_note: null,
    display_order: 1,
  })
}

beforeEach(reset)

describe('the migration is idempotent', () => {
  it('can be applied twice without error', () => {
    expect(() => db.exec(SCHEMA)).not.toThrow()
  })
})

describe('mvp_features uniqueness on (ref, scope_option)', () => {
  it('allows 1A and 1B for the same ref as separate records', () => {
    upsertImportedMvpFeature({ ref: 951, scope_option: '1A', title: 'A', source: 'mapping' })
    upsertImportedMvpFeature({ ref: 951, scope_option: '1B', title: 'B', source: 'mapping' })
    expect(getAllMvpFeatures().filter((m) => m.ref === 951)).toHaveLength(2)
  })

  it('allows a bare record alongside 1A', () => {
    upsertImportedMvpFeature({ ref: 938, scope_option: '1A', title: 'A', source: 'mapping' })
    upsertImportedMvpFeature({ ref: 938, scope_option: null, title: 'bare', source: 'mapping' })
    expect(getAllMvpFeatures().filter((m) => m.ref === 938)).toHaveLength(2)
  })

  /**
   * The reason the index uses IFNULL: SQLite treats NULLs as distinct in a
   * unique index, so a plain UNIQUE(ref, scope_option) would silently accept
   * two bare records for the same ref.
   */
  it('rejects a SECOND bare record for the same ref', () => {
    db.prepare(
      "INSERT INTO mvp_features (ref, scope_option, title, source) VALUES (938, NULL, 'first', 'mapping')",
    ).run()

    expect(() =>
      db
        .prepare(
          "INSERT INTO mvp_features (ref, scope_option, title, source) VALUES (938, NULL, 'second', 'mapping')",
        )
        .run(),
    ).toThrow(/UNIQUE constraint failed/)

    expect(getAllMvpFeatures().filter((m) => m.ref === 938)).toHaveLength(1)
  })

  it('rejects a duplicate (ref, 1A) pair', () => {
    db.prepare(
      "INSERT INTO mvp_features (ref, scope_option, title, source) VALUES (951, '1A', 'a', 'mapping')",
    ).run()
    expect(() =>
      db
        .prepare(
          "INSERT INTO mvp_features (ref, scope_option, title, source) VALUES (951, '1A', 'b', 'mapping')",
        )
        .run(),
    ).toThrow(/UNIQUE constraint failed/)
  })

  it('rejects a scope_option outside 1A / 1B', () => {
    expect(() =>
      db
        .prepare(
          "INSERT INTO mvp_features (ref, scope_option, title, source) VALUES (999, '2C', 't', 'mapping')",
        )
        .run(),
    ).toThrow(/CHECK constraint failed/)
  })

  it('upserts on the same (ref, scope_option) instead of duplicating', () => {
    upsertImportedMvpFeature({ ref: 940, scope_option: '1A', title: 'first', source: 'mapping' })
    upsertImportedMvpFeature({ ref: 940, scope_option: '1A', title: 'second', source: 'mapping' })
    const rows = getAllMvpFeatures().filter((m) => m.ref === 940)
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe('second')
  })
})

describe('capability identity is case-insensitive on (ref, text)', () => {
  const base = {
    mvp_feature_id: null,
    mvp_owner_ambiguous: 0,
    actor: 'employer',
    release_id: '1.1',
    phase_id: 'manage-vacancies',
    source_phase_label: 'Manage Vacancies',
    source: 'sequencing',
  }

  it('treats two casings of the same text as one capability', () => {
    upsertImportedCapability({ ...base, mvp_ref: 980, text: 'Filter and Sort Applications' })
    upsertImportedCapability({ ...base, mvp_ref: 980, text: 'Filter and sort applications' })
    expect(getAllCapabilities().filter((c) => c.mvp_ref === 980)).toHaveLength(1)
  })

  it('keeps near-duplicate text as separate capabilities', () => {
    upsertImportedCapability({
      ...base,
      mvp_ref: 941,
      text: 'View authenticated landing page / dashboard',
    })
    upsertImportedCapability({ ...base, mvp_ref: 941, text: 'View authenticated landing page' })
    expect(getAllCapabilities().filter((c) => c.mvp_ref === 941)).toHaveLength(2)
  })

  it('finds a capability case-insensitively', () => {
    upsertImportedCapability({ ...base, mvp_ref: 980, text: 'Filter and Sort Applications' })
    expect(findCapability(980, 'FILTER AND SORT APPLICATIONS')).toBeDefined()
  })

  it('rejects an unknown actor — a new actor is a schema change', () => {
    expect(() =>
      upsertImportedCapability({ ...base, mvp_ref: 900, text: 'x', actor: 'manager' }),
    ).toThrow(/CHECK constraint failed/)
  })
})

describe('referential integrity (R-9.4)', () => {
  it('cascades assumptions when their feature is deleted', () => {
    createAssumption({ pwc_feature_id: 'F-001', position: 1, text: 'a', source: 'mapping' })
    createAssumption({ pwc_feature_id: 'F-001', position: 2, text: 'b', source: 'mapping' })
    expect(getAssumptionsForFeature('F-001')).toHaveLength(2)

    db.prepare("DELETE FROM pwc_features WHERE id='F-001'").run()
    expect(getAssumptionsForFeature('F-001')).toHaveLength(0)
  })

  it('cascades join rows when their feature is deleted', () => {
    upsertImportedMvpFeature({ ref: 938, scope_option: '1A', title: 'A', source: 'mapping' })
    const mvp = findMvpFeature(938, '1A')!
    upsertImportedFeatureMvpLink({ pwc_feature_id: 'F-001', mvp_feature_id: mvp.id })
    expect(
      db.prepare('SELECT COUNT(*) AS n FROM pwc_feature_mvp_features').get(),
    ).toEqual({ n: 1 })

    db.prepare("DELETE FROM pwc_features WHERE id='F-001'").run()
    expect(
      db.prepare('SELECT COUNT(*) AS n FROM pwc_feature_mvp_features').get(),
    ).toEqual({ n: 0 })
  })

  it('does NOT let an MVP feature be deleted while a join row references it', () => {
    upsertImportedMvpFeature({ ref: 938, scope_option: '1A', title: 'A', source: 'mapping' })
    const mvp = findMvpFeature(938, '1A')!
    upsertImportedFeatureMvpLink({ pwc_feature_id: 'F-001', mvp_feature_id: mvp.id })

    // The join row cascades from the MVP side too, so deletion succeeds —
    // which is why the app must refuse it in the route with a count first.
    expect(countMvpFeatureDependents(mvp.id)).toEqual({ features: 1, capabilities: 0 })
  })

  it('refuses a feature whose release does not exist', () => {
    expect(() =>
      upsertImportedPwcFeature({
        id: 'F-999',
        name: 'Orphan',
        foundational_build: '',
        release_id: 'nope',
        phase_id: 'manage-vacancies',
        source_phase_label: null,
        capability_note: null,
        display_order: 1,
      }),
    ).toThrow(/FOREIGN KEY constraint failed/)
  })

  it('rejects a feature id that is not F-nnn', () => {
    expect(() =>
      upsertImportedPwcFeature({
        id: 'FEATURE-1',
        name: 'Bad id',
        foundational_build: '',
        release_id: '1.1',
        phase_id: 'manage-vacancies',
        source_phase_label: null,
        capability_note: null,
        display_order: 1,
      }),
    ).toThrow(/CHECK constraint failed/)
  })

  it('counts what depends on a feature, for the delete guard', () => {
    createAssumption({ pwc_feature_id: 'F-001', position: 1, text: 'a', source: 'mapping' })
    upsertImportedMvpFeature({ ref: 938, scope_option: null, title: 'A', source: 'mapping' })
    upsertImportedFeatureMvpLink({
      pwc_feature_id: 'F-001',
      mvp_feature_id: findMvpFeature(938, null)!.id,
    })
    expect(countPwcFeatureDependents('F-001')).toEqual({
      assumptions: 1,
      mvpLinks: 1,
      capabilityLinks: 0,
    })
  })
})

describe('assumption ordering stays contiguous (R-9.3)', () => {
  it('numbers imported assumptions 1..n', () => {
    replaceImportedAssumptions('F-001', ['one', 'two', 'three'])
    expect(getAssumptionsForFeature('F-001').map((a) => a.position)).toEqual([1, 2, 3])
  })

  it('keeps a manual assumption and renumbers around it on re-import', () => {
    replaceImportedAssumptions('F-001', ['one', 'two'])
    createAssumption({ pwc_feature_id: 'F-001', position: 99, text: 'manual', source: 'manual' })

    replaceImportedAssumptions('F-001', ['one', 'two', 'three'])

    const rows = getAssumptionsForFeature('F-001')
    expect(rows.map((a) => a.position)).toEqual([1, 2, 3, 4])
    expect(rows.filter((a) => a.source === 'manual')).toHaveLength(1)
  })

  it('closes a gap left by a deletion', () => {
    replaceImportedAssumptions('F-001', ['one', 'two', 'three'])
    db.prepare("DELETE FROM assumptions WHERE pwc_feature_id='F-001' AND position=2").run()

    renumberAssumptions('F-001')
    expect(getAssumptionsForFeature('F-001').map((a) => a.position)).toEqual([1, 2])
  })
})

describe('provenance survives editing (R-9.9)', () => {
  it('never overwrites a manual row on re-import', () => {
    db.prepare("UPDATE pwc_features SET name='Renamed', source='manual' WHERE id='F-001'").run()

    upsertImportedPwcFeature({
      id: 'F-001',
      name: 'Invite employer',
      foundational_build: '',
      release_id: '1.1',
      phase_id: 'manage-vacancies',
      source_phase_label: 'Manage Vacancies',
      capability_note: null,
      display_order: 1,
    })

    const row = db.prepare("SELECT name, source FROM pwc_features WHERE id='F-001'").get()
    expect(row).toEqual({ name: 'Renamed', source: 'manual' })
  })

  it('never overwrites a manual release', () => {
    db.prepare("UPDATE releases SET name='Renamed', source='manual' WHERE id='1.1'").run()
    upsertImportedRelease({
      id: '1.1',
      label: 'Release 1.1',
      name: 'Pilot',
      description: '',
      display_order: 1,
      in_mapping_source: true,
      in_sequencing_source: true,
      source: 'both',
    })
    expect(getAllReleases()[0].name).toBe('Renamed')
  })

  it('never overwrites a link whose conflict has been resolved (R-11.4)', () => {
    upsertImportedMvpFeature({ ref: 951, scope_option: '1A', title: 'A', source: 'mapping' })
    upsertImportedCapability({
      mvp_feature_id: findMvpFeature(951, '1A')!.id,
      mvp_ref: 951,
      mvp_owner_ambiguous: 0,
      text: 'Electronic T&Cs acceptance',
      actor: 'employer',
      release_id: '1.1',
      phase_id: 'manage-vacancies',
      source_phase_label: 'Manage Vacancies',
      source: 'sequencing',
    })
    const capability = findCapability(951, 'Electronic T&Cs acceptance')!

    const link = {
      pwc_feature_id: 'F-001',
      capability_id: capability.id,
      source_citations: 1,
      matched: 1,
      release_conflict: 1,
      phase_conflict: 0,
      feature_release_id: '1.1',
      capability_release_id: '1.4',
      feature_phase_label: null,
      capability_phase_label: null,
      phase_conflict_merged: 0,
    }
    upsertImportedFeatureCapabilityLink(link)

    db.prepare(
      `UPDATE pwc_feature_capabilities
          SET resolution_state='defect_raised', resolution_note='raised'
        WHERE pwc_feature_id='F-001'`,
    ).run()

    // A later import must leave the human's decision alone.
    upsertImportedFeatureCapabilityLink({ ...link, release_conflict: 0 })

    const row = db
      .prepare(
        `SELECT resolution_state, resolution_note, release_conflict
           FROM pwc_feature_capabilities WHERE pwc_feature_id='F-001'`,
      )
      .get()
    expect(row).toEqual({
      resolution_state: 'defect_raised',
      resolution_note: 'raised',
      release_conflict: 1,
    })
  })

  it('rejects an unknown resolution state', () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO pwc_feature_capabilities
             (pwc_feature_id, capability_id, resolution_state)
           VALUES ('F-001', 1, 'invented')`,
        )
        .run(),
    ).toThrow(/CHECK constraint failed/)
  })
})
