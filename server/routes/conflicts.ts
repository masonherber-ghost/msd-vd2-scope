import { Router } from 'express'
import { resolveConflictSchema, summariseZodError } from '../../src/lib/validators.js'
import { HttpError } from '../middleware/error-handler.js'
import {
  getAllFeatureCapabilityLinks,
  getFeatureCapabilityLink,
  resolveConflict,
} from '../repositories/feature-link-repository.js'

export const conflictsRouter = Router()

/** Every link carrying a conflict or an unmatched citation. */
conflictsRouter.get('/', (_req, res) => {
  res.json(
    getAllFeatureCapabilityLinks().filter(
      (link) =>
        link.release_conflict === 1 || link.phase_conflict === 1 || link.matched === 0,
    ),
  )
})

conflictsRouter.patch('/:id', (req, res) => {
  const id = Number(req.params.id)
  // Parse and reject before querying, or the query runs with NaN.
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(400, 'Conflict id must be a positive whole number.')
  }

  const link = getFeatureCapabilityLink(id)
  if (!link) throw new HttpError(404, `There is no conflict ${id}.`)

  const parsed = resolveConflictSchema.safeParse(req.body)
  if (!parsed.success) throw new HttpError(422, summariseZodError(parsed.error))

  res.json(resolveConflict(id, parsed.data.resolution_state, parsed.data.resolution_note))
})
