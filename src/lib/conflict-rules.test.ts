import { describe, expect, it } from 'vitest'
import { deriveLinkConflict } from '@/lib/conflict-rules'

/**
 * The pure conflict rules, moved here from server/services/
 * conflict-recompute.test.ts — they never needed a database. The tests that
 * run the rules over a real import are in admin/import/conflict-recompute.test.ts.
 */
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
