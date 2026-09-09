import type { ErrorRequestHandler, RequestHandler } from 'express'

export class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` })
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = err instanceof HttpError ? err.status : 500
  const message =
    err instanceof HttpError ? err.message : 'Something went wrong on the server.'

  if (status >= 500) console.error('[server] unhandled error:', err)

  res.status(status).json({ error: message })
}
