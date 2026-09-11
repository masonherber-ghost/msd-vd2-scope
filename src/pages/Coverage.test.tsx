import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScopeGraph } from '@/lib/api-client'

const { state } = await vi.hoisted(async () => ({
  state: { graph: null as ScopeGraph | null, fail: null as string | null },
}))

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>()
  return {
    ...actual,
    apiClient: {
      scope: {
        get: async () => {
          if (state.fail) throw new actual.ApiError(0, state.fail)
          return state.graph as ScopeGraph
        },
      },
    },
  }
})

const { makeScopeGraph } = await import('@/test/scope-fixture')
const Coverage = (await import('@/pages/Coverage')).default

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <Coverage />
    </QueryClientProvider>,
  )
}

const section = (name: RegExp) => screen.getByRole('region', { name })

beforeEach(() => {
  state.fail = null
  state.graph = makeScopeGraph({
    featureMvpLinks: [
      { pwc_feature_id: 'F-001', mvp_feature_id: 1, source: 'mapping' },
      { pwc_feature_id: 'F-002', mvp_feature_id: 3, source: 'mapping' },
    ],
  })
})

describe('Coverage', () => {
  it('ranks MVP features by citing feature count', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByRole('table', { name: /ranked by citing features/i })).toBeInTheDocument(),
    )
    const rows = within(
      screen.getByRole('table', { name: /ranked by citing features/i }),
    ).getAllByRole('row')
    expect(rows).toHaveLength(3)
  })

  it('states when nothing spans a release boundary', async () => {
    renderPage()
    await waitFor(() => expect(section(/spanning more than one release/i)).toBeInTheDocument())
    expect(section(/spanning more than one release/i)).toHaveTextContent(
      /every MVP feature sits inside one release/i,
    )
  })

  it('lists a cross-release MVP feature when there is one', async () => {
    state.graph = makeScopeGraph({
      pwcFeatures: makeScopeGraph().pwcFeatures.map((f) =>
        f.id === 'F-002' ? { ...f, release_id: '1.4' } : f,
      ),
      featureMvpLinks: [
        { pwc_feature_id: 'F-001', mvp_feature_id: 1, source: 'mapping' },
        { pwc_feature_id: 'F-002', mvp_feature_id: 2, source: 'mapping' },
      ],
    })
    renderPage()
    await waitFor(() => expect(section(/spanning more than one release/i)).toBeInTheDocument())
    expect(section(/spanning more than one release/i)).toHaveTextContent('938 · 1.1 + 1.4')
  })

  it('reports orphans in both directions', async () => {
    renderPage()
    await waitFor(() => expect(section(/^Orphans/)).toBeInTheDocument())
    const orphans = section(/^Orphans/)
    expect(orphans).toHaveTextContent(/MVP features with no capabilities/i)
    expect(orphans).toHaveTextContent(/MVP features no PwC feature cites/i)
    expect(orphans).toHaveTextContent(/PwC features with no capabilities/i)
  })

  it('breaks capabilities down by actor per release (R-8.24)', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByRole('table', { name: /actor breakdown per release/i })).toBeInTheDocument(),
    )
    const table = screen.getByRole('table', { name: /actor breakdown per release/i })
    expect(table).toHaveTextContent('employer 1')
    expect(table).toHaveTextContent('staff 1')
  })

  it('flags near-duplicate capabilities rather than merging them (D-4)', async () => {
    state.graph = makeScopeGraph({
      capabilities: [
        {
          id: 1,
          mvp_feature_id: null,
          mvp_ref: 941,
          mvp_owner_ambiguous: 0,
          text: 'View authenticated landing page',
          actor: 'employer',
          release_id: '1.1',
          phase_id: 'access-and-onboarding',
          source_phase_label: null,
          question: null,
          source: 'sequencing',
        },
        {
          id: 2,
          mvp_feature_id: null,
          mvp_ref: 941,
          mvp_owner_ambiguous: 0,
          text: 'View authenticated landing page / dashboard',
          actor: 'employer',
          release_id: '1.1',
          phase_id: 'access-and-onboarding',
          source_phase_label: null,
          question: null,
          source: 'sequencing',
        },
      ],
      featureCapabilityLinks: [],
    })
    renderPage()
    await waitFor(() => expect(section(/near-duplicate capabilities/i)).toBeInTheDocument())

    const duplicates = section(/near-duplicate capabilities/i)
    // Both texts survive — flagged, not merged.
    expect(duplicates).toHaveTextContent('View authenticated landing page')
    expect(duplicates).toHaveTextContent('View authenticated landing page / dashboard')
    expect(duplicates).toHaveTextContent(/probably a truncation/i)
  })

  it('surfaces a friendly error and offers a retry', async () => {
    state.fail = 'Cannot reach the server. Check that it is running, then try again.'
    renderPage()
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })
})
