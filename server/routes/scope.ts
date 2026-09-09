import { Router } from 'express'
import { getScopeGraph } from '../repositories/scope-repository.js'

export const scopeRouter = Router()

// Synchronous handler — `throw` is safe here and reaches the error middleware.
scopeRouter.get('/', (_req, res) => {
  res.json(getScopeGraph())
})
