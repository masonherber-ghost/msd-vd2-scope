import { toCanonicalPhase } from './phase-canon.js'
import {
  ACTORS,
  ParseError,
  type Actor,
  type MappingParseResult,
  type ParsedAssumption,
  type ParsedCapabilityRef,
  type ParsedMvpRef,
  type ParsedPwcFeature,
  type ParsedRelease,
  type ScopeOption,
} from './scope-types.js'

const SOURCE = 'pwc-scope-to-mvp-mapping.md'

// ## 📦 Release 1.1 (MVP1.1): Controlled Pilot (Core Onboarding & Spot Vacancy)
// Non-greedy up to "): " so a name may itself contain parentheses.
const RELEASE_RE = /^##\s+\S*\s*Release\s+(\S+)\s+\((.+?)\):\s*(.+?)\s*$/u

// ### 📂 Phase: Access & onboarding
const PHASE_RE = /^###\s+\S*\s*Phase:\s*(.+?)\s*$/u

// #### 🔹 PWC Feature: Registration and login page content (F-014)
// Greedy name, then the trailing (F-nnn) anchored to end of line.
const FEATURE_RE = /^####\s+\S*\s*PWC Feature:\s*(.+)\s+\((F-\d+)\)\s*$/u

const DESCRIPTION_RE = /^\*\*Description:\*\*\s*(.+?)\s*$/u

// Top-level field bullets. The capabilities label carries a parenthesised
// filename, so match on the prefix only.
const FIELD_RE = /^\*\s+\*\*([^*]+?):\*\*\s*(.*?)\s*$/u

// A nested list item: "  * ..." — indentation varies, so do not pin it.
const NESTED_RE = /^\s+\*\s+(.+?)\s*$/u

// `938 - Staff can Create and Manage Additional Employer Portal Users (Option 1A)`
const MVP_RE = /^`(\d+)\s*-\s*(.+?)`$/u
const OPTION_SUFFIX_RE = /^(.*?)\s*\(Option\s+(1A|1B)\)\s*$/iu

/**
 * A capability reference: text, then a trailing "(actor, ref)".
 *
 * Anchored on the trailing group rather than split on a delimiter: em-dashes,
 * "&", "/", "," and curly apostrophes all appear inside capability names and
 * none of them are safe delimiters (PRD §11).
 */
const CAPABILITY_RE = new RegExp(
  `^(.+?)\\s*\\((${ACTORS.join('|')}),\\s*(\\d+)\\)\\s*$`,
  'u',
)

/**
 * A "no capabilities, and here is why" note. Two shapes appear in the source
 * and both mean the same thing:
 *   line 90:  "  * *(No direct individual capabilities mapped ...)*"
 *   line 668: "  *(Mapped under Release 2+ in table)*"
 * The second is missing the bullet's space, so it is not a list item at all.
 */
const NOTE_RE = /^\s*\*?\s*\*\((.+?)\)\*\s*$/u

type Field =
  | 'foundational'
  | 'assumptions'
  | 'mvp'
  | 'capabilities'
  | null

function fieldFromLabel(label: string): Field {
  const l = label.toLowerCase()
  if (l.startsWith('included in foundational build')) return 'foundational'
  if (l.startsWith('assumptions')) return 'assumptions'
  if (l.startsWith('mvp feature mapping')) return 'mvp'
  if (l.startsWith('sequenced release capabilities')) return 'capabilities'
  return null
}

function parseMvpLine(text: string, line: number): ParsedMvpRef {
  const m = MVP_RE.exec(text)
  if (!m) {
    throw new ParseError(SOURCE, line, `Unparseable MVP feature reference: "${text}"`)
  }
  const rawTitle = m[2].trim()
  const withOption = OPTION_SUFFIX_RE.exec(rawTitle)

  // Strip the suffix into scope_option. Leaving it in the title produces
  // phantom MVP features with near-identical names (PRD §11).
  const scopeOption: ScopeOption = withOption
    ? (withOption[2].toUpperCase() as '1A' | '1B')
    : null
  const title = withOption ? withOption[1].trim() : rawTitle

  return { ref: Number(m[1]), scopeOption, title }
}

function parseCapabilityLine(text: string, line: number): ParsedCapabilityRef {
  // Strip the leading bullet glyph the source uses inside the list item.
  const body = text.replace(/^•\s*/u, '').trim()
  const m = CAPABILITY_RE.exec(body)
  if (!m) {
    throw new ParseError(
      SOURCE,
      line,
      `Capability line has no trailing "(actor, ref)": "${body}"`,
    )
  }
  return {
    text: m[1].trim(),
    actor: m[2] as Actor,
    ref: Number(m[3]),
  }
}

/**
 * Parses the PwC scope-to-MVP mapping document into releases and features.
 * Pure: no database, no filesystem.
 */
export function parseMappingDocument(markdown: string): MappingParseResult {
  const lines = markdown.split(/\r?\n/)

  const releases: ParsedRelease[] = []
  const features: ParsedPwcFeature[] = []

  let currentRelease: ParsedRelease | null = null
  let currentPhaseLabel: string | null = null
  let currentPhaseId: string | null = null
  let current: ParsedPwcFeature | null = null
  let field: Field = null
  let order = 0

  const finish = () => {
    if (current) features.push(current)
    current = null
    field = null
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const lineNo = i + 1
    const line = raw.trimEnd()
    if (line.trim() === '' || line.trim() === '---') continue
    // Document title — structural, carries no data.
    if (/^#\s+\S/u.test(line)) continue

    const releaseMatch = RELEASE_RE.exec(line)
    if (releaseMatch) {
      finish()
      currentRelease = {
        id: releaseMatch[1].trim(),
        label: `Release ${releaseMatch[1].trim()}`,
        name: releaseMatch[3].trim(),
        description: '',
      }
      releases.push(currentRelease)
      currentPhaseLabel = null
      currentPhaseId = null
      continue
    }

    const descriptionMatch = DESCRIPTION_RE.exec(line)
    if (descriptionMatch) {
      if (!currentRelease) {
        throw new ParseError(SOURCE, lineNo, 'Description before any release heading')
      }
      currentRelease.description = descriptionMatch[1].trim()
      continue
    }

    const phaseMatch = PHASE_RE.exec(line)
    if (phaseMatch) {
      finish()
      currentPhaseLabel = phaseMatch[1].trim()
      currentPhaseId = toCanonicalPhase(currentPhaseLabel, SOURCE, lineNo).id
      continue
    }

    const featureMatch = FEATURE_RE.exec(line)
    if (featureMatch) {
      finish()
      if (!currentRelease) {
        throw new ParseError(SOURCE, lineNo, 'Feature before any release heading')
      }
      if (!currentPhaseLabel || !currentPhaseId) {
        throw new ParseError(SOURCE, lineNo, 'Feature before any phase heading')
      }
      order += 1
      current = {
        id: featureMatch[2],
        name: featureMatch[1].trim(),
        foundationalBuild: '',
        releaseId: currentRelease.id,
        phaseId: currentPhaseId,
        sourcePhaseLabel: currentPhaseLabel,
        displayOrder: order,
        assumptions: [],
        mvpFeatures: [],
        capabilities: [],
        capabilityNote: null,
      }
      continue
    }

    const fieldMatch = FIELD_RE.exec(line)
    if (fieldMatch) {
      if (!current) {
        throw new ParseError(
          SOURCE,
          lineNo,
          `Field "${fieldMatch[1]}" outside any feature`,
        )
      }
      const next = fieldFromLabel(fieldMatch[1])
      if (!next) {
        throw new ParseError(SOURCE, lineNo, `Unrecognised field label "${fieldMatch[1]}"`)
      }
      field = next
      if (field === 'foundational') {
        current.foundationalBuild = fieldMatch[2].trim()
      }
      continue
    }

    // Nested content belongs to whichever field is open.
    const nested = NESTED_RE.exec(line)
    const note = NOTE_RE.exec(line)

    if (nested) {
      if (!current || !field) {
        throw new ParseError(SOURCE, lineNo, `List item outside any field: "${line.trim()}"`)
      }
      const body = nested[1].trim()

      // A note can also appear *as* a list item (line 90).
      const nestedNote = NOTE_RE.exec(body)
      if (nestedNote && field === 'capabilities') {
        current.capabilityNote = nestedNote[1].trim()
        continue
      }

      switch (field) {
        case 'assumptions': {
          const assumption: ParsedAssumption = {
            position: current.assumptions.length + 1,
            text: body,
          }
          current.assumptions.push(assumption)
          break
        }
        case 'mvp':
          if (nestedNote) {
            // "no MVP mapping, with a reason" — not a reference.
            break
          }
          current.mvpFeatures.push(parseMvpLine(body, lineNo))
          break
        case 'capabilities':
          current.capabilities.push(parseCapabilityLine(body, lineNo))
          break
        case 'foundational':
          // Continuation prose under the foundational-build field.
          current.foundationalBuild = `${current.foundationalBuild} ${body}`.trim()
          break
      }
      continue
    }

    if (note) {
      if (!current) {
        throw new ParseError(SOURCE, lineNo, `Note outside any feature: "${line.trim()}"`)
      }
      if (field === 'capabilities') {
        current.capabilityNote = note[1].trim()
        continue
      }
      if (field === 'mvp') continue
    }

    // Anything else is unrecognised. Fail loudly rather than skip (R-11.2).
    throw new ParseError(SOURCE, lineNo, `Unrecognised line: "${line.trim()}"`)
  }

  finish()

  return { releases, features }
}
