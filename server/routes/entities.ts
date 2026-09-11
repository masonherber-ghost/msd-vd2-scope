import { Router } from 'express'
import {
  createAssumptionSchema,
  createCapabilitySchema,
  createMvpFeatureSchema,
  createPhaseSchema,
  createReleaseSchema,
  moveSchema,
  summariseZodError,
  updateAssumptionSchema,
  updateCapabilitySchema,
  updateMvpFeatureSchema,
  updatePhaseSchema,
  updateReleaseSchema,
} from '../../src/lib/validators.js'
import { HttpError } from '../middleware/error-handler.js'
import {
  appendAssumption,
  deleteAssumption,
  getAssumption,
  getAssumptionsForFeature,
  moveAssumption,
  updateAssumptionText,
} from '../repositories/assumption-repository.js'
import {
  countCapabilityDependents,
  createCapability,
  deleteCapability,
  getAllCapabilities,
  getCapabilityById,
  updateCapability,
} from '../repositories/capability-repository.js'
import {
  countMvpFeatureDependents,
  createMvpFeature,
  deleteMvpFeature,
  findMvpFeature,
  getAllMvpFeatures,
  getMvpFeatureById,
  updateMvpFeature,
} from '../repositories/mvp-feature-repository.js'
import {
  countPhaseDependents,
  createPhase,
  deletePhase,
  getAllPhases,
  getPhase,
  movePhase,
  updatePhase,
} from '../repositories/phase-repository.js'
import { getPwcFeature } from '../repositories/pwc-feature-repository.js'
import {
  countReleaseDependents,
  createRelease,
  deleteRelease,
  getAllReleases,
  getRelease,
  updateRelease,
} from '../repositories/release-repository.js'
import { recomputeConflictsForCapability } from '../services/conflict-recompute.js'

/** Every handler here is synchronous, so `throw` reaches the error middleware. */

function parseIntId(raw: string, what: string): number {
  const id = Number(raw)
  // Parse and reject before querying, or the query runs with NaN.
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(400, `${what} id must be a positive whole number.`)
  }
  return id
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
  throw new HttpError(
    409,
    `Cannot delete ${what} — ${named.join(' and ')} reference it.`,
  )
}

// ---------------------------------------------------------------------------
// Releases
// ---------------------------------------------------------------------------

export const releasesRouter = Router()

releasesRouter.get('/', (_req, res) => res.json(getAllReleases()))

releasesRouter.post('/', (req, res) => {
  const parsed = createReleaseSchema.safeParse(req.body)
  if (!parsed.success) throw new HttpError(422, summariseZodError(parsed.error))
  if (getRelease(parsed.data.id)) {
    throw new HttpError(409, `Release ${parsed.data.id} already exists.`)
  }
  res.status(201).json(createRelease(parsed.data))
})

releasesRouter.patch('/:id', (req, res) => {
  if (!getRelease(req.params.id)) {
    throw new HttpError(404, `There is no release ${req.params.id}.`)
  }
  const parsed = updateReleaseSchema.safeParse(req.body)
  if (!parsed.success) throw new HttpError(422, summariseZodError(parsed.error))
  res.json(updateRelease(req.params.id, parsed.data))
})

releasesRouter.delete('/:id', (req, res) => {
  const id = req.params.id
  if (!getRelease(id)) throw new HttpError(404, `There is no release ${id}.`)

  const dependents = countReleaseDependents(id)
  // Releases never cascade: a feature with no release cannot be drawn.
  refuseIfDependents(`release ${id}`, [
    { count: dependents.features, one: 'PwC feature', many: 'PwC features' },
    { count: dependents.capabilities, one: 'capability', many: 'capabilities' },
  ])

  res.json({ deleted: deleteRelease(id) })
})

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

export const phasesRouter = Router()

phasesRouter.get('/', (_req, res) => res.json(getAllPhases()))

phasesRouter.post('/', (req, res) => {
  const parsed = createPhaseSchema.safeParse(req.body)
  if (!parsed.success) throw new HttpError(422, summariseZodError(parsed.error))
  if (getPhase(parsed.data.id)) {
    throw new HttpError(409, `Phase ${parsed.data.id} already exists.`)
  }
  res.status(201).json(createPhase(parsed.data))
})

phasesRouter.patch('/:id', (req, res) => {
  if (!getPhase(req.params.id)) {
    throw new HttpError(404, `There is no phase ${req.params.id}.`)
  }
  const parsed = updatePhaseSchema.safeParse(req.body)
  if (!parsed.success) throw new HttpError(422, summariseZodError(parsed.error))
  res.json(updatePhase(req.params.id, parsed.data))
})

phasesRouter.post('/:id/move', (req, res) => {
  if (!getPhase(req.params.id)) {
    throw new HttpError(404, `There is no phase ${req.params.id}.`)
  }
  const parsed = moveSchema.safeParse(req.body)
  if (!parsed.success) throw new HttpError(422, summariseZodError(parsed.error))

  const moved = movePhase(req.params.id, parsed.data.direction)
  res.json({ moved, phases: getAllPhases() })
})

phasesRouter.delete('/:id', (req, res) => {
  const id = req.params.id
  if (!getPhase(id)) throw new HttpError(404, `There is no phase ${id}.`)

  const dependents = countPhaseDependents(id)
  refuseIfDependents(`phase ${id}`, [
    { count: dependents.features, one: 'PwC feature', many: 'PwC features' },
    { count: dependents.capabilities, one: 'capability', many: 'capabilities' },
  ])

  const deleted = deletePhase(id)
  return res.json({ deleted, phases: getAllPhases() })
})

// ---------------------------------------------------------------------------
// Assumptions
// ---------------------------------------------------------------------------

export const assumptionsRouter = Router()

assumptionsRouter.post('/', (req, res) => {
  const parsed = createAssumptionSchema.safeParse(req.body)
  if (!parsed.success) throw new HttpError(422, summariseZodError(parsed.error))
  if (!getPwcFeature(parsed.data.pwc_feature_id)) {
    throw new HttpError(422, `There is no feature ${parsed.data.pwc_feature_id}.`)
  }

  const created = appendAssumption(parsed.data.pwc_feature_id, parsed.data.text)
  res.status(201).json({
    assumption: created,
    assumptions: getAssumptionsForFeature(parsed.data.pwc_feature_id),
  })
})

assumptionsRouter.patch('/:id', (req, res) => {
  const id = parseIntId(req.params.id, 'Assumption')
  if (!getAssumption(id)) throw new HttpError(404, `There is no assumption ${id}.`)

  const parsed = updateAssumptionSchema.safeParse(req.body)
  if (!parsed.success) throw new HttpError(422, summariseZodError(parsed.error))
  res.json(updateAssumptionText(id, parsed.data.text))
})

assumptionsRouter.post('/:id/move', (req, res) => {
  const id = parseIntId(req.params.id, 'Assumption')
  const existing = getAssumption(id)
  if (!existing) throw new HttpError(404, `There is no assumption ${id}.`)

  const parsed = moveSchema.safeParse(req.body)
  if (!parsed.success) throw new HttpError(422, summariseZodError(parsed.error))

  const moved = moveAssumption(id, parsed.data.direction)
  res.json({ moved, assumptions: getAssumptionsForFeature(existing.pwc_feature_id) })
})

assumptionsRouter.delete('/:id', (req, res) => {
  const id = parseIntId(req.params.id, 'Assumption')
  const existing = getAssumption(id)
  if (!existing) throw new HttpError(404, `There is no assumption ${id}.`)

  deleteAssumption(id)
  res.json({
    deleted: 1,
    assumptions: getAssumptionsForFeature(existing.pwc_feature_id),
  })
})

// ---------------------------------------------------------------------------
// MVP features
// ---------------------------------------------------------------------------

export const mvpFeaturesRouter = Router()

mvpFeaturesRouter.get('/', (_req, res) => res.json(getAllMvpFeatures()))

mvpFeaturesRouter.post('/', (req, res) => {
  const parsed = createMvpFeatureSchema.safeParse(req.body)
  if (!parsed.success) throw new HttpError(422, summariseZodError(parsed.error))

  // Uniqueness is on (ref, scope_option), so the same ref with a different
  // option is a distinct record, not a duplicate.
  if (findMvpFeature(parsed.data.ref, parsed.data.scope_option)) {
    throw new HttpError(
      409,
      `MVP feature ${parsed.data.ref}${
        parsed.data.scope_option ? ` Option ${parsed.data.scope_option}` : ' (no option)'
      } already exists.`,
    )
  }

  res.status(201).json(createMvpFeature(parsed.data))
})

mvpFeaturesRouter.patch('/:id', (req, res) => {
  const id = parseIntId(req.params.id, 'MVP feature')
  const existing = getMvpFeatureById(id)
  if (!existing) throw new HttpError(404, `There is no MVP feature ${id}.`)

  const parsed = updateMvpFeatureSchema.safeParse(req.body)
  if (!parsed.success) throw new HttpError(422, summariseZodError(parsed.error))

  if (parsed.data.scope_option !== undefined) {
    const clash = findMvpFeature(existing.ref, parsed.data.scope_option)
    if (clash && clash.id !== id) {
      throw new HttpError(
        409,
        `MVP feature ${existing.ref}${
          parsed.data.scope_option ? ` Option ${parsed.data.scope_option}` : ' (no option)'
        } already exists.`,
      )
    }
  }

  res.json(updateMvpFeature(id, parsed.data))
})

mvpFeaturesRouter.delete('/:id', (req, res) => {
  const id = parseIntId(req.params.id, 'MVP feature')
  const existing = getMvpFeatureById(id)
  if (!existing) throw new HttpError(404, `There is no MVP feature ${id}.`)

  const dependents = countMvpFeatureDependents(id)
  refuseIfDependents(`MVP feature ${existing.ref}`, [
    { count: dependents.features, one: 'PwC feature', many: 'PwC features' },
    { count: dependents.capabilities, one: 'capability', many: 'capabilities' },
  ])

  res.json({ deleted: deleteMvpFeature(id) })
})

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

export const capabilitiesRouter = Router()

capabilitiesRouter.get('/', (_req, res) => res.json(getAllCapabilities()))

function assertCapabilityPlacement(releaseId?: string, phaseId?: string): void {
  if (releaseId !== undefined && !getRelease(releaseId)) {
    throw new HttpError(422, `There is no release "${releaseId}".`)
  }
  if (phaseId !== undefined && !getPhase(phaseId)) {
    throw new HttpError(422, `There is no phase "${phaseId}".`)
  }
}

capabilitiesRouter.post('/', (req, res) => {
  const parsed = createCapabilitySchema.safeParse(req.body)
  if (!parsed.success) throw new HttpError(422, summariseZodError(parsed.error))
  assertCapabilityPlacement(parsed.data.release_id, parsed.data.phase_id)

  // Identity is (ref, case-insensitive text) — the same rule the import uses.
  const clash = getAllCapabilities().find(
    (capability) =>
      capability.mvp_ref === parsed.data.mvp_ref &&
      capability.text.toLowerCase() === parsed.data.text.toLowerCase(),
  )
  if (clash) {
    throw new HttpError(
      409,
      `A capability with that text already exists under ref ${parsed.data.mvp_ref}.`,
    )
  }

  // Attach to the ref's single record where there is exactly one; an
  // ambiguous ref is left unattached rather than guessed at (D-3).
  const candidates = getAllMvpFeatures().filter((m) => m.ref === parsed.data.mvp_ref)
  const owner = candidates.length === 1 ? candidates[0].id : null

  res.status(201).json(createCapability({ ...parsed.data, mvp_feature_id: owner }))
})

capabilitiesRouter.patch('/:id', (req, res) => {
  const id = parseIntId(req.params.id, 'Capability')
  if (!getCapabilityById(id)) throw new HttpError(404, `There is no capability ${id}.`)

  const parsed = updateCapabilitySchema.safeParse(req.body)
  if (!parsed.success) throw new HttpError(422, summariseZodError(parsed.error))
  assertCapabilityPlacement(parsed.data.release_id, parsed.data.phase_id)

  const patch: Parameters<typeof updateCapability>[1] = { ...parsed.data }
  // A phase conflict is measured on the source labels, so a hand-moved
  // capability has to carry the label of where it now is. Leaving the
  // document's old label would have it disagreeing with its own phase.
  if (patch.phase_id !== undefined) {
    patch.source_phase_label = getPhase(patch.phase_id)?.name ?? patch.phase_id
  }

  const updated = updateCapability(id, patch)

  if (patch.release_id !== undefined || patch.phase_id !== undefined) {
    // One placement, shared by every feature citing it (PRD §16 P-2), so
    // every one of those links is re-judged.
    recomputeConflictsForCapability(id)
  }

  res.json(updated)
})

capabilitiesRouter.delete('/:id', (req, res) => {
  const id = parseIntId(req.params.id, 'Capability')
  if (!getCapabilityById(id)) throw new HttpError(404, `There is no capability ${id}.`)

  const dependents = countCapabilityDependents(id)
  refuseIfDependents(`capability ${id}`, [
    { count: dependents.features, one: 'PwC feature', many: 'PwC features' },
  ])

  res.json({ deleted: deleteCapability(id) })
})
