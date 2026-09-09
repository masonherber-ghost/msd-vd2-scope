import { Router } from 'express'
import { createNote, getAllNotes } from '../repositories/notes-repository.js'
import { HttpError } from '../middleware/error-handler.js'

export const notesRouter = Router()

// Synchronous handler — `throw` is safe here and reaches the error middleware.
notesRouter.get('/', (_req, res) => {
  res.json(getAllNotes())
})

notesRouter.post('/', (req, res) => {
  const raw: unknown = (req.body as { text?: unknown } | undefined)?.text
  const text = typeof raw === 'string' ? raw.trim() : ''

  if (!text) throw new HttpError(400, 'A note needs some text.')
  if (text.length > 500) throw new HttpError(400, 'A note must be 500 characters or fewer.')

  res.status(201).json(createNote(text))
})
