import { toCanonicalPhase } from './phase-canon.js'
import {
  ACTORS,
  ParseError,
  type Actor,
  type ParsedTableCapability,
  type SequencingParseResult,
} from './scope-types.js'

const SOURCE = 'R1-sequenced-release-capabilities-table.md'

/** Release labels are bolded, and "Release 2" has no minor version. */
const RELEASE_CELL_RE = /^\*{0,2}\s*Release\s+([\d.]+)\s*\*{0,2}$/u

const SEPARATOR_RE = /^\|?[\s|:-]+\|?$/u

/** Empty cells are a literal "-", not blank. */
const EMPTY_CELL = '-'

const CAPABILITY_RE = new RegExp(
  `^(.+?)\\s*\\((${ACTORS.join('|')}),\\s*(\\d+)\\)\\s*$`,
  'u',
)

function splitRow(row: string): string[] {
  let r = row.trim()
  if (r.startsWith('|')) r = r.slice(1)
  if (r.endsWith('|')) r = r.slice(0, -1)
  return r.split('|').map((c) => c.trim())
}

/**
 * Parses the release × phase capability table.
 *
 * Each cell is a `<br>`-joined bullet list inside a single markdown table
 * cell, so the cell is split on `<br>` and each part has its leading `•`
 * stripped before the trailing `(actor, ref)` is read.
 */
export function parseSequencingTable(markdown: string): SequencingParseResult {
  const numbered = markdown
    .split(/\r?\n/)
    .map((text, index) => ({ text, line: index + 1 }))
    .filter(({ text }) => text.trim() !== '')

  if (numbered.length === 0) {
    throw new ParseError(SOURCE, 1, 'Document is empty')
  }

  const rows = numbered.filter(({ text }) => !SEPARATOR_RE.test(text.trim()))
  const [headerRow, ...bodyRows] = rows

  const header = splitRow(headerRow.text)
  if (header.length < 2 || !/release/iu.test(header[0])) {
    throw new ParseError(
      SOURCE,
      headerRow.line,
      `Expected a header row beginning with "Release", got "${headerRow.text.trim()}"`,
    )
  }

  const phaseLabels = header.slice(1)
  // Validate every column header up front, so a renamed column fails at the
  // header rather than once per cell.
  const phaseIds = phaseLabels.map(
    (label) => toCanonicalPhase(label, SOURCE, headerRow.line).id,
  )

  const capabilities: ParsedTableCapability[] = []
  const releaseIds: string[] = []
  let cellCount = 0
  let emptyCellCount = 0

  for (const { text, line } of bodyRows) {
    const cells = splitRow(text)
    const releaseMatch = RELEASE_CELL_RE.exec(cells[0])
    if (!releaseMatch) {
      throw new ParseError(
        SOURCE,
        line,
        `Expected a release label in the first cell, got "${cells[0]}"`,
      )
    }
    const releaseId = releaseMatch[1]
    releaseIds.push(releaseId)

    if (cells.length - 1 !== phaseLabels.length) {
      throw new ParseError(
        SOURCE,
        line,
        `Release ${releaseId} has ${cells.length - 1} cells, expected ${phaseLabels.length}`,
      )
    }

    for (let column = 0; column < phaseLabels.length; column++) {
      const cell = cells[column + 1]
      cellCount += 1

      if (cell === EMPTY_CELL) {
        emptyCellCount += 1
        continue
      }
      if (cell === '') {
        throw new ParseError(
          SOURCE,
          line,
          `Release ${releaseId} / ${phaseLabels[column]}: cell is blank; an empty cell must be a literal "-"`,
        )
      }

      for (const part of cell.split('<br>')) {
        const body = part.trim().replace(/^•\s*/u, '').trim()
        if (body === '') continue

        const m = CAPABILITY_RE.exec(body)
        if (!m) {
          throw new ParseError(
            SOURCE,
            line,
            `Release ${releaseId} / ${phaseLabels[column]}: capability has no trailing "(actor, ref)": "${body}"`,
          )
        }

        capabilities.push({
          text: m[1].trim(),
          actor: m[2] as Actor,
          ref: Number(m[3]),
          releaseId,
          phaseId: phaseIds[column],
          sourcePhaseLabel: phaseLabels[column],
        })
      }
    }
  }

  return { releaseIds, phaseLabels, capabilities, cellCount, emptyCellCount }
}
