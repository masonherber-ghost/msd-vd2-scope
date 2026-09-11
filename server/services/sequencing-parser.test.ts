import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseSequencingTable } from './sequencing-parser.js'
import { ParseError } from './scope-types.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixture = fs.readFileSync(
  path.join(here, '__fixtures__', 'sequencing-hazards.md'),
  'utf8',
)

const parsed = parseSequencingTable(fixture)

const HEADER =
  '| Release | Onboarding via invite | Access & Onboarding | Applications & Referrals | Outcomes & Support |'
const RULE = '| --- | --- | --- | --- | --- |'
const table = (...rows: string[]) => [HEADER, RULE, ...rows].join('\n')

describe('sequencing parser — structure', () => {
  it('reads the phase columns from the header row', () => {
    expect(parsed.phaseLabels).toEqual([
      'Onboarding via invite',
      'Access & Onboarding',
      'Applications & Referrals',
      'Outcomes & Support',
    ])
  })

  it('counts every cell, and how many are empty', () => {
    // 4 releases × 4 phase columns
    expect(parsed.cellCount).toBe(16)
    expect(parsed.emptyCellCount).toBe(12)
  })
})

describe('sequencing parser — hazard: bolded release labels', () => {
  it('strips the bold markers from a release label', () => {
    expect(parsed.releaseIds).toEqual(['1.1', '1.2', '1.4', '2'])
  })

  it('accepts a release with no minor version', () => {
    // "Release 2", not "Release 2.0"
    expect(parsed.releaseIds).toContain('2')
  })

  it('accepts an unbolded release label too', () => {
    const result = parseSequencingTable(
      table('| Release 1.1 | • A thing (staff, 900) | - | - | - |'),
    )
    expect(result.releaseIds).toEqual(['1.1'])
  })
})

describe('sequencing parser — hazard: <br>-joined cells', () => {
  it('splits a cell on <br> and strips the bullet glyph', () => {
    const applications = parsed.capabilities.filter((c) => c.ref === 980)
    expect(applications.map((c) => c.text)).toEqual([
      'Filter and Sort Applications',
      'Filter and sort applications',
    ])
    expect(applications.every((c) => !c.text.includes('•'))).toBe(true)
  })

  it('reads every entry in a multi-entry cell', () => {
    expect(parsed.capabilities).toHaveLength(6)
  })
})

describe('sequencing parser — hazard: literal "-" empty cells', () => {
  it('treats "-" as empty rather than as a capability', () => {
    expect(parsed.capabilities.some((c) => c.text === '-')).toBe(false)
  })

  it('rejects a truly blank cell, which is not the source convention', () => {
    const md = table('| **Release 1.1** |  | - | - | - |')
    expect(() => parseSequencingTable(md)).toThrow(ParseError)
    expect(() => parseSequencingTable(md)).toThrow(/must be a literal "-"/)
  })
})

describe('sequencing parser — hazard: phase casing normalises to canonical', () => {
  it('folds the invite column into Access & Onboarding, keeping the label', () => {
    const invite = parsed.capabilities.filter(
      (c) => c.sourcePhaseLabel === 'Onboarding via invite',
    )
    expect(invite).not.toHaveLength(0)
    expect(invite.every((c) => c.phaseId === 'access-and-onboarding')).toBe(true)
  })

  it('matches a column whose casing differs from canonical', () => {
    const md = table('| **Release 1.1** | - | - | - | • A thing (staff, 900) |').replace(
      'Outcomes & Support |\n',
      'outcomes & SUPPORT |\n',
    )
    const result = parseSequencingTable(md)
    expect(result.capabilities[0].phaseId).toBe('outcomes-and-support')
  })
})

describe('sequencing parser — records placement, which the table owns', () => {
  it('assigns each capability the release and phase of its cell', () => {
    const tcs = parsed.capabilities.find((c) => c.ref === 951)
    expect(tcs).toMatchObject({
      text: 'Electronic T&Cs acceptance',
      actor: 'employer',
      releaseId: '1.4',
      phaseId: 'access-and-onboarding',
      sourcePhaseLabel: 'Onboarding via invite',
    })
  })
})

describe('sequencing parser — fails loudly (R-11.2)', () => {
  it('names the line for a capability with no (actor, ref)', () => {
    const md = table('| **Release 1.1** | • No reference here | - | - | - |')
    expect(() => parseSequencingTable(md)).toThrow(/:3 —/)
    expect(() => parseSequencingTable(md)).toThrow(/no trailing "\(actor, ref\)"/)
  })

  it('rejects an unrecognised phase column', () => {
    const md = [
      '| Release | Invented Column |',
      '| --- | --- |',
      '| **Release 1.1** | - |',
    ].join('\n')
    expect(() => parseSequencingTable(md)).toThrow(/Unrecognised phase label "Invented Column"/)
  })

  it('rejects a row whose cell count does not match the header', () => {
    const md = table('| **Release 1.1** | - | - |')
    expect(() => parseSequencingTable(md)).toThrow(/has 2 cells, expected 4/)
  })

  it('rejects a first cell that is not a release label', () => {
    const md = table('| Not a release | - | - | - | - |')
    expect(() => parseSequencingTable(md)).toThrow(/Expected a release label/)
  })

  it('rejects a header row that does not start with Release', () => {
    const md = ['| Phase | Access & Onboarding |', '| --- | --- |'].join('\n')
    expect(() => parseSequencingTable(md)).toThrow(/Expected a header row beginning with "Release"/)
  })

  it('rejects an empty document', () => {
    expect(() => parseSequencingTable('')).toThrow(/Document is empty/)
  })
})

describe('parseSequencingTable — a preamble above the table', () => {
  const table = [
    '| Release | Access & Onboarding |',
    '| --- | --- |',
    '| **Release 1.1** | • Do a thing (staff, 938) |',
  ].join('\n')

  it('skips a prose sentence before the header', () => {
    const withPreamble = `The sequenced release capabilities table.\n\n${table}`
    const parsed = parseSequencingTable(withPreamble)
    expect(parsed.releaseIds).toEqual(['1.1'])
    expect(parsed.capabilities).toHaveLength(1)
  })

  it('parses identically with and without the preamble', () => {
    expect(parseSequencingTable(`Some words.\n\n${table}`)).toEqual(
      parseSequencingTable(table),
    )
  })

  it('reports line numbers against the real file, preamble included', () => {
    // The capability is on line 5 once two lines precede the table; an error
    // that named line 3 would send someone to the wrong row.
    const broken = `Preamble.\n\n${table.replace('(staff, 938)', '')}`
    expect(() => parseSequencingTable(broken)).toThrow(/:5 —/)
  })

  it('still fails when there is no table at all', () => {
    expect(() => parseSequencingTable('Just prose.\n\nMore prose.')).toThrow(
      /no table/,
    )
  })

  it('still fails when the first table row is not the header', () => {
    // A stray table row above the header means the table is malformed, and
    // skipping it as if it were prose would lose a row of scope. It is taken
    // as the header — "Release 1.1" satisfies the header test — and then
    // rejected because its cells are not phase names. The message differs
    // from a missing header, but it still fails loudly (R-11.2).
    const stray = `| **Release 1.1** | • Do a thing (staff, 938) |\n${table}`
    expect(() => parseSequencingTable(stray)).toThrow(ParseError)
    expect(() => parseSequencingTable(stray)).toThrow(/Unrecognised phase label/)
  })
})
