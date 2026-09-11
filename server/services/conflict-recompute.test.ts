import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = new Database(':memory:')
db.pragma('foreign_keys = ON')

vi.mock('../database.js', () => ({ db }))

const { resetSchema } = await import('../test-support/apply-migrations.js')
const { importScope } = await import('./importer.js')
const { loadScopeFromSources } = await import('./scope-source.js')
const {
  deriveLinkConflict,
  recomputeAllConflicts,
  recomputeConflictsForCapability,
  recomputeConflictsForFeature,
} = await import('./conflict-recompute.js')
const { getAllConflictInputs, getAllFeatureCapabilityLinks } = await import(
  '../repositories/feature-link-repository.js'
)
const { updateCapability } = await import('../repositories/capability-repository.js')
const { updatePwcFeature } = await import('../repositories/pwc-feature-repository.js')

const reconciled = loadScopeFromSources()

const flags = () =>
  getAllFeatureCapabilityLinks()
    .filter((l) => l.removed_at === null)
    .map((l) => `${l.id}:${l.release_conflict}${l.phase_conflict}${l.phase_conflict_merged}`)

beforeEach(() => {
  resetSchema(db)
  importScope(reconciled)
})

describe('recompute agrees with the reconciler', () => {
  /**
   * The rules are written twice — once over parsed documents in reconcile.ts
   * and once over database rows here. This is what keeps them the same rules.
   */
  it('changes nothing when run over a freshly imported graph', () => {
    const before = flags()
    expect(recomputeAllConflicts()).toBe(0)
    expect(flags()).toEqual(before)
  })

  it('reproduces the import counts exactly', () => {
    recomputeAllConflicts()
    const links = getAllFeatureCapabilityLinks().filter((l) => l.removed_at === null)
    expect(links.filter((l) => l.release_conflict === 1)).toHaveLength(
      reconciled.summary.releaseConflicts,
    )
    expect(links.filter((l) => l.phase_conflict === 1)).toHaveLength(
      reconciled.summary.phaseConflicts,
    )
    expect(
      links.filter((l) => l.phase_conflict === 1 && l.phase_conflict_merged === 0),
    ).toHaveLength(reconciled.summary.phaseConflictsAfterMerge)
  })

  it('is idempotent', () => {
    recomputeAllConflicts()
    const once = flags()
    expect(recomputeAllConflicts()).toBe(0)
    expect(flags()).toEqual(once)
  })
})

describe('deriveLinkConflict', () => {
  const base = {
    link_id: 1,
    pwc_feature_id: 'F-001',
    capability_id: 1,
    matched: 1,
    feature_release_id: '1.1',
    feature_phase_id: 'access-and-onboarding',
    feature_phase_label: 'Access & onboarding',
    capability_release_id: '1.1',
    capability_phase_id: 'access-and-onboarding',
    capability_phase_label: 'Access & onboarding',
    release_conflict: 0,
    phase_conflict: 0,
    phase_conflict_merged: 0,
  }

  it('finds no conflict when both agree', () => {
    expect(deriveLinkConflict(base)).toMatchObject({
      release_conflict: 0,
      phase_conflict: 0,
    })
  })

  it('flags a release difference and records both placements', () => {
    expect(deriveLinkConflict({ ...base, capability_release_id: '1.4' })).toMatchObject({
      release_conflict: 1,
      feature_release_id: '1.1',
      capability_release_id: '1.4',
    })
  })

  it('ignores case and padding in the phase label', () => {
    expect(
      deriveLinkConflict({ ...base, capability_phase_label: '  ACCESS & ONBOARDING ' }),
    ).toMatchObject({ phase_conflict: 0 })
  })

  it('marks a label difference the canonical merge settles', () => {
    expect(
      deriveLinkConflict({ ...base, capability_phase_label: 'Onboarding via invite' }),
    ).toMatchObject({ phase_conflict: 1, phase_conflict_merged: 1 })
  })

  it('does not mark a real phase difference as merged', () => {
    expect(
      deriveLinkConflict({
        ...base,
        capability_phase_id: 'manage-vacancies',
        capability_phase_label: 'Manage Vacancies',
      }),
    ).toMatchObject({ phase_conflict: 1, phase_conflict_merged: 0 })
  })

  it('finds no release conflict when the capability is unplaced', () => {
    expect(deriveLinkConflict({ ...base, capability_release_id: null })).toMatchObject({
      release_conflict: 0,
    })
  })

  it('carries no conflict on an unmatched link', () => {
    expect(
      deriveLinkConflict({ ...base, matched: 0, capability_release_id: '1.4' }),
    ).toMatchObject({ release_conflict: 0, phase_conflict: 0 })
  })

  it('clears the recorded placements once a link settles', () => {
    const settled = deriveLinkConflict(base)
    expect(settled.feature_release_id).toBeNull()
    expect(settled.capability_release_id).toBeNull()
    expect(settled.feature_phase_label).toBeNull()
  })
})

describe('recomputeConflictsForCapability', () => {
  /** Cited by F-001 and F-002, both in 1.1, while it sits in 1.4. */
  const shared = () =>
    getAllConflictInputs().filter(
      (i) => i.capability_release_id === '1.4' && i.feature_release_id === '1.1',
    )

  it('settles every citing feature when the capability moves to meet them', () => {
    const links = shared()
    expect(links.length).toBeGreaterThan(1)
    const capabilityId = links[0].capability_id
    const affected = links.filter((l) => l.capability_id === capabilityId)
    expect(affected.length).toBeGreaterThan(1)

    updateCapability(capabilityId, { release_id: '1.1' })
    const updated = recomputeConflictsForCapability(capabilityId)

    expect(updated).toBe(affected.length)
    for (const input of getAllConflictInputs().filter(
      (i) => i.capability_id === capabilityId,
    )) {
      expect(input.release_conflict).toBe(0)
    }
  })

  it('creates a conflict when the capability moves away from agreement', () => {
    const agreeing = getAllConflictInputs().find(
      (i) => i.release_conflict === 0 && i.matched === 1 && i.capability_release_id !== null,
    )!
    updateCapability(agreeing.capability_id, { release_id: '2' })
    recomputeConflictsForCapability(agreeing.capability_id)

    const after = getAllConflictInputs().find((i) => i.link_id === agreeing.link_id)!
    expect(after.release_conflict).toBe(1)
  })

  it('touches no other capability', () => {
    const target = shared()[0]
    const others = () =>
      flags().filter((f) => !f.startsWith(`${target.link_id}:`))
    const before = others()
    updateCapability(target.capability_id, { release_id: '1.1' })
    recomputeConflictsForCapability(target.capability_id)
    // Only links to the moved capability may change.
    const movedLinks = new Set(
      getAllConflictInputs()
        .filter((i) => i.capability_id === target.capability_id)
        .map((i) => `${i.link_id}:`),
    )
    const unrelatedBefore = before.filter(
      (f) => ![...movedLinks].some((p) => f.startsWith(p)),
    )
    const unrelatedAfter = others().filter(
      (f) => ![...movedLinks].some((p) => f.startsWith(p)),
    )
    expect(unrelatedAfter).toEqual(unrelatedBefore)
  })
})

describe('recomputeConflictsForFeature', () => {
  it('settles a feature moved to meet its capabilities', () => {
    const conflicted = getAllConflictInputs().filter(
      (i) => i.pwc_feature_id === 'F-001' && i.release_conflict === 1,
    )
    expect(conflicted.length).toBeGreaterThan(0)
    const target = conflicted[0].capability_release_id!

    updatePwcFeature('F-001', { release_id: target })
    recomputeConflictsForFeature('F-001')

    const after = getAllConflictInputs().filter((i) => i.pwc_feature_id === 'F-001')
    for (const input of after.filter((i) => i.capability_release_id === target)) {
      expect(input.release_conflict).toBe(0)
    }
  })
})
