import { Router } from 'express'
import { HttpError } from '../middleware/error-handler.js'
import { ImportDriftError, importScopeFromSources } from '../services/importer.js'
import { ParseError } from '../services/scope-types.js'

export const importRouter = Router()

/**
 * Re-import is an explicit action, never automatic on boot after the first
 * run (R-11.4). Additive and non-destructive.
 */
importRouter.post('/', (_req, res) => {
  try {
    res.json({ status: 'ok', summary: importScopeFromSources() })
  } catch (error) {
    if (error instanceof ParseError) {
      throw new HttpError(
        422,
        `A source document could not be parsed. ${error.message}`,
      )
    }
    if (error instanceof ImportDriftError) {
      throw new HttpError(409, error.message)
    }
    throw error
  }
})
