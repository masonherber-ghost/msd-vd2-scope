import { Router } from 'express'
import { z } from 'zod'
import {
  createFeatureSchema,
  setCapabilityLinksSchema,
  setMvpLinksSchema,
  summariseZodError,
  updateFeatureSchema,
} from '../../src/lib/validators.js'
import { HttpError } from '../middleware/error-handler.js'
import { getAllCapabilities } from '../repositories/capability-repository.js'
import {
  getCapabilityIdsFor,
  getMvpFeatureIdsFor,
  setCapabilityLinks,
  setMvpFeatureLinks,
} from '../repositories/feature-link-repository.js'
import { getAllMvpFeatures } from '../repositories/mvp-feature-repository.js'
import { getAllPhases } from '../repositories/phase-repository.js'
import {
  countPwcFeatureDependents,
  createPwcFeature,
  deletePwcFeature,
  getPwcFeature,
  nextFreeFeatureId,
  updatePwcFeature,
} from '../repositories/pwc-feature-repository.js'
import { getAllReleases } from '../repositories/release-repository.js'

export const featuresRouter = Router()

function assertPlacementExists(releaseId?: string, phaseId?: string): void {
  if (releaseId !== undefined && !getAllReleases().some((r) => r.id === releaseId)) {
    throw new HttpError(422, `There is no release "${releaseId}".`)
  }
  if (phaseId !== undefined && !getAllPhases().some((p) => p.id === phaseId)) {
    throw new HttpError(422, `There is no phase "${phaseId}".`)
  }
}

/** The next free F- number, offered to the create form as a default. */
featuresRouter.get('/next-id', (_req, res) => {
  res.json({ id: nextFreeFeatureId() })
})

featuresRouter.post('/', (req, res) => {
  const parsed = createFeatureSchema.safeParse(req.body)
  if (!parsed.success) {
    throw new HttpError(422, summariseZodError(parsed.error))
  }
  const input = parsed.data

  // Uniqueness needs the database, so it cannot live in the schema.
  if (getPwcFeature(input.id)) {
    throw new HttpError(409, `Feature ${input.id} already exists.`)
  }
  assertPlacementExists(input.release_id, input.phase_id)

  res.status(201).json(createPwcFeature(input))
})

featuresRouter.patch('/:id', (req, res) => {
  const id = req.params.id
  if (!getPwcFeature(id)) {
    throw new HttpError(404, `There is no feature ${id}.`)
  }

  const parsed = updateFeatureSchema.safeParse(req.body)
  if (!parsed.success) {
    throw new HttpError(422, summariseZodError(parsed.error))
  }
  assertPlacementExists(parsed.data.release_id, parsed.data.phase_id)

  const updated = updatePwcFeature(id, parsed.data)
  if (!updated) throw new HttpError(500, `Could not update feature ${id}.`)
  res.json(updated)
})

const deleteQuerySchema = z.object({
  // Cascade is a separate, explicitly confirmed action (R-9.4, R-9.5).
  cascade: z.enum(['true', 'false']).optional(),
})

featuresRouter.delete('/:id', (req, res) => {
  const id = req.params.id
  if (!getPwcFeature(id)) {
    throw new HttpError(404, `There is no feature ${id}.`)
  }

  const query = deleteQuerySchema.safeParse(req.query)
  if (!query.success) {
    throw new HttpError(422, summariseZodError(query.error))
  }
  const cascade = query.data.cascade === 'true'

  const dependents = countPwcFeatureDependents(id)
  const total = dependents.assumptions + dependents.mvpLinks + dependents.capabilityLinks

  if (total > 0 && !cascade) {
    // Refused with a message naming what depends on it and how many (R-9.4).
    const parts = [
      dependents.assumptions > 0
        ? `${dependents.assumptions} assumption${dependents.assumptions === 1 ? '' : 's'}`
        : null,
      dependents.mvpLinks > 0
        ? `${dependents.mvpLinks} MVP feature link${dependents.mvpLinks === 1 ? '' : 's'}`
        : null,
      dependents.capabilityLinks > 0
        ? `${dependents.capabilityLinks} capability link${
            dependents.capabilityLinks === 1 ? '' : 's'
          }`
        : null,
    ].filter(Boolean)

    throw new HttpError(
      409,
      `Cannot delete ${id} — ${parts.join(', ')} reference it. Confirm the cascade to remove them too.`,
    )
  }

  const changes = deletePwcFeature(id)
  res.json({ deleted: changes, cascaded: dependents })
})

/**
 * Replaces the feature's MVP feature links with exactly this set. Removals are
 * tombstoned, so a re-import will not put them back (R-9.10).
 */
featuresRouter.put('/:id/mvp-features', (req, res) => {
  const id = req.params.id
  if (!getPwcFeature(id)) throw new HttpError(404, `There is no feature ${id}.`)

  const parsed = setMvpLinksSchema.safeParse(req.body)
  if (!parsed.success) throw new HttpError(422, summariseZodError(parsed.error))

  const known = new Set(getAllMvpFeatures().map((m) => m.id))
  const unknown = parsed.data.mvpFeatureIds.filter((mvpId) => !known.has(mvpId))
  if (unknown.length > 0) {
    throw new HttpError(
      422,
      `No MVP feature with id ${unknown.join(', ')}.`,
    )
  }

  setMvpFeatureLinks(id, parsed.data.mvpFeatureIds)
  res.json({ pwc_feature_id: id, mvpFeatureIds: getMvpFeatureIdsFor(id) })
})

/** Replaces the feature's capability links with exactly this set. */
featuresRouter.put('/:id/capabilities', (req, res) => {
  const id = req.params.id
  if (!getPwcFeature(id)) throw new HttpError(404, `There is no feature ${id}.`)

  const parsed = setCapabilityLinksSchema.safeParse(req.body)
  if (!parsed.success) throw new HttpError(422, summariseZodError(parsed.error))

  const known = new Set(getAllCapabilities().map((c) => c.id))
  const unknown = parsed.data.capabilityIds.filter((capId) => !known.has(capId))
  if (unknown.length > 0) {
    throw new HttpError(422, `No capability with id ${unknown.join(', ')}.`)
  }

  setCapabilityLinks(id, parsed.data.capabilityIds)
  res.json({ pwc_feature_id: id, capabilityIds: getCapabilityIdsFor(id) })
})
