import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = new Database(':memory:')
db.pragma('foreign_keys = ON')

vi.mock('../database.js', () => ({ db }))

const { resetSchema } = await import('../test-support/apply-migrations.js')


const { ImportDriftError, chooseMvpOwner, importScope } = await import('./importer.js')
const { loadScopeFromSources } = await import('./scope-source.js')
const { getScopeGraph } = await import('../repositories/scope-repository.js')

const reconciled = loadScopeFromSources()

function reset() {
  resetSchema(db)
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
      // 5, not 6: OV-003 merges 1.9 into 1.4.
      releases: 5,
      phases: 7,
      pwcFeatures: 49,
      assumptions: 92,
      mvpFeatures: 51,
      capabilities: 107,
      featureMvpLinks: 60,
      // Post-split figures: OV-002 divides F-085 into F-085 + F-093, and
      // OV-003 clears the five 1.9 → 1.4 links by making them one release.
      releaseConflicts: 29,
      phaseConflicts: 18,
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

  it('writes both halves of the F-085 split', () => {
    importScope(reconciled)
    const rows = db
      .prepare(
        `SELECT id, name, release_id, phase_id FROM pwc_features
          WHERE id IN ('F-085', 'F-093') ORDER BY id`,
      )
      .all()
    expect(rows).toEqual([
      {
        id: 'F-085',
        name: 'Record vacancy outcome',
        release_id: '1.2',
        phase_id: 'manage-vacancies',
      },
      {
        id: 'F-093',
        name: 'Record applicant progression outcome',
        release_id: '1.3',
        phase_id: 'employer-recruitment',
      },
    ])
  })

  it('gives each half of the split its own assumptions', () => {
    importScope(reconciled)
    const counts = db
      .prepare(
        `SELECT pwc_feature_id, COUNT(*) AS n FROM assumptions
          WHERE pwc_feature_id IN ('F-085','F-093')
          GROUP BY pwc_feature_id ORDER BY pwc_feature_id`,
      )
      .all()
    expect(counts).toEqual([
      { pwc_feature_id: 'F-085', n: 1 },
      { pwc_feature_id: 'F-093', n: 2 },
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

/**
 * The summary is derived from the reconciler, so asserting it cannot catch an
 * import that writes fewer rows than it reconciled. These compare what is
 * actually in the database against the reconciled input.
 */
describe('importScope writes exactly what it reconciled', () => {
  const rows = (table: string) =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n

  it('writes a row per reconciled entity', () => {
    importScope(reconciled)

    expect(rows('releases')).toBe(reconciled.releases.length)
    expect(rows('phases')).toBe(reconciled.phases.length)
    expect(rows('pwc_features')).toBe(reconciled.features.length)
    expect(rows('assumptions')).toBe(reconciled.assumptions.length)
    expect(rows('mvp_features')).toBe(reconciled.mvpFeatures.length)
    expect(rows('capabilities')).toBe(reconciled.capabilities.length)
    expect(rows('pwc_feature_mvp_features')).toBe(reconciled.featureMvpLinks.length)
  })

  it('writes one edge per distinct pair, and citations that sum to the links', () => {
    const summary = importScope(reconciled)
    expect(rows('pwc_feature_capabilities')).toBe(summary.featureCapabilityEdges)

    const citations = db
      .prepare('SELECT IFNULL(SUM(source_citations), 0) AS n FROM pwc_feature_capabilities')
      .get() as { n: number }
    expect(citations.n).toBe(reconciled.featureCapabilityLinks.length)
  })

  it('writes every feature\'s assumptions, not just most of them', () => {
    importScope(reconciled)
    const perFeature = new Map(
      (
        db
          .prepare('SELECT pwc_feature_id AS id, COUNT(*) AS n FROM assumptions GROUP BY 1')
          .all() as { id: string; n: number }[]
      ).map((row) => [row.id, row.n]),
    )

    const mismatched = reconciled.features
      .map((feature) => ({
        id: feature.id,
        expected: feature.assumptions.length,
        actual: perFeature.get(feature.id) ?? 0,
      }))
      .filter((row) => row.expected !== row.actual)

    expect(mismatched).toEqual([])
  })

  it('writes every reconciled MVP record, keyed on ref and option', () => {
    importScope(reconciled)
    const written = new Set(
      (
        db
          .prepare("SELECT ref, IFNULL(scope_option, '') AS o FROM mvp_features").all() as {
          ref: number
          o: string
        }[]
      ).map((row) => `${row.ref}|${row.o}`),
    )
    const expected = reconciled.mvpFeatures.map((m) => `${m.ref}|${m.scopeOption ?? ''}`)

    expect(expected.filter((key) => !written.has(key))).toEqual([])
    expect(written.size).toBe(expected.length)
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

describe('importScope sweeps releases the sources no longer name', () => {
  /**
   * The case OV-003 creates: an earlier import wrote 1.9, the alias means the
   * sources stop naming it, and an upsert-only import would leave it behind
   * as an empty orphan sharing another release's display_order.
   */
  const withStale = () => {
    db.prepare(
      `INSERT INTO releases (id, label, name, description, display_order,
                             in_mapping_source, in_sequencing_source, source)
       VALUES ('1.9', 'Release 1.9', '', '', 5, 1, 0, 'mapping')`,
    ).run()
  }

  it('drops a stale imported release', () => {
    withStale()
    const summary = importScope(reconciled)
    expect(summary.removedReleases).toEqual(['1.9'])
    expect(summary.retainedStaleReleases).toEqual([])
    expect(getScopeGraph().releases.map((r) => r.id)).not.toContain('1.9')
  })

  it('leaves display_order contiguous afterwards', () => {
    withStale()
    importScope(reconciled)
    const orders = getScopeGraph().releases.map((r) => r.display_order)
    expect(orders).toEqual([...orders].sort((a, b) => a - b))
    expect(new Set(orders).size).toBe(orders.length)
  })

  it('never drops a manual release the sources were never going to name', () => {
    db.prepare(
      `INSERT INTO releases (id, label, name, description, display_order,
                             in_mapping_source, in_sequencing_source, source)
       VALUES ('3', 'Release 3', '', '', 9, 0, 0, 'manual')`,
    ).run()
    const summary = importScope(reconciled)
    expect(summary.removedReleases).toEqual([])
    expect(getScopeGraph().releases.map((r) => r.id)).toContain('3')
  })

  it('retains a stale release that still has rows pointing at it', () => {
    withStale()
    // A capability parked on the stale release — deleting it would either
    // break the foreign key or silently orphan the row.
    db.prepare(
      `INSERT INTO capabilities (mvp_ref, text, actor, release_id, source)
       VALUES (9999, 'parked on the stale release', 'employer', '1.9', 'sequencing')`,
    ).run()

    const summary = importScope(reconciled)
    expect(summary.removedReleases).toEqual([])
    expect(summary.retainedStaleReleases).toEqual([
      { id: '1.9', features: 0, capabilities: 1 },
    ])
    expect(getScopeGraph().releases.map((r) => r.id)).toContain('1.9')
  })

  it('is a no-op when there is nothing stale', () => {
    importScope(reconciled)
    const summary = importScope(reconciled)
    expect(summary.removedReleases).toEqual([])
    expect(summary.retainedStaleReleases).toEqual([])
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
