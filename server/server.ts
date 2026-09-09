import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import express from 'express'

const here = path.dirname(fileURLToPath(import.meta.url))

// Explicit path: the bare `dotenv/config` import reads the CWD (the project
// root), which is the Vite-facing .env, not the server's.
dotenv.config({ path: path.join(here, '.env'), quiet: true })

const app = express()
const PORT = Number(process.env.PORT ?? 3001)

app.use(express.json())

// Serves uploaded files; the directory is created in Step 3.
app.use('/uploads', express.static(path.join(here, 'uploads')))

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() })
})

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`)
})
