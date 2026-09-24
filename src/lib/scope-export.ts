import type { PhaseRow, ReleaseRow } from '@/lib/api-client'
import type { CapabilityCardModel } from '@/lib/capability-derive'
import type { MvpCardModel } from '@/lib/mvp-derive'
import {
  ACTOR_ROWS,
  NO_ACTOR_ROW,
  type Actor,
  type FeatureCardModel,
  type ViewMode,
} from '@/lib/scope-derive'
import {
  FILTER_GROUPS,
  GROUP_LABEL,
  activeGroups,
  isEmpty,
  type FilterState,
} from '@/lib/scope-filters'

/**
 * The map as a document.
 *
 * The map answers "where does this land" by position; a text list has no
 * position, so the release and the phase become headings and the cards
 * become bullets under them. The shape is the one the source scope document
 * already uses — release, then journey phase, then a bullet per record —
 * so an export drops straight into the same conversation.
 *
 * Pure and synchronous: it takes the cards the view is *already showing*,
 * so what comes out is what was on screen, filters and all. Nothing here
 * refetches or re-filters.
 */

export type ScopeExport = {
  filename: string
  markdown: string
}

export type ScopeExportInput = {
  view: ViewMode
  releases: ReleaseRow[]
  phases: PhaseRow[]
  filters: FilterState
  /** The visible PwC feature cards — used by the release and actor views. */
  features: FeatureCardModel[]
  /** The visible MSD feature cards. */
  mvpCards: MvpCardModel[]
  /** The visible capability cards. */
  capabilityCards: CapabilityCardModel[]
  /** Fixed by the caller so the output is reproducible in a test. */
  generatedAt?: Date
}

/** How the document names the view it was taken from. */
export const SCOPE_VIEW_LABEL: Record<ViewMode, string> = {
  release: 'View by PwC release',
  actor: 'View by actor',
  mvp: 'View by MSD feature',
  capability: 'View by capability',
}

/** The view's part of an export filename, shared with the PDF export. */
export const SCOPE_VIEW_SLUG: Record<ViewMode, string> = {
  release: 'by-pwc-release',
  actor: 'by-actor',
  mvp: 'by-msd-feature',
  capability: 'by-capability',
}

/** What a bullet counts as, for the header line and the empty message. */
const VIEW_SUBJECT: Record<ViewMode, { one: string; many: string }> = {
  release: { one: 'PwC feature', many: 'PwC features' },
  actor: { one: 'PwC feature', many: 'PwC features' },
  mvp: { one: 'MSD feature', many: 'MSD features' },
  capability: { one: 'capability', many: 'capabilities' },
}

const ACTOR_LABEL: Record<Actor, string> = {
  employer: 'Employer',
  staff: 'MSD staff',
  jobseeker: 'Jobseeker',
  system: 'System',
}

/** `SVD-941`, or `SVD-938 (Option 1A)` for an option variant. */
const mvpRefLabel = (card: Pick<MvpCardModel, 'ref' | 'scopeOption'>) =>
  card.scopeOption ? `SVD-${card.ref} (Option ${card.scopeOption})` : `SVD-${card.ref}`

const count = (n: number, subject: { one: string; many: string }) =>
  `${n} ${n === 1 ? subject.one : subject.many}`

/**
 * A bullet is one line, so anything going into one is flattened first.
 * Capability text and questions are edited in a textarea, so a line break is
 * something a person can type — left in, it ends the list item early and the
 * rest of the sentence, and the markup after it, fall out of the list.
 */
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()

/**
 * A section of the document: a release, or an actor in actor view. Phases
 * are the sub-headings inside it, in the canonical journey order.
 */
type Rendered = {
  /** The Markdown to emit, headings and blank lines included. */
  lines: string[]
  /**
   * One stable id per record rendered. Counting rendered lines would be
   * wrong twice over: the capability view emits headings and blanks that are
   * not records, and two records can render to identical text once the ref
   * moves up into a heading.
   */
  keys: string[]
}

type Section = {
  heading: string
  /** The release this section is, where it is one — actor view has none. */
  releaseId: string | null
  groups: ({ phaseId: string } & Rendered)[]
}

// ---------------------------------------------------------------------------
// Bullets
// ---------------------------------------------------------------------------

/**
 * A PwC feature bullet names the MSD refs it cites, because that is the
 * link the card shows and the thing the source document is indexed by.
 */
function featureLine(feature: FeatureCardModel): string {
  const refs = feature.mvpFeatures.map((m) =>
    m.scopeOption ? `SVD-${m.ref} (Option ${m.scopeOption})` : `SVD-${m.ref}`,
  )
  const cited = refs.length > 0 ? ` *(${refs.join(', ')})*` : ''
  // Carried for the same reason the capability's is: a list that dropped an
  // open question would read as settled.
  const question = feature.question ? ` — **Question:** ${oneLine(feature.question)}` : ''
  return `* **${feature.id}**: ${oneLine(feature.name)}${cited}${question}`
}

const mvpLine = (card: MvpCardModel) => {
  // Carried for the same reason the feature's and capability's are: a list
  // that dropped an open question would read as settled.
  const question = card.question ? ` — **Question:** ${oneLine(card.question)}` : ''
  return `* **${mvpRefLabel(card)}**: ${oneLine(card.title)}${question}`
}

/**
 * A capability bullet carries its actor and, where someone raised one, the
 * open question — a list that dropped the question would read as settled.
 *
 * The ref is not on the bullet: capabilities are grouped under it, so
 * repeating it on every line of the group is noise. `capabilityGroup` below
 * puts it on the heading instead.
 */
function capabilityLine(card: CapabilityCardModel): string {
  const question = card.question ? ` — **Question:** ${oneLine(card.question)}` : ''
  return `* ${oneLine(card.text)} *(${ACTOR_LABEL[card.actor]})*${question}`
}

/** `**SVD-941**:`, carrying the scope option where the owner has one. */
function capabilityHeading(card: CapabilityCardModel): string {
  const option = card.mvpFeature?.scopeOption
  return option ? `**SVD-${card.ref} (Option ${option})**:` : `**SVD-${card.ref}**:`
}

/**
 * Capabilities under a phase, grouped by the MSD record that owns them.
 *
 * Grouping is by record rather than by ref, so the two option variants of a
 * ref get a heading each — the same distinction the MSD-feature view draws.
 * A capability whose ref resolved to no record groups under the bare ref.
 *
 * Blank lines surround each heading. Without one *before* it, a parser
 * treats the heading as a lazy continuation of the last bullet above and
 * swallows it; without one after, the stricter parsers (Python-Markdown and
 * the importers built on it) render the bullets as paragraph text rather
 * than as a list. Both render identically to the compact form where they
 * are not needed.
 */
function capabilityGroup(cards: CapabilityCardModel[]): Rendered {
  const byOwner = new Map<string, CapabilityCardModel[]>()
  for (const card of cards) {
    // Falls back to the ref, so a capability owned by nothing still groups.
    const owner = card.mvpFeature ? `record:${card.mvpFeature.id}` : `ref:${card.ref}`
    const list = byOwner.get(owner) ?? []
    list.push(card)
    byOwner.set(owner, list)
  }

  const groups = [...byOwner.values()].sort(
    (a, b) =>
      a[0].ref - b[0].ref ||
      (a[0].mvpFeature?.scopeOption ?? '').localeCompare(
        b[0].mvpFeature?.scopeOption ?? '',
      ),
  )

  const lines: string[] = []
  const keys: string[] = []

  groups.forEach((group, index) => {
    if (index > 0) lines.push('')
    lines.push(capabilityHeading(group[0]), '')
    for (const card of group.sort(byCapability)) {
      lines.push(capabilityLine(card))
      keys.push(String(card.id))
    }
  })

  return { lines, keys }
}

// ---------------------------------------------------------------------------
// Sections, per view
// ---------------------------------------------------------------------------

function releaseHeading(release: ReleaseRow, position: number): string {
  return release.name
    ? `${position}. ${release.label} — ${release.name}`
    : `${position}. ${release.label}`
}

function featureSections(input: ScopeExportInput): Section[] {
  const { view, releases, phases, features } = input
  const render = (list: FeatureCardModel[]): Rendered => {
    const sorted = list.sort(byFeatureId)
    return { lines: sorted.map(featureLine), keys: sorted.map((f) => f.id) }
  }

  // Actor view puts a feature in a row per distinct actor across its
  // capabilities, exactly as the grid does, so one feature can be listed
  // more than once.
  if (view === 'actor') {
    return ACTOR_ROWS.map((row) => ({
      heading: row.label,
      releaseId: null,
      groups: groupByPhase(
        phases,
        features.filter((feature) =>
          row.key === NO_ACTOR_ROW
            ? feature.actors.size === 0
            : feature.actors.has(row.key as Actor),
        ),
        (feature) => feature.phaseId,
        render,
      ),
    }))
  }

  return releases.map((release, index) => ({
    heading: releaseHeading(release, index + 1),
    releaseId: release.id,
    groups: groupByPhase(
      phases,
      features.filter((feature) => feature.releaseId === release.id),
      (feature) => feature.phaseId,
      render,
    ),
  }))
}

/**
 * An MSD feature has no placement of its own — it appears in every cell its
 * capabilities (or its citing features) put it in, so a record straddling
 * two releases is listed under both. That repetition is the straddle, which
 * is the thing worth seeing.
 */
function mvpSections(input: ScopeExportInput): Section[] {
  const { releases, mvpCards } = input

  return releases.map((release, index) => {
    const byPhase = new Map<string, MvpCardModel[]>()
    for (const card of mvpCards) {
      for (const cell of card.cells) {
        if (cell.releaseId !== release.id) continue
        const list = byPhase.get(cell.phaseId) ?? []
        if (!list.includes(card)) list.push(card)
        byPhase.set(cell.phaseId, list)
      }
    }

    return {
      heading: releaseHeading(release, index + 1),
      releaseId: release.id,
      groups: orderPhases(input.phases, byPhase, (list) => {
        const sorted = list.sort(byMvpRef)
        return { lines: sorted.map(mvpLine), keys: sorted.map((card) => String(card.id)) }
      }),
    }
  })
}

function capabilitySections(input: ScopeExportInput): Section[] {
  const { releases, phases, capabilityCards } = input

  return releases.map((release, index) => ({
    heading: releaseHeading(release, index + 1),
    releaseId: release.id,
    // A capability needs both a release and a phase to reach a cell; one
    // without either is unplaced, exactly as `projectCapabilityCells` has
    // it, so the document and the map agree on what is on the map.
    groups: groupByPhase(
      phases,
      capabilityCards.filter(
        (card) => card.releaseId === release.id && card.phaseId !== null,
      ),
      (card) => card.phaseId as string,
      capabilityGroup,
    ),
  }))
}

const byFeatureId = (a: FeatureCardModel, b: FeatureCardModel) => a.id.localeCompare(b.id)

const byMvpRef = (a: MvpCardModel, b: MvpCardModel) =>
  a.ref - b.ref || (a.scopeOption ?? '').localeCompare(b.scopeOption ?? '')

const byCapability = (a: CapabilityCardModel, b: CapabilityCardModel) =>
  a.ref - b.ref || a.text.localeCompare(b.text)

/**
 * Buckets items into phases and emits them in the canonical journey order,
 * skipping the empty ones. Phase order is the spine of the document, so it
 * comes from the phase table rather than from whatever order the cards
 * happened to arrive in.
 */
function groupByPhase<T>(
  phases: PhaseRow[],
  items: T[],
  phaseOf: (item: T) => string,
  render: (items: T[]) => Rendered,
): Section['groups'] {
  const byPhase = new Map<string, T[]>()
  for (const item of items) {
    const list = byPhase.get(phaseOf(item)) ?? []
    list.push(item)
    byPhase.set(phaseOf(item), list)
  }
  return orderPhases(phases, byPhase, render)
}

function orderPhases<T>(
  phases: PhaseRow[],
  byPhase: Map<string, T[]>,
  render: (items: T[]) => Rendered,
): Section['groups'] {
  return phases
    .filter((phase) => (byPhase.get(phase.id) ?? []).length > 0)
    .map((phase) => ({ phaseId: phase.id, ...render(byPhase.get(phase.id) as T[]) }))
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

/**
 * The phase heading carries its epic, matching the source document — the
 * epic ref is how the phases are named in Jira, so a list without it costs
 * the reader a lookup.
 */
function phaseHeading(phase: PhaseRow): string {
  const epic = phase.epic_ref
    ? ` *(TPT${phase.epic_ref}${phase.epic_description ? ` – ${phase.epic_description}` : ''})*`
    : ''
  return `#### **${phase.name}${epic}**`
}

/** "Release: 1.1, 1.4 · Actor: Employer" — the narrowing, in words. */
export function describeFilters(
  filters: FilterState,
  releases: ReleaseRow[],
  phases: PhaseRow[],
): string {
  if (isEmpty(filters)) return ''

  const releaseLabel = new Map(releases.map((r) => [r.id, r.label]))
  const phaseName = new Map(phases.map((p) => [p.id, p.name]))

  // The rail calls this group "MVP feature"; the document calls the same
  // records MSD features throughout, and one document should not use two
  // names for one thing.
  const groupLabel = (group: (typeof FILTER_GROUPS)[number]) =>
    group === 'mvp' ? 'MSD feature' : GROUP_LABEL[group]

  const value = (group: (typeof FILTER_GROUPS)[number], raw: string | number): string => {
    if (group === 'release') return releaseLabel.get(String(raw)) ?? String(raw)
    if (group === 'phase') return phaseName.get(String(raw)) ?? String(raw)
    if (group === 'actor') return ACTOR_LABEL[raw as Actor] ?? String(raw)
    if (group === 'mvp') return `SVD-${raw}`
    return String(raw)
  }

  return activeGroups(filters)
    .map(
      (group) =>
        `${groupLabel(group)}: ${(filters[group] as (string | number)[])
          .map((raw) => value(group, raw))
          .join(', ')}`,
    )
    .join(' · ')
}

function sectionsFor(input: ScopeExportInput): Section[] {
  if (input.view === 'mvp') return mvpSections(input)
  if (input.view === 'capability') return capabilitySections(input)
  return featureSections(input)
}

/** The records this view holds that no source places on the map at all. */
function unplacedLines(input: ScopeExportInput): Rendered {
  if (input.view === 'mvp') {
    const cards = input.mvpCards.filter((card) => card.cells.length === 0).sort(byMvpRef)
    return { lines: cards.map(mvpLine), keys: cards.map((card) => String(card.id)) }
  }
  if (input.view === 'capability') {
    // Grouped under their refs like the placed ones, so the closing section
    // reads the same way as the rest of the document.
    return capabilityGroup(
      input.capabilityCards.filter(
        (card) => card.releaseId === null || card.phaseId === null,
      ),
    )
  }
  return { lines: [], keys: [] }
}

/**
 * Builds the document for whatever the map is currently showing.
 *
 * Empty phases are left out — the source document does the same, and a list
 * of headings with nothing under them reads as a fault rather than as
 * information. What *is* kept is the record nothing places anywhere: those
 * get their own closing section rather than being silently dropped, matching
 * the "Not on the map" panel the view already shows.
 */
export function buildScopeExport(input: ScopeExportInput): ScopeExport {
  const { view, phases, filters, releases, generatedAt } = input
  const phaseById = new Map(phases.map((phase) => [phase.id, phase]))
  const subject = VIEW_SUBJECT[view]

  const sections = sectionsFor(input)
  const strays = unplacedLines(input)

  // A record can sit in more than one section — a feature serving two
  // actors, an MSD feature whose capabilities straddle two releases. The
  // header counts the records, not the bullets, and says so when the two
  // differ; a bare bullet count would overstate the scope.
  const allKeys = [
    ...sections.flatMap((section) => section.groups.flatMap((group) => group.keys)),
    ...strays.keys,
  ]
  const distinct = new Set(allKeys).size

  const lines: string[] = ['# Scope for VD2', '']

  const spanned = releasesCovered(input, sections)
  if (spanned.length > 0) lines.push(spanLine(spanned, releases), '')

  lines.push(SCOPE_VIEW_LABEL[view], '')

  const filterSummary = describeFilters(filters, releases, phases)
  if (filterSummary) lines.push(`Filtered by — ${filterSummary}`, '')

  lines.push(
    [
      count(distinct, subject),
      allKeys.length > distinct
        ? `${allKeys.length} entries (some appear in more than one section)`
        : null,
      generatedAt ? `exported ${formatDate(generatedAt)}` : null,
    ]
      .filter(Boolean)
      .join(' · '),
    '',
  )

  if (allKeys.length === 0) {
    // An empty map with no filters set is not a filtering problem, and
    // telling someone to clear a filter they never set sends them looking
    // for a control that is already doing nothing.
    lines.push(
      isEmpty(filters)
        ? `There are no ${subject.many} to export — the map itself is empty.`
        : `No ${subject.many} match the current filters. Clearing a filter will bring some back.`,
      '',
    )
    return { filename: filenameFor(view, filters), markdown: lines.join('\n') }
  }

  for (const section of sections) {
    if (section.groups.length === 0) continue
    lines.push(`## **${section.heading}**`, '')

    for (const group of section.groups) {
      const phase = phaseById.get(group.phaseId)
      lines.push(phase ? phaseHeading(phase) : `#### **${group.phaseId}**`, '')
      lines.push(...group.lines, '')
    }
  }

  if (strays.lines.length > 0) {
    lines.push('## **Not on the map**', '')
    lines.push(
      view === 'mvp'
        ? 'Neither source places these, so they have no release or stage. Listed rather than dropped.'
        : 'The sequencing table never matched these, so they have no release or stage. Listed rather than dropped.',
      '',
    )
    lines.push(...strays.lines, '')
  }

  return { filename: filenameFor(view, filters), markdown: lines.join('\n') }
}

/**
 * Which releases the document actually covers.
 *
 * Actor view heads its sections with actors, so it has no release sections
 * to read this from — it comes off the features being listed instead.
 * Either way the answer is what is in the document, never what is in the
 * release table, or a filtered export would claim a reach it has lost.
 */
function releasesCovered(input: ScopeExportInput, sections: Section[]): ReleaseRow[] {
  if (input.view === 'actor') {
    const here = new Set(input.features.map((feature) => feature.releaseId))
    return input.releases.filter((release) => here.has(release.id))
  }
  return input.releases.filter((release) =>
    sections.some(
      (section) => section.releaseId === release.id && section.groups.length > 0,
    ),
  )
}

/**
 * A range only where the releases are contiguous. `1.1 – 2` across a table
 * that also holds 1.2, 1.3 and 1.4 reads as covering all five, so a gapped
 * set is listed instead of spanned.
 */
function spanLine(spanned: ReleaseRow[], releases: ReleaseRow[]): string {
  if (spanned.length === 1) return `Including release ${spanned[0].id}`

  const first = releases.indexOf(spanned[0])
  const last = releases.indexOf(spanned[spanned.length - 1])
  const contiguous = last - first + 1 === spanned.length

  return contiguous
    ? `Including releases ${spanned[0].id} – ${spanned[spanned.length - 1].id}`
    : `Including releases ${spanned.map((release) => release.id).join(', ')}`
}

/**
 * A filtered export is a different document from a full one, so it says so
 * in the filename — otherwise both land in Downloads as the same name and
 * the browser silently suffixes one.
 */
const filenameFor = (view: ViewMode, filters: FilterState) =>
  `vd2-scope-${SCOPE_VIEW_SLUG[view]}${isEmpty(filters) ? '' : '-filtered'}.md`

/** `2026-09-24` — sortable, and unambiguous wherever it is read. */
function formatDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
