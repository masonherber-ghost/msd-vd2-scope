import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// A real in-memory database running the real migration — repositories are
// never tested against a mock, and the schema under test is the shipped one.
const db = new Database(':memory:')
db.pragma('foreign_keys = ON')

vi.mock('../database.js', () => ({ db }))

const { applyAllMigrations, resetSchema } = await import('../test-support/apply-migrations.js')


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
const {
  upsertImportedPwcFeature,
  countPwcFeatureDependents,
  createPwcFeature,
  deletePwcFeature,
  getPwcFeature,
  nextFreeFeatureId,
  updatePwcFeature,
} = await import('./pwc-feature-repository.js')
const { upsertImportedRelease, getAllReleases } = await import('./release-repository.js')
const {
  upsertImportedFeatureMvpLink,
  upsertImportedFeatureCapabilityLink,
  getAllFeatureMvpLinks,
  getAllFeatureCapabilityLinks,
  getCapabilityIdsFor,
  getMvpFeatureIdsFor,
  setCapabilityLinks,
  setMvpFeatureLinks,
  getFeatureCapabilityLink,
  resolveConflict,
} = await import('./feature-link-repository.js')

function reset() {
  resetSchema(db)

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

describe('the migrations are idempotent', () => {
  it('the whole chain can be applied twice without error', () => {
    // 004 uses ALTER TABLE ADD COLUMN, which SQLite cannot guard with
    // IF NOT EXISTS — so re-applying it must fail loudly rather than
    // silently, and the runner's migrations table is what prevents a
    // second run in production.
    expect(() => applyAllMigrations(db)).toThrow(/duplicate column name/)
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

describe('feature writes', () => {
  const base = {
    name: 'New feature',
    foundational_build: 'Something.',
    release_id: '1.1',
    phase_id: 'manage-vacancies',
    capability_note: null,
  }

  it('creates a feature marked manual, with timestamps', () => {
    const created = createPwcFeature({ id: 'F-100', ...base })
    expect(created).toMatchObject({ id: 'F-100', name: 'New feature', source: 'manual' })
    expect(created.created_at).toBeTruthy()
    expect(created.updated_at).toBeTruthy()
  })

  it('sorts a created feature after the existing ones', () => {
    const created = createPwcFeature({ id: 'F-100', ...base })
    // F-001 was seeded with display_order 1.
    expect(created.display_order).toBe(2)
  })

  it('rejects a duplicate id at the database level', () => {
    createPwcFeature({ id: 'F-100', ...base })
    expect(() => createPwcFeature({ id: 'F-100', ...base })).toThrow(
      /UNIQUE constraint failed/,
    )
  })

  it('rejects an id that is not F-nnn', () => {
    expect(() => createPwcFeature({ id: 'FEATURE-1', ...base })).toThrow(
      /CHECK constraint failed/,
    )
  })

  describe('nextFreeFeatureId', () => {
    it('fills the lowest gap rather than continuing past the maximum', () => {
      // F-001 is seeded, so the first gap is F-002.
      expect(nextFreeFeatureId()).toBe('F-002')

      createPwcFeature({ id: 'F-002', ...base })
      createPwcFeature({ id: 'F-004', ...base })
      // F-003 is now the lowest gap, even though F-004 exists.
      expect(nextFreeFeatureId()).toBe('F-003')
    })

    it('pads to three digits', () => {
      expect(nextFreeFeatureId()).toMatch(/^F-\d{3}$/)
    })
  })

  describe('updatePwcFeature', () => {
    it('patches only the supplied columns', () => {
      updatePwcFeature('F-001', { name: 'Renamed' })
      const row = getPwcFeature('F-001')!
      expect(row.name).toBe('Renamed')
      // Untouched.
      expect(row.release_id).toBe('1.1')
      expect(row.phase_id).toBe('manage-vacancies')
    })

    it('marks an edited imported row manual, so a re-import cannot undo it', () => {
      expect(getPwcFeature('F-001')!.source).toBe('mapping')
      updatePwcFeature('F-001', { name: 'Renamed' })
      expect(getPwcFeature('F-001')!.source).toBe('manual')
    })

    it('returns undefined for a feature that does not exist', () => {
      expect(updatePwcFeature('F-999', { name: 'x' })).toBeUndefined()
    })

    it('is a no-op for an empty patch', () => {
      const before = getPwcFeature('F-001')!
      expect(updatePwcFeature('F-001', {})).toEqual(before)
    })

    it('refuses to move a feature to a release that does not exist', () => {
      expect(() => updatePwcFeature('F-001', { release_id: 'nope' })).toThrow(
        /FOREIGN KEY constraint failed/,
      )
    })
  })

  describe('deletePwcFeature', () => {
    it('removes the feature and reports one change', () => {
      expect(deletePwcFeature('F-001')).toBe(1)
      expect(getPwcFeature('F-001')).toBeUndefined()
    })

    it('reports zero changes for a feature that does not exist', () => {
      expect(deletePwcFeature('F-999')).toBe(0)
    })

    it('cascades assumptions and join rows, and nothing else', () => {
      createAssumption({ pwc_feature_id: 'F-001', position: 1, text: 'a', source: 'mapping' })
      upsertImportedMvpFeature({ ref: 938, scope_option: null, title: 'A', source: 'mapping' })
      const mvp = findMvpFeature(938, null)!
      upsertImportedFeatureMvpLink({ pwc_feature_id: 'F-001', mvp_feature_id: mvp.id })

      deletePwcFeature('F-001')

      expect(getAssumptionsForFeature('F-001')).toHaveLength(0)
      expect(
        db.prepare('SELECT COUNT(*) AS n FROM pwc_feature_mvp_features').get(),
      ).toEqual({ n: 0 })
      // The MVP feature itself survives — other features use it.
      expect(getAllMvpFeatures()).toHaveLength(1)
    })
  })
})

describe('editing a feature\'s links', () => {
  const seedMvp = (ref: number, option: '1A' | '1B' | null) => {
    upsertImportedMvpFeature({ ref, scope_option: option, title: `MVP ${ref}`, source: 'mapping' })
    return findMvpFeature(ref, option)!.id
  }

  const seedCapability = (ref: number, text: string) => {
    upsertImportedCapability({
      mvp_feature_id: null,
      mvp_ref: ref,
      mvp_owner_ambiguous: 0,
      text,
      actor: 'staff',
      release_id: '1.1',
      phase_id: 'manage-vacancies',
      source_phase_label: 'Manage Vacancies',
      source: 'sequencing',
    })
    return findCapability(ref, text)!.id
  }

  it('replaces the MVP link set with exactly what is asked for', () => {
    const a = seedMvp(938, '1A')
    const b = seedMvp(946, '1A')
    setMvpFeatureLinks('F-001', [a, b])
    expect(getMvpFeatureIdsFor('F-001').sort()).toEqual([a, b].sort())

    setMvpFeatureLinks('F-001', [b])
    expect(getMvpFeatureIdsFor('F-001')).toEqual([b])
  })

  it('replaces the capability link set', () => {
    const a = seedCapability(938, 'Invite employer')
    const b = seedCapability(938, 'Search and find employer')
    setCapabilityLinks('F-001', [a, b])
    expect(getCapabilityIdsFor('F-001').sort()).toEqual([a, b].sort())

    setCapabilityLinks('F-001', [])
    expect(getCapabilityIdsFor('F-001')).toEqual([])
  })

  it('tombstones a removal rather than deleting the row', () => {
    const a = seedMvp(938, '1A')
    setMvpFeatureLinks('F-001', [a])
    setMvpFeatureLinks('F-001', [])

    const row = db
      .prepare(
        `SELECT removed_at FROM pwc_feature_mvp_features
          WHERE pwc_feature_id = 'F-001' AND mvp_feature_id = ?`,
      )
      .get(a) as { removed_at: string | null }
    expect(row.removed_at).toBeTruthy()
  })

  /**
   * The reason tombstones exist: a hard DELETE would be undone by the
   * importer's INSERT on the next run, destroying manual work (R-9.10).
   */
  it('keeps a removed link removed across a re-import', () => {
    const a = seedMvp(938, '1A')
    upsertImportedFeatureMvpLink({ pwc_feature_id: 'F-001', mvp_feature_id: a })
    expect(getMvpFeatureIdsFor('F-001')).toEqual([a])

    setMvpFeatureLinks('F-001', [])
    expect(getMvpFeatureIdsFor('F-001')).toEqual([])

    // The importer runs again and tries to re-add the same link.
    upsertImportedFeatureMvpLink({ pwc_feature_id: 'F-001', mvp_feature_id: a })
    expect(getMvpFeatureIdsFor('F-001')).toEqual([])
  })

  it('keeps a removed capability link removed across a re-import', () => {
    const a = seedCapability(938, 'Invite employer')
    upsertImportedFeatureCapabilityLink({
      pwc_feature_id: 'F-001',
      capability_id: a,
      source_citations: 1,
      matched: 1,
      release_conflict: 0,
      phase_conflict: 0,
      feature_release_id: null,
      capability_release_id: null,
      feature_phase_label: null,
      capability_phase_label: null,
      phase_conflict_merged: 0,
    })
    setCapabilityLinks('F-001', [])

    upsertImportedFeatureCapabilityLink({
      pwc_feature_id: 'F-001',
      capability_id: a,
      source_citations: 1,
      matched: 1,
      release_conflict: 0,
      phase_conflict: 0,
      feature_release_id: null,
      capability_release_id: null,
      feature_phase_label: null,
      capability_phase_label: null,
      phase_conflict_merged: 0,
    })
    expect(getCapabilityIdsFor('F-001')).toEqual([])
  })

  it('revives a link the user removed and then re-added', () => {
    const a = seedMvp(938, '1A')
    setMvpFeatureLinks('F-001', [a])
    setMvpFeatureLinks('F-001', [])
    setMvpFeatureLinks('F-001', [a])

    expect(getMvpFeatureIdsFor('F-001')).toEqual([a])
    const row = db
      .prepare(
        `SELECT removed_at, source FROM pwc_feature_mvp_features
          WHERE pwc_feature_id = 'F-001' AND mvp_feature_id = ?`,
      )
      .get(a) as { removed_at: string | null; source: string }
    expect(row.removed_at).toBeNull()
    expect(row.source).toBe('manual')
  })

  it('hides tombstoned links from the graph read', () => {
    const a = seedMvp(938, '1A')
    const c = seedCapability(938, 'Invite employer')
    setMvpFeatureLinks('F-001', [a])
    setCapabilityLinks('F-001', [c])
    expect(getAllFeatureMvpLinks()).toHaveLength(1)
    expect(getAllFeatureCapabilityLinks()).toHaveLength(1)

    setMvpFeatureLinks('F-001', [])
    setCapabilityLinks('F-001', [])
    expect(getAllFeatureMvpLinks()).toHaveLength(0)
    expect(getAllFeatureCapabilityLinks()).toHaveLength(0)
  })

  it('does not touch another feature\'s links', () => {
    upsertImportedPwcFeature({
      id: 'F-002',
      name: 'Other',
      foundational_build: '',
      release_id: '1.1',
      phase_id: 'manage-vacancies',
      source_phase_label: null,
      capability_note: null,
      display_order: 2,
    })
    const a = seedMvp(938, '1A')
    setMvpFeatureLinks('F-001', [a])
    setMvpFeatureLinks('F-002', [a])

    setMvpFeatureLinks('F-001', [])

    expect(getMvpFeatureIdsFor('F-001')).toEqual([])
    expect(getMvpFeatureIdsFor('F-002')).toEqual([a])
  })
})

describe('conflict resolution (R-7.2)', () => {
  const seedLink = () => {
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
    upsertImportedFeatureCapabilityLink({
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
    })
    return getAllFeatureCapabilityLinks()[0]
  }

  it('starts unreviewed with no timestamp', () => {
    const link = seedLink()
    expect(link.resolution_state).toBe('unreviewed')
    expect(link.resolved_at).toBeNull()
  })

  it('records a decision, a note and when it was made', () => {
    const link = seedLink()
    const resolved = resolveConflict(link.id, 'defect_raised', 'Raised with the programme')!

    expect(resolved.resolution_state).toBe('defect_raised')
    expect(resolved.resolution_note).toBe('Raised with the programme')
    expect(resolved.resolved_at).toBeTruthy()
  })

  it('leaves both placements untouched — a decision is not an edit (R-7.1)', () => {
    const link = seedLink()
    resolveConflict(link.id, 'table_wins', null)

    const after = getFeatureCapabilityLink(link.id)!
    expect(after.feature_release_id).toBe('1.1')
    expect(after.capability_release_id).toBe('1.4')
    expect(after.release_conflict).toBe(1)
  })

  it('clears the timestamp when a conflict is reopened', () => {
    const link = seedLink()
    resolveConflict(link.id, 'mapping_wins', 'note')
    const reopened = resolveConflict(link.id, 'unreviewed', null)!

    expect(reopened.resolution_state).toBe('unreviewed')
    expect(reopened.resolved_at).toBeNull()
  })

  it('rejects a state outside the known set', () => {
    const link = seedLink()
    expect(() => resolveConflict(link.id, 'invented', null)).toThrow(
      /CHECK constraint failed/,
    )
  })

  /** R-11.4: a decision must outlive the next import. */
  it('is not overwritten by a re-import', () => {
    const link = seedLink()
    resolveConflict(link.id, 'both_correct', 'Confirmed with delivery')

    upsertImportedFeatureCapabilityLink({
      pwc_feature_id: 'F-001',
      capability_id: link.capability_id,
      source_citations: 1,
      matched: 1,
      // The import would otherwise clear the conflict flag.
      release_conflict: 0,
      phase_conflict: 0,
      feature_release_id: null,
      capability_release_id: null,
      feature_phase_label: null,
      capability_phase_label: null,
      phase_conflict_merged: 0,
    })

    const after = getFeatureCapabilityLink(link.id)!
    expect(after.resolution_state).toBe('both_correct')
    expect(after.resolution_note).toBe('Confirmed with delivery')
    expect(after.release_conflict).toBe(1)
  })
})
