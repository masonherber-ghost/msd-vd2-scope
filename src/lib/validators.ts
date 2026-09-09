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
