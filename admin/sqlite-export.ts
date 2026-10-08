import type BetterSqlite3 from 'better-sqlite3'
import type { RawScope, Sequences } from '../src/lib/scope-records.js'

/**
 * Reads the whole SQLite database into the stored-document shape, verbatim:
 * every column, including the ones the API hides (`source_text`) and the
 * tombstoned links (`removed_at` set) that keep a removal from being undone
 * by re-import.
 *
 * Used by the one-time seed and by the oracle tests, so what is seeded is
 * exactly what was tested.
 */
export function exportRawScope(db: BetterSqlite3.Database): RawScope {
  const all = <T>(sql: string) => db.prepare(sql).all() as T[]
  return {
    releases: all('SELECT * FROM releases ORDER BY id'),
    phases: all('SELECT * FROM phases ORDER BY id'),
    pwcFeatures: all('SELECT * FROM pwc_features ORDER BY id'),
    mvpFeatures: all('SELECT * FROM mvp_features ORDER BY id'),
    capabilities: all('SELECT * FROM capabilities ORDER BY id'),
    featureMvpLinks: all(
      'SELECT * FROM pwc_feature_mvp_features ORDER BY pwc_feature_id, mvp_feature_id',
    ),
    featureCapabilityLinks: all('SELECT * FROM pwc_feature_capabilities ORDER BY id'),
  }
}

/** The AUTOINCREMENT counters — higher than the max id wherever a row was deleted. */
export function exportSequences(db: BetterSqlite3.Database): Sequences {
  const rows = db.prepare('SELECT name, seq FROM sqlite_sequence').all() as {
    name: string
    seq: number
  }[]
  const seq = (name: string) => rows.find((r) => r.name === name)?.seq ?? 0
  return {
    mvp_features: seq('mvp_features'),
    capabilities: seq('capabilities'),
    pwc_feature_capabilities: seq('pwc_feature_capabilities'),
  }
}
