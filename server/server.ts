import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import helmet from 'helmet'

const here = path.dirname(fileURLToPath(import.meta.url))

// Explicit path: the bare `dotenv/config` import reads the CWD (the project
// root), which is the Vite-facing .env, not the server's.
dotenv.config({ path: path.join(here, '.env'), quiet: true })

// Imported dynamically, after dotenv: database.ts reads DB_PATH at module
// load, and a static import would be hoisted above the config() call above.
const { runMigrations } = await import('./migrate.js')
const { notesRouter } = await import('./routes/notes.js')
const { errorHandler, notFoundHandler } = await import('./middleware/error-handler.js')

runMigrations()

const app = express()
const PORT = Number(process.env.PORT ?? 3001)
const CLIENT_URL = process.env.CLIENT_URL ?? 'http://localhost:5173'

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
app.use(cors({ origin: CLIENT_URL }))
app.use(express.json())

const UPLOADS_DIR = path.join(here, 'uploads')
fs.mkdirSync(UPLOADS_DIR, { recursive: true })
app.use('/uploads', express.static(UPLOADS_DIR))

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() })
})

app.use('/api/notes', notesRouter)

app.use('/api', notFoundHandler)

// Production: serve the built SPA and hand every non-API path to index.html
// so a refresh on a client-side route works. In dev, Vite serves the client.
if (process.env.NODE_ENV === 'production') {
  const DIST_DIR = path.join(here, '..', 'dist')
  app.use(express.static(DIST_DIR))
  // Express 5 uses path-to-regexp v8: a bare '*' is invalid and throws at
  // registration. The wildcard must be named.
  app.get('/*splat', (_req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'))
  })
}

app.use(errorHandler)

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`)
  console.log(`[server] CORS origin: ${CLIENT_URL}`)
})
