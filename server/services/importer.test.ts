import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = new Database(':memory:')
db.pragma('foreign_keys = ON')

vi.mock('../database.js', () => ({ db }))

const here = path.dirname(fileURLToPath(import.meta.url))
const SCHEMA = fs.readFileSync(
  path.join(here, '..', 'migrations', '002_create_scope_schema.sql'),
  'utf8',
)

const { ImportDriftError, chooseMvpOwner, importScope } = await import('./importer.js')
const { loadScopeFromSources } = await import('./scope-source.js')
const { getScopeGraph } = await import('../repositories/scope-repository.js')

const reconciled = loadScopeFromSources()

function reset() {
  db.pragma('foreign_keys = OFF')
  for (const { name } of db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all() as { name: string }[]) {
    db.exec(`DROP TABLE IF EXISTS "${name}"`)
  }
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
}

beforeEach(reset)

describe('chooseMvpOwner (D-3)', () => {
  const record = (scopeOption: '1A' | '1B' | null) => ({
    ref: 938,
    scopeOption,
    title: 't',
    source: 'mapping' as const,
  })

  it('is unambiguous when the ref has one record', () => {
    expect(chooseMvpOwner([record('1A')])).toEqual({
      owner: record('1A'),
      ambiguous: false,
    })
  })

  it('prefers the option-agnostic bare record, and flags the choice', () => {
    const result = chooseMvpOwner([record('1A'), record(null)])
    expect(result.owner?.scopeOption).toBeNull()
    expect(result.ambiguous).toBe(true)
  })

  it('falls back to the lowest option when there is no bare record', () => {
    const result = chooseMvpOwner([record('1B'), record('1A')])
    expect(result.owner?.scopeOption).toBe('1A')
    expect(result.ambiguous).toBe(true)
  })

  it('returns no owner for a ref with no records', () => {
    expect(chooseMvpOwner([])).toEqual({ owner: null, ambiguous: false })
  })
})

describe('importScope writes the whole graph', () => {
  it('reports the reconciled counts', () => {
    const summary = importScope(reconciled)
    expect(summary).toMatchObject({
      releases: 6,
      phases: 7,
      pwcFeatures: 48,
      assumptions: 92,
      mvpFeatures: 51,
      capabilities: 107,
      featureMvpLinks: 60,
      releaseConflicts: 35,
      phaseConflicts: 21,
      unmatchedLinks: 2,
    })
  })

  it('collapses the duplicate citation into one edge, keeping the total', () => {
    const summary = importScope(reconciled)
    // F-079 cites both casings of ref 980: one edge, two citations.
    expect(summary.featureCapabilityEdges).toBe(122)
    expect(summary.featureCapabilityCitations).toBe(123)
    expect(summary.collapsedDuplicateCitations).toBe(1)

    const doubled = db
      .prepare('SELECT pwc_feature_id, source_citations FROM pwc_feature_capabilities WHERE source_citations > 1')
      .all()
    expect(doubled).toEqual([{ pwc_feature_id: 'F-079', source_citations: 2 }])
  })

  it('flags the capabilities whose MVP owner was chosen by rule', () => {
    const summary = importScope(reconciled)
    expect(summary.ambiguousMvpOwners).toBe(10)

    const flagged = db
      .prepare('SELECT DISTINCT mvp_ref FROM capabilities WHERE mvp_owner_ambiguous = 1 ORDER BY mvp_ref')
      .all()
    expect(flagged).toEqual([{ mvp_ref: 938 }, { mvp_ref: 946 }, { mvp_ref: 951 }])
  })

  it('records both placements of a release conflict, discarding neither', () => {
    importScope(reconciled)
    const row = db
      .prepare(
        `SELECT l.feature_release_id, l.capability_release_id, c.release_id, f.release_id AS f_release
           FROM pwc_feature_capabilities l
           JOIN capabilities c ON c.id = l.capability_id
           JOIN pwc_features f ON f.id = l.pwc_feature_id
          WHERE l.pwc_feature_id = 'F-014' AND l.release_conflict = 1`,
      )
      .get() as Record<string, string>

    expect(row.feature_release_id).toBe('1.1')
    expect(row.capability_release_id).toBe('1.4')
    // Neither source was overwritten.
    expect(row.f_release).toBe('1.1')
    expect(row.release_id).toBe('1.4')
  })

  it('marks the two unmatched links, leaving their capability unplaced', () => {
    importScope(reconciled)
    const rows = db
      .prepare(
        `SELECT l.pwc_feature_id, c.text, c.release_id
           FROM pwc_feature_capabilities l
           JOIN capabilities c ON c.id = l.capability_id
          WHERE l.matched = 0 ORDER BY l.pwc_feature_id`,
      )
      .all()
    expect(rows).toEqual([
      { pwc_feature_id: 'F-050', text: 'Review & publish vacancies', release_id: null },
      { pwc_feature_id: 'F-051', text: 'Review & publish vacancies', release_id: null },
    ])
  })

  it('flags the 11 phase conflicts the canonical merge resolves', () => {
    importScope(reconciled)
    const merged = db
      .prepare('SELECT COUNT(*) AS n FROM pwc_feature_capabilities WHERE phase_conflict_merged = 1')
      .get()
    expect(merged).toEqual({ n: 11 })
  })

  it('starts every conflict unreviewed (R-7.2)', () => {
    importScope(reconciled)
    const states = db
      .prepare('SELECT DISTINCT resolution_state FROM pwc_feature_capabilities')
      .all()
    expect(states).toEqual([{ resolution_state: 'unreviewed' }])
  })
})

describe('importScope is idempotent (R-11.4)', () => {
  it('produces identical counts when run three times', () => {
    const first = importScope(reconciled)
    const second = importScope(reconciled)
    const third = importScope(reconciled)
    expect(second).toEqual(first)
    expect(third).toEqual(first)
  })

  it('leaves the graph unchanged on re-run', () => {
    importScope(reconciled)
    const before = getScopeGraph().counts
    importScope(reconciled)
    expect(getScopeGraph().counts).toEqual(before)
  })
})

describe('importScope refuses to write a drifted graph (R-11.3)', () => {
  it('throws before touching the database', () => {
    const short = {
      ...reconciled,
      features: reconciled.features.slice(0, 47),
      summary: { ...reconciled.summary, pwcFeatures: 47 },
    }

    expect(() => importScope(short)).toThrow(ImportDriftError)
    // Nothing was written — the check runs first.
    expect(db.prepare('SELECT COUNT(*) AS n FROM pwc_features').get()).toEqual({ n: 0 })
  })

  it('names every drifted metric', () => {
    const short = {
      ...reconciled,
      summary: { ...reconciled.summary, pwcFeatures: 47, capabilities: 106 },
    }
    try {
      importScope(short)
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(ImportDriftError)
      const drift = (error as InstanceType<typeof ImportDriftError>).drift
      expect(drift.map((d) => d.key).sort()).toEqual(['capabilities', 'pwcFeatures'])
    }
  })
})

describe('the whole import is one transaction', () => {
  it('rolls back completely if a write fails part-way', () => {
    // Break a foreign key the importer depends on: a feature referencing a
    // phase that will not exist.
    const broken = {
      ...reconciled,
      features: reconciled.features.map((f, i) =>
        i === 0 ? { ...f, phaseId: 'does-not-exist' } : f,
      ),
    }

    expect(() => importScope(broken)).toThrow(/FOREIGN KEY constraint failed/)
    // Releases are written before features; the rollback must undo them too.
    expect(db.prepare('SELECT COUNT(*) AS n FROM releases').get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM capabilities').get()).toEqual({ n: 0 })
  })
})
