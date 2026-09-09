import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseMappingDocument } from './mapping-parser.js'
import { ParseError } from './scope-types.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixture = fs.readFileSync(
  path.join(here, '__fixtures__', 'mapping-hazards.md'),
  'utf8',
)

const parsed = parseMappingDocument(fixture)
const byId = new Map(parsed.features.map((f) => [f.id, f]))

describe('mapping parser — structure', () => {
  it('reads releases, keeping a parenthesised name intact', () => {
    expect(parsed.releases.map((r) => r.id)).toEqual(['1.1', '1.9'])
    expect(parsed.releases[0].name).toBe('Controlled Pilot (Core Onboarding & Spot Vacancy)')
    expect(parsed.releases[0].description).toContain('parenthesised name')
  })

  it('reads a release id that carries a slashed label', () => {
    // "## Release 1.9 (MVP1.9 / GA & Scale-Up): General Availability & Scale-Up"
    expect(parsed.releases[1].id).toBe('1.9')
    expect(parsed.releases[1].name).toBe('General Availability & Scale-Up')
  })

  it('reads every feature with its id and name', () => {
    expect([...byId.keys()]).toEqual(['F-001', 'F-014', 'F-008', 'F-080', 'F-090', 'F-100'])
    expect(byId.get('F-014')?.name).toBe('Registration and login page content')
  })

  it('keeps assumptions in source order', () => {
    const assumptions = byId.get('F-001')!.assumptions
    expect(assumptions.map((a) => a.position)).toEqual([1, 2])
    expect(assumptions[0].text).toContain('contains a comma')
    expect(assumptions[1].text).toContain('em-dash')
  })
})

describe('mapping parser — hazard: (Option 1A) / (Option 1B) suffixes', () => {
  it('strips the suffix into scope_option rather than the title', () => {
    const mvp = byId.get('F-014')!.mvpFeatures
    expect(mvp).toEqual([
      {
        ref: 951,
        scopeOption: '1A',
        title: 'Register for the Employer Portal - New organisation',
      },
      {
        ref: 951,
        scopeOption: '1B',
        title: 'Register for the Employer Portal - New organisation',
      },
    ])
    // Leaving the suffix in would create phantom near-identical features.
    expect(mvp.every((m) => !m.title.includes('Option'))).toBe(true)
  })

  it('keeps a bare record distinct from its Option 1A sibling', () => {
    const mvp = byId.get('F-001')!.mvpFeatures
    expect(mvp.map((m) => m.scopeOption)).toEqual(['1A', null])
    expect(new Set(mvp.map((m) => m.ref))).toEqual(new Set([938]))
  })

  it('leaves a title with no suffix untouched', () => {
    expect(byId.get('F-008')!.mvpFeatures).toEqual([
      { ref: 937, scopeOption: null, title: 'Employer Account and User Access Recovery' },
    ])
  })
})

describe('mapping parser — hazard: inconsistent "no capabilities" bullets', () => {
  it('reads the bulleted note form (source line 90)', () => {
    const feature = byId.get('F-008')!
    expect(feature.capabilities).toEqual([])
    expect(feature.capabilityNote).toBe(
      'No direct individual capabilities mapped in Release 1.1–1.3 table',
    )
  })

  it('reads the unbulleted note form (source line 668)', () => {
    const feature = byId.get('F-100')!
    expect(feature.capabilities).toEqual([])
    expect(feature.capabilityNote).toBe('Mapped under Release 2+ in table')
  })

  it('treats a note as "no capabilities", never as a capability', () => {
    for (const id of ['F-008', 'F-100']) {
      expect(byId.get(id)!.capabilities).toHaveLength(0)
    }
  })
})

describe('mapping parser — hazard: anchored (actor, ref) parsing', () => {
  it('parses a name containing "&" without splitting on it', () => {
    expect(byId.get('F-001')!.capabilities[0]).toEqual({
      text: 'Manual contacts & relationships creation',
      actor: 'staff',
      ref: 938,
    })
  })

  it('parses a name containing "/" without splitting on it', () => {
    expect(byId.get('F-090')!.capabilities[0]).toEqual({
      text: 'View authenticated landing page / dashboard',
      actor: 'employer',
      ref: 941,
    })
  })

  it.each([
    ['an em-dash', 'Review vacancies — including staff corrections'],
    ['a comma', 'Review, publish and withdraw vacancies'],
    ['a curly apostrophe', "Update the employer\u2019s organisation record"],
    ['a slash and an ampersand', 'Hold / suspend & decline vacancy'],
    ['a colon', 'Vacancy review: staff decision reasons'],
    ['nested parentheses', 'Register for the portal (new organisation)'],
    ['a trailing digit', 'Upload CV version 2'],
  ])('parses a capability name containing %s', (_label, name) => {
    const md = `## 📦 Release 1.1 (MVP1.1): Fixture
**Description:** d.

### 📂 Phase: Manage Vacancies

#### 🔹 PWC Feature: Something (F-999)
* **Included in foundational build:** x.
* **Assumptions:**
  * a.
* **MVP Feature Mapping:**
  * \`900 - Title\`
* **Sequenced Release Capabilities (\`x\`):**
  * • ${name} (staff, 947)`

    const [feature] = parseMappingDocument(md).features
    expect(feature.capabilities).toEqual([{ text: name, actor: 'staff', ref: 947 }])
  })

  it('anchors on the LAST (actor, ref), not the first parenthesis', () => {
    const md = `## 📦 Release 1.1 (MVP1.1): Fixture
**Description:** d.

### 📂 Phase: Manage Vacancies

#### 🔹 PWC Feature: Something (F-999)
* **Included in foundational build:** x.
* **Assumptions:**
  * a.
* **MVP Feature Mapping:**
  * \`900 - Title\`
* **Sequenced Release Capabilities (\`x\`):**
  * • Notify (by email) the employer (employer, 951)`

    const [feature] = parseMappingDocument(md).features
    expect(feature.capabilities).toEqual([
      { text: 'Notify (by email) the employer', actor: 'employer', ref: 951 },
    ])
  })

  it('parses each supported actor', () => {
    const actors = parsed.features.flatMap((f) => f.capabilities.map((c) => c.actor))
    expect(new Set(actors).size).toBeGreaterThan(1)
    expect(actors.every((a) => ['employer', 'staff', 'jobseeker', 'system'].includes(a))).toBe(
      true,
    )
  })
})

describe('mapping parser — hazard: case-variant and near-duplicate capabilities', () => {
  it('keeps both casings as separate links, leaving dedup to the reconciler', () => {
    const caps = byId.get('F-080')!.capabilities
    expect(caps.map((c) => c.text)).toEqual([
      'Filter and Sort Applications',
      'Filter and sort applications',
    ])
  })

  it('keeps near-duplicate capability text distinct', () => {
    const caps = byId.get('F-090')!.capabilities
    expect(caps.map((c) => c.text)).toEqual([
      'View authenticated landing page / dashboard',
      'View authenticated landing page',
    ])
  })
})

describe('mapping parser — hazard: phase casing and the invite merge', () => {
  it('folds "Onboarding via invite" into Access & Onboarding', () => {
    const feature = byId.get('F-001')!
    expect(feature.phaseId).toBe('access-and-onboarding')
    // Recorded so the merge is auditable and reversible.
    expect(feature.sourcePhaseLabel).toBe('Onboarding via invite')
  })

  it('matches a phase whose casing differs from canonical', () => {
    const feature = byId.get('F-014')!
    expect(feature.phaseId).toBe('access-and-onboarding')
    expect(feature.sourcePhaseLabel).toBe('Access & onboarding')
  })
})

describe('mapping parser — fails loudly (R-11.2)', () => {
  const wrap = (body: string) => `## 📦 Release 1.1 (MVP1.1): Fixture
**Description:** d.

### 📂 Phase: Manage Vacancies

#### 🔹 PWC Feature: Something (F-999)
${body}`

  it('names the line number for a capability with no (actor, ref)', () => {
    const md = wrap(`* **Included in foundational build:** x.
* **Assumptions:**
  * a.
* **MVP Feature Mapping:**
  * \`900 - Title\`
* **Sequenced Release Capabilities (\`x\`):**
  * • A capability with no trailing reference`)

    expect(() => parseMappingDocument(md)).toThrow(ParseError)
    // The malformed line is the 13th of the wrapped document.
    expect(() => parseMappingDocument(md)).toThrow(/:13 —/)
    expect(() => parseMappingDocument(md)).toThrow(/no trailing "\(actor, ref\)"/)
  })

  it('rejects an unknown actor rather than accepting it', () => {
    const md = wrap(`* **Included in foundational build:** x.
* **Assumptions:**
  * a.
* **MVP Feature Mapping:**
  * \`900 - Title\`
* **Sequenced Release Capabilities (\`x\`):**
  * • Something (manager, 900)`)

    expect(() => parseMappingDocument(md)).toThrow(/no trailing "\(actor, ref\)"/)
  })

  it('names the line number for an unparseable MVP reference', () => {
    const md = wrap(`* **Included in foundational build:** x.
* **Assumptions:**
  * a.
* **MVP Feature Mapping:**
  * not a backticked reference
* **Sequenced Release Capabilities (\`x\`):**
  * *(none)*`)

    expect(() => parseMappingDocument(md)).toThrow(/:11 —/)
    expect(() => parseMappingDocument(md)).toThrow(/Unparseable MVP feature reference/)
  })

  it('rejects an unrecognised phase heading', () => {
    const md = `## 📦 Release 1.1 (MVP1.1): Fixture
**Description:** d.

### 📂 Phase: Invented Phase Name
`
    expect(() => parseMappingDocument(md)).toThrow(/Unrecognised phase label "Invented Phase Name"/)
  })

  it('rejects an unrecognised field label', () => {
    const md = wrap(`* **Wildly Unexpected Field:** x.`)
    expect(() => parseMappingDocument(md)).toThrow(/Unrecognised field label/)
  })

  it('rejects a stray unrecognised line instead of skipping it', () => {
    const md = wrap(`* **Included in foundational build:** x.
this line belongs to nothing`)
    expect(() => parseMappingDocument(md)).toThrow(/Unrecognised line/)
  })

  it('rejects a feature declared before any phase', () => {
    const md = `## 📦 Release 1.1 (MVP1.1): Fixture
**Description:** d.

#### 🔹 PWC Feature: Orphan (F-001)
`
    expect(() => parseMappingDocument(md)).toThrow(/Feature before any phase heading/)
  })
})
