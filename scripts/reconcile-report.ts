import {
  EXPECTED_COUNTS,
  EXPECTED_RELEASE_CONFLICTS,
  findCountDrift,
  loadScopeFromSources,
} from '../server/services/scope-source.js'

const result = loadScopeFromSources()
const s = result.summary

const pad = (v: string | number, n: number) => String(v).padStart(n)

console.log('Reconciliation summary — PwC scope mapping × R1 sequencing table')
console.log('='.repeat(64))
console.log()

if (result.appliedSplits.length > 0) {
  console.log('Declared splits applied before reconciliation')
  console.log('  ' + '-'.repeat(52))
  for (const applied of result.appliedSplits) {
    console.log(`  ${applied.split.id}  ${applied.from.featureId} "${applied.from.name}"`)
    for (const part of applied.into) {
      console.log(
        `     → ${part.featureId}  ${part.phaseId} / ${part.releaseId}` +
          `  (${part.capabilities} capabilities)`,
      )
    }
  }
  console.log()
}

if (result.appliedOverrides.length > 0) {
  console.log('Declared overrides applied before reconciliation')
  console.log('  ' + '-'.repeat(52))
  for (const applied of result.appliedOverrides) {
    console.log(`  ${applied.override.id}  ${applied.override.featureId}`)
    console.log(
      `     release ${applied.from.releaseId} → ${applied.to.releaseId}` +
        `   phase ${applied.from.sourcePhaseLabel} → ${applied.to.sourcePhaseLabel}`,
    )
  }
  console.log()
}
console.log('  metric                       actual   expected   ')
console.log('  ' + '-'.repeat(52))
for (const [key, expected] of Object.entries(EXPECTED_COUNTS)) {
  const actual = s[key as keyof typeof EXPECTED_COUNTS]
  const ok = actual === expected
  console.log(
    `  ${key.padEnd(26)} ${pad(actual, 6)}   ${pad(expected, 8)}   ${ok ? 'ok' : 'DRIFT'}`,
  )
}

console.log()
console.log('Release conflicts by pair')
console.log('  ' + '-'.repeat(52))
for (const b of s.releaseConflictBreakdown) {
  const expected = EXPECTED_RELEASE_CONFLICTS.find(
    (e) => e.from === b.from && e.to === b.to,
  )
  const ok = expected?.links === b.links
  console.log(
    `  ${(b.from + ' → ' + b.to).padEnd(26)} ${pad(b.links, 6)}   ${pad(
      expected?.links ?? '—',
      8,
    )}   ${ok ? 'ok' : 'DRIFT'}`,
  )
}

console.log()
console.log('Phase conflicts by label pair')
console.log('  ' + '-'.repeat(52))
const grouped = new Map<string, number>()
for (const c of result.conflicts.phase) {
  const key = `${c.featurePhaseLabel} vs ${c.capabilityPhaseLabel}`
  grouped.set(key, (grouped.get(key) ?? 0) + 1)
}
for (const [key, count] of [...grouped.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${key.padEnd(50)} ${pad(count, 3)}`)
}
console.log(
  `  ${'→ resolved by the canonical phase merge'.padEnd(50)} ${pad(
    s.phaseConflicts - s.phaseConflictsAfterMerge,
    3,
  )}`,
)
console.log(
  `  ${'→ remaining for human review'.padEnd(50)} ${pad(s.phaseConflictsAfterMerge, 3)}`,
)

console.log()
console.log('Unmatched capability links')
console.log('  ' + '-'.repeat(52))
for (const u of result.conflicts.unmatched) {
  console.log(`  ${u.pwcFeatureId}  ${u.text} (${u.actor}, ${u.ref})`)
}

console.log()
const drift = findCountDrift(result)
if (drift.length > 0) {
  console.error(`FAIL — ${drift.length} count(s) drifted from PRD §6:`)
  for (const d of drift) {
    console.error(`  ${d.key}: got ${d.actual}, expected ${d.expected}`)
  }
  process.exit(1)
}
console.log('All counts match PRD §6 and §7.')
