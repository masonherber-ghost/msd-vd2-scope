import type { z } from 'zod'
import {
  ApiError,
  type CapabilityRow,
  type DeleteFeatureResult,
  type FeatureCapabilityLinkRow,
  type MoveDirection,
} from '@/lib/api-client'
import { deriveLinkConflict, type ConflictInputs } from '@/lib/conflict-rules'
import {
  compareText,
  docId,
  type CollectionKey,
  type RawScope,
  type SequenceName,
  type Sequences,
  type StoredCapability,
  type StoredFeatureCapabilityLink,
  type StoredFeatureMvpLink,
  type StoredMvpFeature,
  type StoredPhase,
  type StoredPwcFeature,
  type StoredRelease,
} from '@/lib/scope-records'
import {
  createCapabilitySchema,
  createFeatureSchema,
  createMvpFeatureSchema,
  createPhaseSchema,
  createReleaseSchema,
  moveSchema,
  resolveConflictSchema,
  setCapabilityLinksSchema,
  setMvpLinksSchema,
  setMvpPlacementSchema,
  summariseZodError,
  updateCapabilitySchema,
  updateFeatureSchema,
  updateMvpFeatureSchema,
  updatePhaseSchema,
  updateReleaseSchema,
} from '@/lib/validators'

/**
 * Every write the app makes, planned as a pure function of the current store.
 *
 * This is the Express routes and SQLite repositories, ported. Each planner
 * validates exactly as its route did — same checks, same order, same status
 * and message — then works through a {@link Draft}: a copy of the store that
 * applies each write as it is made, so later steps read earlier ones the way
 * statements inside one SQL transaction did. The client then commits the
 * recorded writes atomically.
 *
 * Pure, so it is tested without Firestore, and the tests the routes had move
 * here unchanged in substance.
 */

type Row = Record<string, unknown>

export type Write =
  | { op: 'set'; collection: CollectionKey; id: string; data: Row }
  | { op: 'update'; collection: CollectionKey; id: string; data: Row }
  | { op: 'delete'; collection: CollectionKey; id: string }

export type Plan<T> = {
  writes: Write[]
  /** Counters that moved, to be written back with the plan. */
  sequences: Partial<Sequences>
  /** The store with the writes applied — what the cache becomes on success. */
  next: RawScope
  result: T
}

export type PlanContext = {
  raw: RawScope
  /** `utcNow()` — passed in so a plan is deterministic. */
  now: string
  /** The current AUTOINCREMENT counters. */
  sequences: Sequences
}

/** A working copy of the store that records every write made to it. */
export class Draft {
  readonly data: RawScope
  readonly writes: Write[] = []
  readonly sequences: Partial<Sequences> = {}
  readonly now: string
  private readonly counters: Sequences

  constructor(ctx: PlanContext) {
    // Copy the arrays and rows, never the caller's cache: a plan that throws
    // halfway must leave nothing behind.
    this.data = Object.fromEntries(
      Object.entries(ctx.raw).map(([key, rows]) => [
        key,
        (rows as Row[]).map((row) => ({ ...row })),
      ]),
    ) as RawScope
    this.now = ctx.now
    this.counters = { ...ctx.sequences }
  }

  /** The next AUTOINCREMENT id — never a reused one. */
  nextId(name: SequenceName): number {
    this.counters[name] += 1
    this.sequences[name] = this.counters[name]
    return this.counters[name]
  }

  insert<K extends CollectionKey>(collection: K, row: RawScope[K][number]): void {
    const id = idOf(collection, row)
    ;(this.data[collection] as Row[]).push(row as Row)
    this.writes.push({ op: 'set', collection, id, data: { ...(row as Row) } })
  }

  update<K extends CollectionKey>(
    collection: K,
    row: RawScope[K][number],
    patch: Partial<RawScope[K][number]>,
  ): RawScope[K][number] {
    Object.assign(row as Row, patch)
    this.writes.push({
      op: 'update',
      collection,
      id: idOf(collection, row),
      data: { ...(patch as Row) },
    })
    return row
  }

  remove<K extends CollectionKey>(collection: K, row: RawScope[K][number]): void {
    const rows = this.data[collection] as Row[]
    rows.splice(rows.indexOf(row as Row), 1)
    this.writes.push({ op: 'delete', collection, id: idOf(collection, row) })
  }

  done<T>(result: T): Plan<T> {
    return { writes: this.writes, sequences: this.sequences, next: this.data, result }
  }
}

function idOf<K extends CollectionKey>(collection: K, row: RawScope[K][number]): string {
  return (docId[collection] as (r: unknown) => string)(row)
}

// ---------------------------------------------------------------------------
// Shared guards — the routes' own helpers
// ---------------------------------------------------------------------------

function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) throw new ApiError(422, summariseZodError(parsed.error))
  return parsed.data
}

function parseIntId(raw: number, what: string): number {
  // Parse and reject before looking anything up, as the route did with NaN.
  if (!Number.isInteger(raw) || raw <= 0) {
    throw new ApiError(400, `${what} id must be a positive whole number.`)
  }
  return raw
}

/**
 * Refuses a delete with dependents, naming them and how many (R-9.4, R-9.5).
 * Plurals are given explicitly — appending "s" produces "capabilitys".
 */
function refuseIfDependents(
  what: string,
  parts: { count: number; one: string; many: string }[],
): void {
  const named = parts
    .filter((part) => part.count > 0)
    .map((part) => `${part.count} ${part.count === 1 ? part.one : part.many}`)
  if (named.length === 0) return
  throw new ApiError(409, `Cannot delete ${what} — ${named.join(' and ')} reference it.`)
}

const findRelease = (d: Draft, id: string) => d.data.releases.find((r) => r.id === id)
const findPhase = (d: Draft, id: string) => d.data.phases.find((p) => p.id === id)
const findFeature = (d: Draft, id: string) => d.data.pwcFeatures.find((f) => f.id === id)
const findMvp = (d: Draft, id: number) => d.data.mvpFeatures.find((m) => m.id === id)
const findCapability = (d: Draft, id: number) => d.data.capabilities.find((c) => c.id === id)

/** Uniqueness is on (ref, scope_option), with NULL compared as ''. */
const findMvpByRefOption = (d: Draft, ref: number, option: string | null) =>
  d.data.mvpFeatures.find((m) => m.ref === ref && (m.scope_option ?? '') === (option ?? ''))

/** A placement named by a create or move has to exist. `undefined` is "not given". */
function assertPlacementExists(d: Draft, releaseId?: string, phaseId?: string): void {
  if (releaseId !== undefined && !findRelease(d, releaseId)) {
    throw new ApiError(422, `There is no package "${releaseId}".`)
  }
  if (phaseId !== undefined && !findPhase(d, phaseId)) {
    throw new ApiError(422, `There is no phase "${phaseId}".`)
  }
}

/**
 * A stated placement has to name something real. `null` is always allowed —
 * it clears the statement and hands the record back to the derivation.
 */
function assertStatedPlacement(d: Draft, releaseId?: string | null, phaseId?: string | null) {
  if (releaseId != null && !findRelease(d, releaseId)) {
    throw new ApiError(422, `There is no package "${releaseId}".`)
  }
  if (phaseId != null && !findPhase(d, phaseId)) {
    throw new ApiError(422, `There is no phase "${phaseId}".`)
  }
}

/** The next display_order: one past the highest, or 1 for an empty table. */
const nextOrder = (rows: { display_order: number }[]) =>
  rows.reduce((max, row) => Math.max(max, row.display_order), 0) + 1

const byDisplayOrder = (a: { display_order: number }, b: { display_order: number }) =>
  a.display_order - b.display_order

const sortedPhases = (d: Draft): StoredPhase[] =>
  [...d.data.phases].sort(byDisplayOrder).map((p) => ({ ...p }))

/** The API row: everything but the source wording re-import matches on. */
export function toCapabilityRow(row: StoredCapability): CapabilityRow & {
  created_at: string
  updated_at: string
} {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { source_text, ...rest } = row
  return { ...rest }
}

// ---------------------------------------------------------------------------
// Conflict recompute (server/services/conflict-recompute.ts)
// ---------------------------------------------------------------------------

/** Live links joined to their feature and capability — the SQL inner join. */
function conflictInputs(
  d: Draft,
  match: (link: StoredFeatureCapabilityLink) => boolean,
): { link: StoredFeatureCapabilityLink; input: ConflictInputs }[] {
  const out: { link: StoredFeatureCapabilityLink; input: ConflictInputs }[] = []
  for (const link of d.data.featureCapabilityLinks) {
    if (link.removed_at !== null || !match(link)) continue
    const f = findFeature(d, link.pwc_feature_id)
    const c = findCapability(d, link.capability_id)
    if (!f || !c) continue
    out.push({
      link,
      input: {
        link_id: link.id,
        pwc_feature_id: link.pwc_feature_id,
        capability_id: link.capability_id,
        matched: link.matched,
        release_conflict: link.release_conflict,
        phase_conflict: link.phase_conflict,
        phase_conflict_merged: link.phase_conflict_merged,
        feature_release_id: f.release_id,
        feature_phase_id: f.phase_id,
        feature_phase_label: f.source_phase_label,
        capability_release_id: c.release_id,
        capability_phase_id: c.phase_id,
        capability_phase_label: c.source_phase_label,
      },
    })
  }
  return out.sort((a, b) => a.link.id - b.link.id)
}

function applyConflicts(d: Draft, targets: ReturnType<typeof conflictInputs>): void {
  for (const { link, input } of targets) {
    // Always written: the recorded placements can move even when the flags
    // do not.
    d.update('featureCapabilityLinks', link, {
      ...deriveLinkConflict(input),
      updated_at: d.now,
    })
  }
}

const recomputeForCapability = (d: Draft, capabilityId: number) =>
  applyConflicts(d, conflictInputs(d, (l) => l.capability_id === capabilityId))

const recomputeForFeature = (d: Draft, featureId: string) =>
  applyConflicts(d, conflictInputs(d, (l) => l.pwc_feature_id === featureId))

/** Every live link — the import settles flags against what it wrote. */
export const recomputeAllConflicts = (d: Draft) => applyConflicts(d, conflictInputs(d, () => true))

/**
 * SQLite's LOWER(): ASCII letters only. Capability identity was a unique
 * index on (mvp_ref, LOWER(text)), so matching must lowercase exactly that.
 */
export const sqlLower = (text: string) => text.replace(/[A-Z]/g, (c) => c.toLowerCase())

// ---------------------------------------------------------------------------
// Releases
// ---------------------------------------------------------------------------

export function planCreateRelease(ctx: PlanContext, body: unknown): Plan<StoredRelease> {
  const d = new Draft(ctx)
  const input = parse(createReleaseSchema, body)
  if (findRelease(d, input.id)) throw new ApiError(409, `Package ${input.id} already exists.`)

  const row: StoredRelease = {
    id: input.id,
    label: input.label,
    name: input.name,
    description: input.description,
    display_order: nextOrder(d.data.releases),
    in_mapping_source: 0,
    in_sequencing_source: 0,
    source: 'manual',
    created_at: d.now,
    updated_at: d.now,
  }
  d.insert('releases', row)
  return d.done({ ...row })
}

export function planUpdateRelease(
  ctx: PlanContext,
  id: string,
  body: unknown,
): Plan<StoredRelease> {
  const d = new Draft(ctx)
  const current = findRelease(d, id)
  if (!current) throw new ApiError(404, `There is no package ${id}.`)
  const patch = parse(updateReleaseSchema, body)
  if (Object.keys(patch).length === 0) return d.done({ ...current })

  d.update('releases', current, { ...patch, source: 'manual', updated_at: d.now })
  return d.done({ ...current })
}

export function planDeleteRelease(ctx: PlanContext, id: string): Plan<{ deleted: number }> {
  const d = new Draft(ctx)
  const current = findRelease(d, id)
  if (!current) throw new ApiError(404, `There is no package ${id}.`)

  // Releases never cascade: a feature with no release cannot be drawn.
  refuseIfDependents(`package ${id}`, [
    {
      count: d.data.pwcFeatures.filter((f) => f.release_id === id).length,
      one: 'PwC feature',
      many: 'PwC features',
    },
    {
      count: d.data.capabilities.filter((c) => c.release_id === id).length,
      one: 'capability',
      many: 'capabilities',
    },
  ])

  d.remove('releases', current)
  return d.done({ deleted: 1 })
}

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

export function planCreatePhase(ctx: PlanContext, body: unknown): Plan<StoredPhase> {
  const d = new Draft(ctx)
  const input = parse(createPhaseSchema, body)
  if (findPhase(d, input.id)) throw new ApiError(409, `Phase ${input.id} already exists.`)

  const row: StoredPhase = {
    id: input.id,
    name: input.name,
    epic_ref: input.epic_ref,
    epic_description: input.epic_description,
    display_order: nextOrder(d.data.phases),
    source: 'manual',
    created_at: d.now,
    updated_at: d.now,
  }
  d.insert('phases', row)
  return d.done({ ...row })
}

export function planUpdatePhase(ctx: PlanContext, id: string, body: unknown): Plan<StoredPhase> {
  const d = new Draft(ctx)
  const current = findPhase(d, id)
  if (!current) throw new ApiError(404, `There is no phase ${id}.`)
  const patch = parse(updatePhaseSchema, body)
  if (Object.keys(patch).length === 0) return d.done({ ...current })

  d.update('phases', current, { ...patch, source: 'manual', updated_at: d.now })
  return d.done({ ...current })
}

/**
 * Rewrites display_order to a contiguous 1..n in current order (R-9.3), ties
 * broken by id. Only rows whose position actually changes are written.
 */
function renumberPhases(d: Draft): void {
  const ordered = [...d.data.phases].sort(
    (a, b) => a.display_order - b.display_order || compareText(a.id, b.id),
  )
  ordered.forEach((phase, index) => {
    if (phase.display_order !== index + 1) {
      d.update('phases', phase, { display_order: index + 1 })
    }
  })
}

export function planMovePhase(
  ctx: PlanContext,
  id: string,
  direction: MoveDirection,
): Plan<{ moved: boolean; phases: StoredPhase[] }> {
  const d = new Draft(ctx)
  if (!findPhase(d, id)) throw new ApiError(404, `There is no phase ${id}.`)
  const input = parse(moveSchema, { direction })

  // Renumbered first, inside the same commit, so a swap never leaves a gap.
  renumberPhases(d)
  const phase = findPhase(d, id)!
  const candidates = d.data.phases.filter((p) =>
    input.direction === 'up'
      ? p.display_order < phase.display_order
      : p.display_order > phase.display_order,
  )
  const neighbour = candidates.sort((a, b) =>
    input.direction === 'up' ? b.display_order - a.display_order : byDisplayOrder(a, b),
  )[0]
  if (!neighbour) return d.done({ moved: false, phases: sortedPhases(d) })

  const [phaseOrder, neighbourOrder] = [phase.display_order, neighbour.display_order]
  d.update('phases', phase, { display_order: neighbourOrder, updated_at: d.now })
  d.update('phases', neighbour, { display_order: phaseOrder, updated_at: d.now })
  renumberPhases(d)
  return d.done({ moved: true, phases: sortedPhases(d) })
}

export function planDeletePhase(
  ctx: PlanContext,
  id: string,
): Plan<{ deleted: number; phases: StoredPhase[] }> {
  const d = new Draft(ctx)
  const current = findPhase(d, id)
  if (!current) throw new ApiError(404, `There is no phase ${id}.`)

  refuseIfDependents(`phase ${id}`, [
    {
      count: d.data.pwcFeatures.filter((f) => f.phase_id === id).length,
      one: 'PwC feature',
      many: 'PwC features',
    },
    {
      count: d.data.capabilities.filter((c) => c.phase_id === id).length,
      one: 'capability',
      many: 'capabilities',
    },
  ])

  d.remove('phases', current)
  return d.done({ deleted: 1, phases: sortedPhases(d) })
}

// ---------------------------------------------------------------------------
// PwC features
// ---------------------------------------------------------------------------

/**
 * The next unused F- number. Feature ids are sparse by design — the gaps
 * carry no meaning — so this fills the lowest gap rather than continuing past
 * the maximum (PRD §6).
 */
export function nextFreeFeatureId(raw: RawScope): string {
  const taken = new Set(
    raw.pwcFeatures.map((f) => Number(f.id.slice(2))).filter((n) => Number.isInteger(n)),
  )
  let candidate = 1
  while (taken.has(candidate)) candidate += 1
  return `F-${String(candidate).padStart(3, '0')}`
}

export function planCreateFeature(ctx: PlanContext, body: unknown): Plan<StoredPwcFeature> {
  const d = new Draft(ctx)
  const input = parse(createFeatureSchema, body)
  if (findFeature(d, input.id)) throw new ApiError(409, `Feature ${input.id} already exists.`)
  assertPlacementExists(d, input.release_id, input.phase_id)

  // A manually created feature sorts after the imported ones.
  const row: StoredPwcFeature = {
    id: input.id,
    name: input.name,
    foundational_build: input.foundational_build,
    release_id: input.release_id,
    phase_id: input.phase_id,
    source_phase_label: null,
    capability_note: input.capability_note,
    question: null,
    notes: '',
    notes_edited: 0,
    display_order: nextOrder(d.data.pwcFeatures),
    source: 'manual',
    created_at: d.now,
    updated_at: d.now,
  }
  d.insert('pwcFeatures', row)
  return d.done({ ...row })
}

export function planUpdateFeature(
  ctx: PlanContext,
  id: string,
  body: unknown,
): Plan<StoredPwcFeature> {
  const d = new Draft(ctx)
  const current = findFeature(d, id)
  if (!current) throw new ApiError(404, `There is no feature ${id}.`)
  const patch = parse(updateFeatureSchema, body)
  assertPlacementExists(d, patch.release_id, patch.phase_id)

  const fields = Object.keys(patch)
  if (fields.length === 0) return d.done({ ...current })

  // Editing a row marks it manual so a later import will not overwrite the
  // edit (R-9.9, R-11.4). Notes are the exception: editing them sets
  // notes_edited instead, which protects the notes without freezing the rest.
  d.update('pwcFeatures', current, {
    ...patch,
    ...(fields.includes('notes') ? { notes_edited: 1 } : {}),
    ...(fields.some((field) => field !== 'notes') ? { source: 'manual' } : {}),
    updated_at: d.now,
  })
  const updated = { ...current }

  // Moving a feature changes what its capabilities disagree with, so the
  // flags have to follow it or the map keeps reporting the old answer.
  if (patch.release_id !== undefined || patch.phase_id !== undefined) {
    recomputeForFeature(d, id)
  }
  return d.done(updated)
}

export function planDeleteFeature(
  ctx: PlanContext,
  id: string,
  cascade: boolean,
): Plan<DeleteFeatureResult> {
  const d = new Draft(ctx)
  const current = findFeature(d, id)
  if (!current) throw new ApiError(404, `There is no feature ${id}.`)

  // Every join row counts, tombstoned or not — they all cascade with it.
  const mvpLinks = d.data.featureMvpLinks.filter((l) => l.pwc_feature_id === id)
  const capabilityLinks = d.data.featureCapabilityLinks.filter((l) => l.pwc_feature_id === id)
  const dependents = { mvpLinks: mvpLinks.length, capabilityLinks: capabilityLinks.length }

  if (dependents.mvpLinks + dependents.capabilityLinks > 0 && !cascade) {
    // Refused with a message naming what depends on it and how many (R-9.4).
    const parts = [
      dependents.mvpLinks > 0
        ? `${dependents.mvpLinks} MVP feature link${dependents.mvpLinks === 1 ? '' : 's'}`
        : null,
      dependents.capabilityLinks > 0
        ? `${dependents.capabilityLinks} capability link${
            dependents.capabilityLinks === 1 ? '' : 's'
          }`
        : null,
    ].filter(Boolean)
    throw new ApiError(
      409,
      `Cannot delete ${id} — ${parts.join(', ')} reference it. Confirm the cascade to remove them too.`,
    )
  }

  // ON DELETE CASCADE, done by hand.
  for (const link of mvpLinks) d.remove('featureMvpLinks', link)
  for (const link of capabilityLinks) d.remove('featureCapabilityLinks', link)
  d.remove('pwcFeatures', current)
  return d.done({ deleted: 1, cascaded: dependents })
}

const liveMvpIdsFor = (d: Draft, featureId: string) =>
  d.data.featureMvpLinks
    .filter((l) => l.pwc_feature_id === featureId && l.removed_at === null)
    .map((l) => l.mvp_feature_id)
    .sort((a, b) => a - b)

const liveCapabilityIdsFor = (d: Draft, featureId: string) =>
  d.data.featureCapabilityLinks
    .filter((l) => l.pwc_feature_id === featureId && l.removed_at === null)
    .map((l) => l.capability_id)
    .sort((a, b) => a - b)

/**
 * Replaces the feature's MVP links with exactly this set. Removals are
 * tombstoned rather than deleted, so a re-import cannot undo them (R-9.10).
 */
export function planSetFeatureMvpLinks(
  ctx: PlanContext,
  id: string,
  mvpFeatureIds: number[],
): Plan<{ pwc_feature_id: string; mvpFeatureIds: number[] }> {
  const d = new Draft(ctx)
  if (!findFeature(d, id)) throw new ApiError(404, `There is no feature ${id}.`)
  const input = parse(setMvpLinksSchema, { mvpFeatureIds })

  const known = new Set(d.data.mvpFeatures.map((m) => m.id))
  const unknown = input.mvpFeatureIds.filter((mvpId) => !known.has(mvpId))
  if (unknown.length > 0) {
    throw new ApiError(422, `No MVP feature with id ${unknown.join(', ')}.`)
  }

  const wanted = new Set(input.mvpFeatureIds)
  const linkFor = (mvpId: number) =>
    d.data.featureMvpLinks.find((l) => l.pwc_feature_id === id && l.mvp_feature_id === mvpId)

  for (const existing of liveMvpIdsFor(d, id)) {
    if (!wanted.has(existing)) {
      d.update('featureMvpLinks', linkFor(existing)!, { removed_at: d.now, updated_at: d.now })
    }
  }
  for (const mvpId of wanted) {
    const link = linkFor(mvpId)
    // Adds a link, or revives one the user had removed.
    if (link) {
      d.update('featureMvpLinks', link, { removed_at: null, source: 'manual', updated_at: d.now })
    } else {
      d.insert('featureMvpLinks', {
        pwc_feature_id: id,
        mvp_feature_id: mvpId,
        source: 'manual',
        created_at: d.now,
        updated_at: d.now,
        removed_at: null,
      } satisfies StoredFeatureMvpLink)
    }
  }
  return d.done({ pwc_feature_id: id, mvpFeatureIds: liveMvpIdsFor(d, id) })
}

/** Replaces the feature's capability links with exactly this set. */
export function planSetFeatureCapabilityLinks(
  ctx: PlanContext,
  id: string,
  capabilityIds: number[],
): Plan<{ pwc_feature_id: string; capabilityIds: number[] }> {
  const d = new Draft(ctx)
  if (!findFeature(d, id)) throw new ApiError(404, `There is no feature ${id}.`)
  const input = parse(setCapabilityLinksSchema, { capabilityIds })

  const known = new Set(d.data.capabilities.map((c) => c.id))
  const unknown = input.capabilityIds.filter((capId) => !known.has(capId))
  if (unknown.length > 0) {
    throw new ApiError(422, `No capability with id ${unknown.join(', ')}.`)
  }

  const wanted = new Set(input.capabilityIds)
  const linkFor = (capabilityId: number) =>
    d.data.featureCapabilityLinks.find(
      (l) => l.pwc_feature_id === id && l.capability_id === capabilityId,
    )

  for (const existing of liveCapabilityIdsFor(d, id)) {
    if (!wanted.has(existing)) {
      d.update('featureCapabilityLinks', linkFor(existing)!, {
        removed_at: d.now,
        updated_at: d.now,
      })
    }
  }
  for (const capabilityId of wanted) {
    const link = linkFor(capabilityId)
    if (link) {
      d.update('featureCapabilityLinks', link, { removed_at: null, updated_at: d.now })
    } else {
      // The table's column defaults, spelled out.
      d.insert('featureCapabilityLinks', {
        id: d.nextId('pwc_feature_capabilities'),
        pwc_feature_id: id,
        capability_id: capabilityId,
        source_citations: 1,
        matched: 1,
        release_conflict: 0,
        phase_conflict: 0,
        feature_release_id: null,
        capability_release_id: null,
        feature_phase_label: null,
        capability_phase_label: null,
        phase_conflict_merged: 0,
        resolution_state: 'unreviewed',
        resolution_note: null,
        resolved_at: null,
        source: 'manual',
        created_at: d.now,
        updated_at: d.now,
        removed_at: null,
      } satisfies StoredFeatureCapabilityLink)
    }
  }
  return d.done({ pwc_feature_id: id, capabilityIds: liveCapabilityIdsFor(d, id) })
}

// ---------------------------------------------------------------------------
// Conflicts
// ---------------------------------------------------------------------------

/**
 * Records a human's decision about a conflict (R-7.2, R-7.3). Neither
 * placement is changed — the conflict stays visible, it just stops being
 * unreviewed, and a later import will not overwrite the decision (R-11.4).
 */
export function planResolveConflict(
  ctx: PlanContext,
  id: number,
  body: unknown,
): Plan<FeatureCapabilityLinkRow & { removed_at: string | null }> {
  const d = new Draft(ctx)
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'Conflict id must be a positive whole number.')
  }
  const link = d.data.featureCapabilityLinks.find((l) => l.id === id)
  if (!link) throw new ApiError(404, `There is no conflict ${id}.`)
  const input = parse(resolveConflictSchema, body)

  d.update('featureCapabilityLinks', link, {
    resolution_state: input.resolution_state,
    resolution_note: input.resolution_note,
    // Returning a conflict to unreviewed clears the timestamp too, so
    // "resolved_at is set" always means "someone decided".
    resolved_at: input.resolution_state === 'unreviewed' ? null : d.now,
    updated_at: d.now,
  })
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { created_at, updated_at, ...row } = link
  return d.done({ ...row })
}

// ---------------------------------------------------------------------------
// MVP features
// ---------------------------------------------------------------------------

export function planCreateMvpFeature(ctx: PlanContext, body: unknown): Plan<StoredMvpFeature> {
  const d = new Draft(ctx)
  const input = parse(createMvpFeatureSchema, body)

  // Uniqueness is on (ref, scope_option), so the same ref with a different
  // option is a distinct record, not a duplicate.
  if (findMvpByRefOption(d, input.ref, input.scope_option)) {
    throw new ApiError(
      409,
      `MVP feature ${input.ref}${
        input.scope_option ? ` Option ${input.scope_option}` : ' (no option)'
      } already exists.`,
    )
  }
  assertStatedPlacement(d, input.release_id, input.phase_id)

  const row: StoredMvpFeature = {
    id: d.nextId('mvp_features'),
    ref: input.ref,
    scope_option: input.scope_option,
    title: input.title,
    // Unstated is NULL, which is what an unplaced record is.
    release_id: input.release_id ?? null,
    phase_id: input.phase_id ?? null,
    question: null,
    details: '',
    source: 'manual',
    created_at: d.now,
    updated_at: d.now,
  }
  d.insert('mvpFeatures', row)
  return d.done({ ...row })
}

type PlacementPatch = { release_id?: string; phase_id?: string; source_phase_label?: string }

/**
 * Moves every capability this MSD feature record owns. Only the axis given
 * moves, and rows already at the target are skipped, so a re-save writes
 * nothing. Returns the ids actually moved — their placement is shared with
 * every PwC feature citing them, so the caller recomputes their conflicts.
 */
function moveCapabilitiesForMvpFeature(d: Draft, owner: number, values: PlacementPatch): number[] {
  const rows = d.data.capabilities
    .filter((c) => c.mvp_feature_id === owner)
    .sort((a, b) => a.id - b.id)
  const moved: number[] = []
  for (const row of rows) {
    const changesRelease = values.release_id !== undefined && values.release_id !== row.release_id
    const changesPhase = values.phase_id !== undefined && values.phase_id !== row.phase_id
    if (!changesRelease && !changesPhase) continue

    d.update('capabilities', row, {
      ...(changesRelease ? { release_id: values.release_id } : {}),
      ...(changesPhase
        ? { phase_id: values.phase_id, source_phase_label: values.source_phase_label ?? null }
        : {}),
      source: 'manual',
      updated_at: d.now,
    })
    moved.push(row.id)
  }
  return moved
}

/** A phase conflict is measured on source labels, so a moved row takes the phase's name. */
const phaseLabel = (d: Draft, phaseId: string) => findPhase(d, phaseId)?.name ?? phaseId

export function planUpdateMvpFeature(
  ctx: PlanContext,
  rawId: number,
  body: unknown,
): Plan<StoredMvpFeature> {
  const d = new Draft(ctx)
  const id = parseIntId(rawId, 'MVP feature')
  const existing = findMvp(d, id)
  if (!existing) throw new ApiError(404, `There is no MVP feature ${id}.`)
  const patch = parse(updateMvpFeatureSchema, body)

  if (patch.scope_option !== undefined) {
    const clash = findMvpByRefOption(d, existing.ref, patch.scope_option)
    if (clash && clash.id !== id) {
      throw new ApiError(
        409,
        `MVP feature ${existing.ref}${
          patch.scope_option ? ` Option ${patch.scope_option}` : ' (no option)'
        } already exists.`,
      )
    }
  }
  assertStatedPlacement(d, patch.release_id, patch.phase_id)

  const fields = Object.keys(patch)
  if (fields.length > 0) {
    // `details` is a reader's note, not a correction, so writing it alone
    // does not freeze the record against re-import.
    d.update('mvpFeatures', existing, {
      ...patch,
      ...(fields.some((field) => field !== 'details') ? { source: 'manual' } : {}),
      updated_at: d.now,
    })
  }
  const updated = { ...existing }

  // The record's placement drives its capabilities: setting a release or
  // stage here moves everything it owns to match, and each moved one has its
  // conflicts re-judged (PRD §16 P-2). Clearing a statement moves nothing.
  const moveTo: PlacementPatch = {}
  if (patch.release_id != null) moveTo.release_id = patch.release_id
  if (patch.phase_id != null) {
    moveTo.phase_id = patch.phase_id
    moveTo.source_phase_label = phaseLabel(d, patch.phase_id)
  }
  if (Object.keys(moveTo).length > 0) {
    for (const capabilityId of moveCapabilitiesForMvpFeature(d, id, moveTo)) {
      recomputeForCapability(d, capabilityId)
    }
  }
  return d.done(updated)
}

const ownedCapabilityIds = (d: Draft, mvpFeatureId: number) =>
  d.data.capabilities
    .filter((c) => c.mvp_feature_id === mvpFeatureId)
    .map((c) => c.id)
    .sort((a, b) => a - b)

/**
 * Makes this MSD feature record the owner of exactly these capabilities, and
 * of no others. Released ones are left ownerless rather than guessed at (D-3);
 * `mvp_ref` is untouched so re-import still recognises the row. Only rows that
 * change are written.
 */
export function planSetMvpCapabilities(
  ctx: PlanContext,
  rawId: number,
  capabilityIds: number[],
): Plan<{ mvp_feature_id: number; capabilityIds: number[] }> {
  const d = new Draft(ctx)
  const id = parseIntId(rawId, 'MVP feature')
  if (!findMvp(d, id)) throw new ApiError(404, `There is no MVP feature ${id}.`)
  const input = parse(setCapabilityLinksSchema, { capabilityIds })

  const known = new Set(d.data.capabilities.map((c) => c.id))
  const unknown = input.capabilityIds.filter((capId) => !known.has(capId))
  if (unknown.length > 0) {
    throw new ApiError(422, `No capability with id ${unknown.join(', ')}.`)
  }

  const wanted = new Set(input.capabilityIds)
  const current = new Set(ownedCapabilityIds(d, id))
  for (const capId of current) {
    if (!wanted.has(capId)) {
      d.update('capabilities', findCapability(d, capId)!, {
        mvp_feature_id: null,
        mvp_owner_ambiguous: 0,
        source: 'manual',
        updated_at: d.now,
      })
    }
  }
  for (const capId of wanted) {
    if (!current.has(capId)) {
      d.update('capabilities', findCapability(d, capId)!, {
        mvp_feature_id: id,
        mvp_owner_ambiguous: 0,
        source: 'manual',
        updated_at: d.now,
      })
    }
  }
  return d.done({ mvp_feature_id: id, capabilityIds: ownedCapabilityIds(d, id) })
}

/**
 * Re-assigns an MSD feature record by moving the capabilities it owns — it
 * has no placement of its own. Each moved capability has its conflicts
 * re-judged (PRD §16 P-2).
 */
export function planSetMvpPlacement(
  ctx: PlanContext,
  rawId: number,
  body: unknown,
): Plan<{ mvp_feature_id: number; moved: number; capabilityIds: number[] }> {
  const d = new Draft(ctx)
  const id = parseIntId(rawId, 'MVP feature')
  const record = findMvp(d, id)
  if (!record) throw new ApiError(404, `There is no MVP feature ${id}.`)
  const input = parse(setMvpPlacementSchema, body)
  assertPlacementExists(d, input.release_id, input.phase_id)

  // Refused rather than silently doing nothing: a record with no capability
  // is placed by the features citing it, and this cannot move those.
  if (ownedCapabilityIds(d, id).length === 0) {
    throw new ApiError(
      409,
      `MVP feature ${record.ref} owns no capability, so there is nothing to move. ` +
        'It is placed by the PwC features that cite it.',
    )
  }

  const patch: PlacementPatch = { ...input }
  if (patch.phase_id !== undefined) patch.source_phase_label = phaseLabel(d, patch.phase_id)

  const moved = moveCapabilitiesForMvpFeature(d, id, patch)
  for (const capabilityId of moved) recomputeForCapability(d, capabilityId)
  return d.done({ mvp_feature_id: id, moved: moved.length, capabilityIds: moved })
}

export function planDeleteMvpFeature(ctx: PlanContext, rawId: number): Plan<{ deleted: number }> {
  const d = new Draft(ctx)
  const id = parseIntId(rawId, 'MVP feature')
  const existing = findMvp(d, id)
  if (!existing) throw new ApiError(404, `There is no MVP feature ${id}.`)

  // Every link counts, tombstoned or not, as the SQL count did.
  const links = d.data.featureMvpLinks.filter((l) => l.mvp_feature_id === id)
  refuseIfDependents(`MVP feature ${existing.ref}`, [
    { count: links.length, one: 'PwC feature', many: 'PwC features' },
    {
      count: d.data.capabilities.filter((c) => c.mvp_feature_id === id).length,
      one: 'capability',
      many: 'capabilities',
    },
  ])

  d.remove('mvpFeatures', existing)
  return d.done({ deleted: 1 })
}

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

export function planCreateCapability(
  ctx: PlanContext,
  body: unknown,
): Plan<ReturnType<typeof toCapabilityRow>> {
  const d = new Draft(ctx)
  const input = parse(createCapabilitySchema, body)
  assertPlacementExists(d, input.release_id, input.phase_id)

  // Identity is (ref, case-insensitive text) — the same rule the import uses.
  const clash = d.data.capabilities.find(
    (c) => c.mvp_ref === input.mvp_ref && c.text.toLowerCase() === input.text.toLowerCase(),
  )
  if (clash) {
    throw new ApiError(409, `A capability with that text already exists under ref ${input.mvp_ref}.`)
  }

  // Attach to the ref's single record where there is exactly one; an
  // ambiguous ref is left unattached rather than guessed at (D-3).
  const candidates = d.data.mvpFeatures.filter((m) => m.ref === input.mvp_ref)
  const row: StoredCapability = {
    id: d.nextId('capabilities'),
    mvp_feature_id: candidates.length === 1 ? candidates[0].id : null,
    mvp_ref: input.mvp_ref,
    mvp_owner_ambiguous: 0,
    text: input.text,
    actor: input.actor,
    release_id: input.release_id,
    phase_id: input.phase_id,
    source_phase_label: null,
    question: null,
    source: 'manual',
    source_text: null,
    created_at: d.now,
    updated_at: d.now,
  }
  d.insert('capabilities', row)
  return d.done(toCapabilityRow(row))
}

export function planUpdateCapability(
  ctx: PlanContext,
  rawId: number,
  body: unknown,
): Plan<ReturnType<typeof toCapabilityRow>> {
  const d = new Draft(ctx)
  const id = parseIntId(rawId, 'Capability')
  const current = findCapability(d, id)
  if (!current) throw new ApiError(404, `There is no capability ${id}.`)
  const input = parse(updateCapabilitySchema, body)
  assertPlacementExists(d, input.release_id, input.phase_id)

  const patch: Partial<StoredCapability> = { ...input }
  // A hand-moved capability carries the label of where it now is, or it
  // would disagree with its own phase.
  if (input.phase_id !== undefined) patch.source_phase_label = phaseLabel(d, input.phase_id)

  // Identity is (ref, case-insensitive text): a rename onto a sibling's
  // wording is refused rather than left to collide.
  if (input.text !== undefined) {
    // The route matched with SQL LOWER(), so ASCII-only lowercasing here.
    const text = sqlLower(input.text)
    const clash = d.data.capabilities.find(
      (c) => c.mvp_ref === current.mvp_ref && sqlLower(c.text) === text,
    )
    if (clash && clash.id !== id) {
      throw new ApiError(
        409,
        `MVP feature ${current.mvp_ref} already has a capability called “${clash.text}”.`,
      )
    }
  }

  const fields = Object.keys(patch)
  if (fields.length === 0) return d.done(toCapabilityRow(current))

  // A question is an annotation, not a change to the document's capability,
  // so asking one must not freeze the row against re-import.
  const SOURCE_DERIVED = ['text', 'actor', 'release_id', 'phase_id']
  const changesSource = fields.some((field) => SOURCE_DERIVED.includes(field))
  d.update('capabilities', current, {
    ...patch,
    ...(changesSource ? { source: 'manual' } : {}),
    updated_at: d.now,
  })
  const updated = toCapabilityRow(current)

  // One placement, shared by every feature citing it (PRD §16 P-2).
  if (input.release_id !== undefined || input.phase_id !== undefined) {
    recomputeForCapability(d, id)
  }
  return d.done(updated)
}

/**
 * Deletes a capability. A capability any feature cites is refused until the
 * cascade is confirmed (R-9.4, R-9.5); its citation rows — tombstoned ones
 * too — go with it.
 */
export function planDeleteCapability(
  ctx: PlanContext,
  rawId: number,
  cascade: boolean,
): Plan<{ deleted: number; cascaded: { features: number } }> {
  const d = new Draft(ctx)
  const id = parseIntId(rawId, 'Capability')
  const current = findCapability(d, id)
  if (!current) throw new ApiError(404, `There is no capability ${id}.`)

  const links = d.data.featureCapabilityLinks.filter((l) => l.capability_id === id)
  const dependents = { features: links.filter((l) => l.removed_at === null).length }
  if (dependents.features > 0 && !cascade) {
    throw new ApiError(
      409,
      `Cannot delete capability ${id} — ${dependents.features} PwC feature${
        dependents.features === 1 ? '' : 's'
      } cite it. Confirm the cascade to remove those citations too.`,
    )
  }

  for (const link of links) d.remove('featureCapabilityLinks', link)
  d.remove('capabilities', current)
  return d.done({ deleted: 1, cascaded: dependents })
}
