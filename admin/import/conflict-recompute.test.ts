import { beforeEach, describe, expect, it } from 'vitest'
import type { ConflictInputs } from '../../src/lib/conflict-rules.js'
import { deriveScopeGraph } from '../../src/lib/scope-graph.js'
import {
  Draft,
  planUpdateCapability,
  planUpdateFeature,
  recomputeAllConflicts,
  type Plan,
  type PlanContext,
} from '../../src/lib/scope-plan.js'
import type { RawScope, Sequences } from '../../src/lib/scope-records.js'
import { planImport } from './plan-import.js'
import { loadScopeFromSources } from './scope-source.js'

/**
 * The SQLite conflict recompute's tests (server/services/
 * conflict-recompute.test.ts), ported onto the planners. Each test starts
 * from a fresh import of the real sources, committed to a store held here.
 *
 * The server moved a row and then recomputed in two calls; the planners do
 * both in one — planUpdateCapability and planUpdateFeature recompute the
 * links they touch. The server's recompute also returned how many links'
 * flags moved; that count is taken here by diffing the store before and
 * after the plan. The pure deriveLinkConflict cases live in
 * src/lib/conflict-rules.test.ts.
 */

const NOW = '2026-09-11 00:00:00'

const reconciled = loadScopeFromSources()

let store: { raw: RawScope; sequences: Sequences }

const ctx = (): PlanContext => ({ raw: store.raw, now: NOW, sequences: store.sequences })

/** Commits a plan, returning how many live links' conflict flags it moved. */
function commit<T>(plan: Plan<T>): number {
  const flagsOf = (raw: RawScope) =>
    new Map(
      raw.featureCapabilityLinks.map((l) => [
        l.id,
        `${l.release_conflict}${l.phase_conflict}${l.phase_conflict_merged}`,
      ]),
    )
  const before = flagsOf(store.raw)
  const moved = plan.next.featureCapabilityLinks.filter(
    (l) =>
      l.removed_at === null &&
      before.get(l.id) !== `${l.release_conflict}${l.phase_conflict}${l.phase_conflict_merged}`,
  ).length
  store = { raw: plan.next, sequences: { ...store.sequences, ...plan.sequences } }
  return moved
}

/** The server's recomputeAllConflicts(): every live link, as one plan. */
function recomputeAll(): number {
  const d = new Draft(ctx())
  recomputeAllConflicts(d)
  return commit(d.done(null))
}

const updateCapability = (id: number, body: unknown) => commit(planUpdateCapability(ctx(), id, body))
const updatePwcFeature = (id: string, body: unknown) => commit(planUpdateFeature(ctx(), id, body))

/** Live links in the order the graph serves them — tombstones already dropped. */
const getAllFeatureCapabilityLinks = () => deriveScopeGraph(store.raw).featureCapabilityLinks

/** Live links joined to their feature and capability, by link id — the old SQL join. */
function getAllConflictInputs(): ConflictInputs[] {
  const out: ConflictInputs[] = []
  for (const l of [...store.raw.featureCapabilityLinks].sort((a, b) => a.id - b.id)) {
    if (l.removed_at !== null) continue
    const f = store.raw.pwcFeatures.find((row) => row.id === l.pwc_feature_id)
    const c = store.raw.capabilities.find((row) => row.id === l.capability_id)
    if (!f || !c) continue
    out.push({
      link_id: l.id,
      pwc_feature_id: l.pwc_feature_id,
      capability_id: l.capability_id,
      matched: l.matched,
      feature_release_id: f.release_id,
      feature_phase_id: f.phase_id,
      feature_phase_label: f.source_phase_label,
      capability_release_id: c.release_id,
      capability_phase_id: c.phase_id,
      capability_phase_label: c.source_phase_label,
      release_conflict: l.release_conflict,
      phase_conflict: l.phase_conflict,
      phase_conflict_merged: l.phase_conflict_merged,
    })
  }
  return out
}

const flags = () =>
  getAllFeatureCapabilityLinks().map((l) => `${l.id}:${l.release_conflict}${l.phase_conflict}${l.phase_conflict_merged}`)

beforeEach(() => {
  store = {
    raw: {
      releases: [],
      phases: [],
      pwcFeatures: [],
      mvpFeatures: [],
      capabilities: [],
      featureMvpLinks: [],
      featureCapabilityLinks: [],
    },
    sequences: { mvp_features: 0, capabilities: 0, pwc_feature_capabilities: 0 },
  }
  commit(planImport(ctx(), reconciled))
})

describe('recompute agrees with the reconciler', () => {
  /**
   * The rules are written twice — once over parsed documents in reconcile.ts
   * and once over stored rows in scope-plan.ts. This is what keeps them the
   * same rules.
   */
  it('changes nothing when run over a freshly imported graph', () => {
    const before = flags()
    expect(recomputeAll()).toBe(0)
    expect(flags()).toEqual(before)
  })

  it('reproduces the import counts exactly', () => {
    recomputeAll()
    const links = getAllFeatureCapabilityLinks()
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
    recomputeAll()
    const once = flags()
    expect(recomputeAll()).toBe(0)
    expect(flags()).toEqual(once)
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

    // Move and recompute, in one plan.
    const updated = updateCapability(capabilityId, { release_id: '1.1' })

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

    const after = getAllConflictInputs().find((i) => i.link_id === agreeing.link_id)!
    expect(after.release_conflict).toBe(1)
  })

  it('touches no other capability', () => {
    const target = shared()[0]
    const others = () =>
      flags().filter((f) => !f.startsWith(`${target.link_id}:`))
    const before = others()
    updateCapability(target.capability_id, { release_id: '1.1' })
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

    // Move and recompute, in one plan.
    updatePwcFeature('F-001', { release_id: target })

    const after = getAllConflictInputs().filter((i) => i.pwc_feature_id === 'F-001')
    for (const input of after.filter((i) => i.capability_release_id === target)) {
      expect(input.release_conflict).toBe(0)
    }
  })
})
