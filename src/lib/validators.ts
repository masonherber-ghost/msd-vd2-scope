import { z } from 'zod'

/**
 * One schema per entity, used by BOTH the form and the route handler (R-9.3).
 * Client-side validation alone is not validation.
 *
 * Uniqueness and referential integrity cannot be expressed here — they need
 * the database — so the repository enforces those and the route maps them to
 * a message naming what conflicts.
 */

/** Feature ids are sparse and always F-nnn (PRD §6). */
export const FEATURE_ID_PATTERN = /^F-\d{3}$/

export const featureIdSchema = z
  .string()
  .trim()
  .regex(FEATURE_ID_PATTERN, 'Feature id must look like F-001.')

const nameSchema = z
  .string()
  .trim()
  .min(1, 'Give the feature a name.')
  .max(200, 'Keep the name to 200 characters or fewer.')

const foundationalBuildSchema = z
  .string()
  .trim()
  .max(2000, 'Keep the foundational-build statement to 2000 characters or fewer.')

// A feature with no release or phase has nowhere to draw on the map (R-9.3).
const releaseIdSchema = z.string().trim().min(1, 'Choose a release.')
const phaseIdSchema = z.string().trim().min(1, 'Choose a phase.')

export const createFeatureSchema = z.object({
  id: featureIdSchema,
  name: nameSchema,
  foundational_build: foundationalBuildSchema.default(''),
  release_id: releaseIdSchema,
  phase_id: phaseIdSchema,
  capability_note: z.string().trim().max(500).nullable().default(null),
})

/** PATCH accepts any subset, but never the id — that is the row's identity. */
export const updateFeatureSchema = z
  .object({
    name: nameSchema,
    foundational_build: foundationalBuildSchema,
    release_id: releaseIdSchema,
    phase_id: phaseIdSchema,
    capability_note: z.string().trim().max(500).nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Nothing to update.',
  })

export type CreateFeatureInput = z.infer<typeof createFeatureSchema>
export type UpdateFeatureInput = z.infer<typeof updateFeatureSchema>

/** Flattens a Zod error into `{ field: message }` for form display. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_'
    if (!result[key]) result[key] = issue.message
  }
  return result
}

/** A single-line summary, for a route's error response. */
export function summariseZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) =>
      issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
    )
    .join(' ')
}

/**
 * Replace-set bodies for a feature's links. Ids are validated as integers
 * here; that they exist is checked in the route, which has the database.
 */
const idListSchema = z
  .array(z.number().int().positive())
  .max(200, 'That is more links than a single feature can hold.')

export const setMvpLinksSchema = z.object({
  mvpFeatureIds: idListSchema,
})

export const setCapabilityLinksSchema = z.object({
  capabilityIds: idListSchema,
})

export type SetMvpLinksInput = z.infer<typeof setMvpLinksSchema>
export type SetCapabilityLinksInput = z.infer<typeof setCapabilityLinksSchema>

// ---------------------------------------------------------------------------
// Releases
// ---------------------------------------------------------------------------

/** `1.1`, `1.4`, `2` — a major with an optional minor, as both sources write them. */
export const RELEASE_ID_PATTERN = /^\d+(\.\d+)?$/

export const createReleaseSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(RELEASE_ID_PATTERN, 'A release id looks like 1.1, 1.4 or 2.'),
  label: z.string().trim().min(1, 'Give the release a label.').max(80),
  name: z.string().trim().max(200).default(''),
  description: z.string().trim().max(2000).default(''),
})

export const updateReleaseSchema = createReleaseSchema
  .omit({ id: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update.' })

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

export const createPhaseSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'A phase id is lower-case words joined by hyphens.')
    .max(80),
  name: z.string().trim().min(1, 'Give the phase a name.').max(120),
  // Free text and deliberately not unique — epic 186 sits on two phases (D-2).
  epic_ref: z.string().trim().max(40).default(''),
  epic_description: z.string().trim().max(500).default(''),
})

export const updatePhaseSchema = createPhaseSchema
  .omit({ id: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update.' })

// ---------------------------------------------------------------------------
// Assumptions
// ---------------------------------------------------------------------------

export const createAssumptionSchema = z.object({
  pwc_feature_id: featureIdSchema,
  text: z.string().trim().min(1, 'An assumption needs some text.').max(2000),
})

export const updateAssumptionSchema = z.object({
  text: z.string().trim().min(1, 'An assumption needs some text.').max(2000),
})

/** Reordering moves one row one step; positions are renumbered afterwards. */
export const moveSchema = z.object({
  direction: z.enum(['up', 'down']),
})

// ---------------------------------------------------------------------------
// MVP features
// ---------------------------------------------------------------------------

export const scopeOptionSchema = z
  .union([z.literal('1A'), z.literal('1B'), z.null()])
  .default(null)

export const createMvpFeatureSchema = z.object({
  ref: z
    .number()
    .int('An MVP ref is a whole number.')
    .positive('An MVP ref is a positive number.'),
  scope_option: scopeOptionSchema,
  title: z.string().trim().min(1, 'Give the MVP feature a title.').max(300),
})

export const updateMvpFeatureSchema = z
  .object({
    title: z.string().trim().min(1, 'Give the MVP feature a title.').max(300),
    scope_option: z.union([z.literal('1A'), z.literal('1B'), z.null()]),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update.' })

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

export const ACTORS = ['employer', 'staff', 'jobseeker', 'system'] as const

/** A new actor is a schema change, not free text (R-9.3). */
export const actorSchema = z.enum(ACTORS, {
  message: `An actor must be one of ${ACTORS.join(', ')}.`,
})

export const createCapabilitySchema = z.object({
  mvp_ref: z.number().int().positive('A capability needs an MVP ref.'),
  text: z.string().trim().min(1, 'A capability needs some text.').max(500),
  actor: actorSchema,
  // R-9.3: a capability requires a release and a phase. The importer's one
  // unmatched row predates this and is left as it is.
  release_id: z.string().trim().min(1, 'Choose a release.'),
  phase_id: z.string().trim().min(1, 'Choose a phase.'),
})

export const updateCapabilitySchema = z
  .object({
    text: z.string().trim().min(1, 'A capability needs some text.').max(500),
    actor: actorSchema,
    release_id: z.string().trim().min(1, 'Choose a release.'),
    phase_id: z.string().trim().min(1, 'Choose a phase.'),
    /** Null clears it. An empty string would read as "a blank question". */
    question: z
      .string()
      .trim()
      .max(1000, 'Keep a question under 1000 characters.')
      .nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update.' })

// ---------------------------------------------------------------------------
// Source documents
// ---------------------------------------------------------------------------

/**
 * What each source document is called in the UI.
 *
 * The stored `source` values stay `mapping` / `sequencing` — they are the
 * provenance the import writes and renaming them would be a migration for no
 * gain. These are the display names, and they have one home: the two
 * documents are named in a dozen places across the app, and letting each
 * place spell them out is how two screens end up disagreeing about what the
 * sources are called.
 *
 * `mapping` is the PwC scope-to-MVP mapping document, which sequences the
 * **PwC features**. `sequencing` is the MSD release capabilities table, which
 * sequences the **MSD features** and their capabilities.
 */
export const SOURCE_LABEL = {
  mapping: 'PwC features sequencing',
  sequencing: 'MSD features sequencing',
  both: 'Both sources',
  manual: 'Added by hand',
} as const

export type SourceKey = keyof typeof SOURCE_LABEL

/** Falls back to the raw value, so an unexpected source is visible not blank. */
export const sourceLabel = (source: string): string =>
  SOURCE_LABEL[source as SourceKey] ?? source

// ---------------------------------------------------------------------------
// Conflict resolution (R-7.2)
// ---------------------------------------------------------------------------

export const RESOLUTION_STATES = [
  'unreviewed',
  'mapping_wins',
  'table_wins',
  'both_correct',
  'defect_raised',
] as const

export type ResolutionState = (typeof RESOLUTION_STATES)[number]

export const RESOLUTION_LABEL: Record<ResolutionState, string> = {
  unreviewed: 'Unreviewed',
  mapping_wins: `${SOURCE_LABEL.mapping} is right`,
  table_wins: `${SOURCE_LABEL.sequencing} is right`,
  both_correct: 'Both are correct',
  defect_raised: 'Defect raised',
}

export const resolveConflictSchema = z.object({
  resolution_state: z.enum(RESOLUTION_STATES, {
    message: `A resolution state must be one of ${RESOLUTION_STATES.join(', ')}.`,
  }),
  resolution_note: z.string().trim().max(1000).nullable().default(null),
})

export type ResolveConflictInput = z.infer<typeof resolveConflictSchema>
