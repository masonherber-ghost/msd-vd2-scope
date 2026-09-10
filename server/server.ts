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
const { scopeRouter } = await import('./routes/scope.js')
const { importRouter } = await import('./routes/import.js')
const { featuresRouter } = await import('./routes/features.js')
const {
  assumptionsRouter,
  capabilitiesRouter,
  mvpFeaturesRouter,
  phasesRouter,
  releasesRouter,
} = await import('./routes/entities.js')
const { conflictsRouter } = await import('./routes/conflicts.js')
const { errorHandler, notFoundHandler } = await import('./middleware/error-handler.js')
const { isScopeEmpty } = await import('./repositories/scope-repository.js')
const { importScopeFromSources } = await import('./services/importer.js')
const { findCountDrift, loadScopeFromSources } = await import('./services/scope-source.js')

runMigrations()

/**
 * Logs the reconciliation summary and refuses to serve a drifted graph
 * (R-11.3). The first boot seeds the database; later boots only verify, so
 * re-import stays an explicit action (R-11.4).
 */
function checkAndSeedScope(): void {
  const reconciled = loadScopeFromSources()
  const drift = findCountDrift(reconciled)
  const s = reconciled.summary

  console.log(
    `[scope] ${s.releases} releases · ${s.phases} phases · ${s.pwcFeatures} features · ` +
      `${s.assumptions} assumptions · ${s.mvpRecords} MVP records (${s.mvpRefs} refs) · ` +
      `${s.capabilities} capabilities`,
  )
  console.log(
    `[scope] links: ${s.featureMvpLinks} feature→MVP, ${s.featureCapabilityLinks} feature→capability`,
  )
  console.log(
    `[scope] conflicts: ${s.releaseConflicts} release, ${s.phaseConflicts} phase ` +
      `(${s.phaseConflictsAfterMerge} after the canonical merge), ${s.unmatchedLinks} unmatched`,
  )

  if (drift.length > 0) {
    for (const d of drift) {
      console.error(`[scope] DRIFT ${d.key}: got ${d.actual}, expected ${d.expected}`)
    }
    throw new Error(
      `Boot check failed — the source documents no longer reconcile to the expected counts (${drift.length} drifted).`,
    )
  }

  if (isScopeEmpty()) {
    const summary = importScopeFromSources()
    console.log(
      `[scope] first run — imported ${summary.pwcFeatures} features, ` +
        `${summary.capabilities} capabilities, ${summary.featureCapabilityEdges} edges ` +
        `(${summary.featureCapabilityCitations} citations)`,
    )
    if (summary.removedReleases.length > 0) {
      console.log(`[scope] dropped stale releases: ${summary.removedReleases.join(', ')}`)
    }
    for (const stale of summary.retainedStaleReleases) {
      console.warn(
        `[scope] release ${stale.id} is no longer in the sources but still has ` +
          `${stale.features} feature(s) and ${stale.capabilities} capability(ies) — kept`,
      )
    }
  } else {
    console.log('[scope] database already populated — POST /api/import to re-import')
  }
}

checkAndSeedScope()

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

app.use('/api/scope', scopeRouter)
app.use('/api/import', importRouter)
app.use('/api/features', featuresRouter)
app.use('/api/releases', releasesRouter)
app.use('/api/phases', phasesRouter)
app.use('/api/assumptions', assumptionsRouter)
app.use('/api/mvp-features', mvpFeaturesRouter)
app.use('/api/capabilities', capabilitiesRouter)
app.use('/api/conflicts', conflictsRouter)

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
