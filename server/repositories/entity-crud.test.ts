import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = new Database(':memory:')
db.pragma('foreign_keys = ON')

vi.mock('../database.js', () => ({ db }))

const { resetSchema } = await import('../test-support/apply-migrations.js')
const {
  appendAssumption,
  deleteAssumption,
  getAssumptionsForFeature,
  moveAssumption,
  updateAssumptionText,
} = await import('./assumption-repository.js')
const {
  countCapabilityDependents,
  createCapability,
  deleteCapability,
  getCapabilityById,
  updateCapability,
} = await import('./capability-repository.js')
const {
  createMvpFeature,
  deleteMvpFeature,
  findMvpFeature,
  getAllMvpFeatures,
  updateMvpFeature,
} = await import('./mvp-feature-repository.js')
const {
  countPhaseDependents,
  createPhase,
  deletePhase,
  getAllPhases,
  movePhase,
  renumberPhases,
  updatePhase,
} = await import('./phase-repository.js')
const {
  countReleaseDependents,
  createRelease,
  deleteRelease,
  getAllReleases,
  getRelease,
  updateRelease,
} = await import('./release-repository.js')
const { upsertImportedPwcFeature } = await import('./pwc-feature-repository.js')

function seed() {
  resetSchema(db)
  createRelease({ id: '1.1', label: 'Release 1.1', name: 'Pilot', description: '' })
  createPhase({ id: 'manage-vacancies', name: 'Manage Vacancies', epic_ref: '177', epic_description: '' })
  createPhase({ id: 'outcomes-and-support', name: 'Outcomes & Support', epic_ref: '192', epic_description: '' })
  upsertImportedPwcFeature({
    id: 'F-001',
    name: 'A feature',
    foundational_build: '',
    release_id: '1.1',
    phase_id: 'manage-vacancies',
    source_phase_label: null,
    capability_note: null,
    display_order: 1,
  })
}

beforeEach(seed)

describe('releases', () => {
  it('creates one marked manual, appended to the order', () => {
    const created = createRelease({ id: '2', label: 'Release 2', name: '', description: '' })
    expect(created).toMatchObject({ id: '2', source: 'manual', display_order: 2 })
  })

  it('patches only the supplied columns', () => {
    updateRelease('1.1', { name: 'Renamed' })
    expect(getRelease('1.1')).toMatchObject({ name: 'Renamed', label: 'Release 1.1' })
  })

  it('counts what depends on it', () => {
    expect(countReleaseDependents('1.1')).toEqual({ features: 1, capabilities: 0 })
  })

  it('is refused by the foreign key while a feature points at it', () => {
    // The route refuses first with a message; the constraint is the backstop.
    expect(() => deleteRelease('1.1')).toThrow(/FOREIGN KEY constraint failed/)
  })

  it('deletes cleanly once nothing references it', () => {
    createRelease({ id: '2', label: 'Release 2', name: '', description: '' })
    expect(deleteRelease('2')).toBe(1)
    expect(getAllReleases().map((r) => r.id)).toEqual(['1.1'])
  })
})

describe('phases', () => {
  it('keeps display_order contiguous after a create', () => {
    createPhase({ id: 'third', name: 'Third', epic_ref: '', epic_description: '' })
    expect(getAllPhases().map((p) => p.display_order)).toEqual([1, 2, 3])
  })

  it('moves a phase down and renumbers', () => {
    const before = getAllPhases().map((p) => p.id)
    expect(movePhase(before[0], 'down')).toBe(true)

    const after = getAllPhases()
    expect(after.map((p) => p.id)).toEqual([before[1], before[0]])
    expect(after.map((p) => p.display_order)).toEqual([1, 2])
  })

  it('moves a phase up again', () => {
    const before = getAllPhases().map((p) => p.id)
    movePhase(before[0], 'down')
    movePhase(before[0], 'up')
    expect(getAllPhases().map((p) => p.id)).toEqual(before)
  })

  it('reports no move at the boundary, leaving order untouched', () => {
    const before = getAllPhases().map((p) => p.id)
    expect(movePhase(before[0], 'up')).toBe(false)
    expect(getAllPhases().map((p) => p.id)).toEqual(before)
  })

  it('closes a gap in display_order', () => {
    db.prepare("UPDATE phases SET display_order = 9 WHERE id = 'outcomes-and-support'").run()
    renumberPhases()
    expect(getAllPhases().map((p) => p.display_order)).toEqual([1, 2])
  })

  it('counts dependents and deletes once free', () => {
    expect(countPhaseDependents('manage-vacancies')).toEqual({
      features: 1,
      capabilities: 0,
    })
    expect(deletePhase('outcomes-and-support')).toBe(1)
  })

  it('patches a name without touching the epic ref', () => {
    updatePhase('manage-vacancies', { name: 'Vacancies' })
    const phase = getAllPhases().find((p) => p.id === 'manage-vacancies')!
    expect(phase).toMatchObject({ name: 'Vacancies', epic_ref: '177' })
  })
})

describe('assumptions', () => {
  const seedFour = () => {
    for (const text of ['one', 'two', 'three', 'four']) appendAssumption('F-001', text)
    return getAssumptionsForFeature('F-001')
  }

  it('appends in order', () => {
    expect(seedFour().map((a) => [a.position, a.text])).toEqual([
      [1, 'one'],
      [2, 'two'],
      [3, 'three'],
      [4, 'four'],
    ])
  })

  it('leaves positions contiguous after deleting the second of four', () => {
    const rows = seedFour()
    deleteAssumption(rows[1].id)

    const after = getAssumptionsForFeature('F-001')
    expect(after.map((a) => a.position)).toEqual([1, 2, 3])
    expect(after.map((a) => a.text)).toEqual(['one', 'three', 'four'])
  })

  it('moves one down without drag', () => {
    const rows = seedFour()
    moveAssumption(rows[0].id, 'down')
    expect(getAssumptionsForFeature('F-001').map((a) => a.text)).toEqual([
      'two',
      'one',
      'three',
      'four',
    ])
  })

  it('moves one up without drag', () => {
    const rows = seedFour()
    moveAssumption(rows[3].id, 'up')
    expect(getAssumptionsForFeature('F-001').map((a) => a.text)).toEqual([
      'one',
      'two',
      'four',
      'three',
    ])
  })

  it('does not move past the ends', () => {
    const rows = seedFour()
    expect(moveAssumption(rows[0].id, 'up')).toBe(false)
    expect(moveAssumption(rows[3].id, 'down')).toBe(false)
    expect(getAssumptionsForFeature('F-001').map((a) => a.position)).toEqual([1, 2, 3, 4])
  })

  it('keeps positions contiguous through repeated moves', () => {
    const rows = seedFour()
    moveAssumption(rows[3].id, 'up')
    moveAssumption(rows[3].id, 'up')
    moveAssumption(rows[0].id, 'down')
    expect(getAssumptionsForFeature('F-001').map((a) => a.position)).toEqual([1, 2, 3, 4])
  })

  it('marks an edited assumption manual', () => {
    const rows = seedFour()
    const updated = updateAssumptionText(rows[0].id, 'edited')
    expect(updated).toMatchObject({ text: 'edited', source: 'manual' })
  })

  /**
   * A move is a swap plus two renumbers. If any step fails the whole thing
   * must roll back, or the list is left with a duplicate or missing position.
   */
  it('rolls a failed move back completely', () => {
    const rows = seedFour()
    const before = getAssumptionsForFeature('F-001').map((a) => [a.id, a.position])

    const original = db.prepare.bind(db)
    let runs = 0
    // The swap prepares once and runs twice, so failing on prepare would
    // never fire — the second run is the one to break.
    const spy = vi.spyOn(db, 'prepare').mockImplementation(((sql: string) => {
      const statement = original(sql)
      if (!sql.includes('UPDATE assumptions SET position')) return statement
      return new Proxy(statement, {
        get(target, property, receiver) {
          if (property !== 'run') return Reflect.get(target, property, receiver)
          return (...args: unknown[]) => {
            runs += 1
            if (runs === 2) throw new Error('disk full')
            return (target.run as (...a: unknown[]) => unknown)(...args)
          }
        },
      })
    }) as typeof db.prepare)

    expect(() => moveAssumption(rows[0].id, 'down')).toThrow('disk full')
    spy.mockRestore()

    expect(getAssumptionsForFeature('F-001').map((a) => [a.id, a.position])).toEqual(before)
  })
})

describe('mvp features', () => {
  it('accepts the same ref with a different option as a separate record', () => {
    createMvpFeature({ ref: 951, scope_option: '1A', title: 'A' })
    createMvpFeature({ ref: 951, scope_option: '1B', title: 'B' })
    createMvpFeature({ ref: 951, scope_option: null, title: 'bare' })
    expect(getAllMvpFeatures().filter((m) => m.ref === 951)).toHaveLength(3)
  })

  it('rejects a duplicate (ref, option) pair', () => {
    createMvpFeature({ ref: 951, scope_option: '1A', title: 'A' })
    expect(() => createMvpFeature({ ref: 951, scope_option: '1A', title: 'again' })).toThrow(
      /UNIQUE constraint failed/,
    )
  })

  it('rejects a second bare record for the same ref', () => {
    createMvpFeature({ ref: 951, scope_option: null, title: 'bare' })
    expect(() => createMvpFeature({ ref: 951, scope_option: null, title: 'bare again' })).toThrow(
      /UNIQUE constraint failed/,
    )
  })

  it('changes an option, which is how a bare record is resolved (D-3)', () => {
    const created = createMvpFeature({ ref: 938, scope_option: null, title: 'bare' })
    updateMvpFeature(created.id, { scope_option: '1A' })
    expect(findMvpFeature(938, '1A')).toBeDefined()
    expect(findMvpFeature(938, null)).toBeUndefined()
  })

  it('deletes when nothing references it', () => {
    const created = createMvpFeature({ ref: 994, scope_option: null, title: 'x' })
    expect(deleteMvpFeature(created.id)).toBe(1)
  })
})

describe('capabilities', () => {
  const make = (text = 'Do a thing') =>
    createCapability({
      mvp_ref: 994,
      mvp_feature_id: null,
      text,
      actor: 'staff',
      release_id: '1.1',
      phase_id: 'manage-vacancies',
    })

  it('creates one marked manual', () => {
    expect(make()).toMatchObject({ text: 'Do a thing', actor: 'staff', source: 'manual' })
  })

  it('rejects an unknown actor at the database level', () => {
    expect(() =>
      createCapability({
        mvp_ref: 994,
        mvp_feature_id: null,
        text: 'x',
        actor: 'manager',
        release_id: '1.1',
        phase_id: 'manage-vacancies',
      }),
    ).toThrow(/CHECK constraint failed/)
  })

  it('rejects a release that does not exist', () => {
    expect(() =>
      createCapability({
        mvp_ref: 994,
        mvp_feature_id: null,
        text: 'x',
        actor: 'staff',
        release_id: 'nope',
        phase_id: 'manage-vacancies',
      }),
    ).toThrow(/FOREIGN KEY constraint failed/)
  })

  it('enforces case-insensitive identity per ref', () => {
    make('Do a thing')
    expect(() => make('DO A THING')).toThrow(/UNIQUE constraint failed/)
  })

  it('patches the actor and marks it manual', () => {
    const created = make()
    updateCapability(created.id, { actor: 'employer' })
    expect(getCapabilityById(created.id)).toMatchObject({
      actor: 'employer',
      source: 'manual',
    })
  })

  it('counts only live feature links as dependents', () => {
    const created = make()
    expect(countCapabilityDependents(created.id)).toEqual({ features: 0 })
  })

  it('deletes when nothing references it', () => {
    const created = make()
    expect(deleteCapability(created.id)).toBe(1)
    expect(getCapabilityById(created.id)).toBeUndefined()
  })
})
