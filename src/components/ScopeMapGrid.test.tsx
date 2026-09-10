import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ScopeMapGrid } from '@/components/ScopeMapGrid'
import { buildScopeMap, rowsFor } from '@/lib/scope-derive'
import { buildEdges, connectionDensity } from '@/lib/scope-edges'
import { makeScopeGraph } from '@/test/scope-fixture'

const model = buildScopeMap(makeScopeGraph())

const renderGrid = (zoom = 1) =>
  render(
    <ScopeMapGrid
      model={model}
      rows={rowsFor(model, 'release')}
      view="release"
      zoom={zoom}
    />,
  )

/** Two features sharing ref 938, so there is exactly one edge to draw. */
const sharedModel = buildScopeMap(
  makeScopeGraph({
    featureMvpLinks: [
      { pwc_feature_id: 'F-001', mvp_feature_id: 1, source: 'mapping' },
      { pwc_feature_id: 'F-002', mvp_feature_id: 2, source: 'mapping' },
    ],
  }),
)
const sharedEdges = buildEdges(sharedModel.features)
const sharedDensity = connectionDensity(sharedEdges)

const renderConnected = (props: Partial<Parameters<typeof ScopeMapGrid>[0]> = {}) =>
  render(
    <ScopeMapGrid
      model={sharedModel}
      rows={rowsFor(sharedModel, 'release')}
      view="release"
      zoom={1}
      edges={sharedEdges}
      density={sharedDensity}
      {...props}
    />,
  )

/** The overlay is aria-hidden, so it is queried by test id in the DOM. */
const edgeLines = (container: HTMLElement) =>
  container.querySelectorAll('.scope-edges__line')

describe('ScopeMapGrid — axes', () => {
  it('renders phases across the top, numbered as stages', () => {
    renderGrid()
    const headers = screen.getAllByRole('columnheader')
    // The corner, then one per phase.
    expect(headers).toHaveLength(3)
    expect(headers[1]).toHaveTextContent('Stage 1')
    expect(headers[1]).toHaveTextContent('Access & Onboarding')
    expect(headers[1]).toHaveTextContent('epic 179')
    expect(headers[2]).toHaveTextContent('Manage Vacancies')
    expect(headers[2]).toHaveTextContent('epic 177')
  })

  it('renders one row per release, including ones with no features', () => {
    renderGrid()
    const rows = screen.getAllByRole('rowheader')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Release 1.1')
    // 1.4 has capabilities but no features and must still appear (R-8.5).
    expect(rows[1]).toHaveTextContent('Release 1.4')
  })

  it('counts what each row shows', () => {
    renderGrid()
    const rows = screen.getAllByRole('rowheader')
    expect(rows[0]).toHaveTextContent('2 shown')
    expect(rows[1]).toHaveTextContent('0 shown')
  })
})

describe('ScopeMapGrid — cells', () => {
  it('renders one cell per phase × release', () => {
    renderGrid()
    expect(screen.getAllByRole('cell')).toHaveLength(4)
  })

  it('gives every cell an accessible name naming its counts', () => {
    renderGrid()
    expect(
      screen.getByRole('cell', {
        name: 'Release 1.1, Access & Onboarding: 2 features, 2 capabilities',
      }),
    ).toBeInTheDocument()
  })

  it('keeps an empty cell visible rather than collapsing it', () => {
    renderGrid()
    const empty = screen.getByRole('cell', {
      name: 'Release 1.4, Access & Onboarding: 0 features, 0 capabilities',
    })
    expect(empty).toBeInTheDocument()
    expect(empty).toHaveTextContent('No capability')
  })

  it('says a featureless cell still holds capabilities (R-8.5)', () => {
    renderGrid()
    const cell = screen.getByRole('cell', {
      name: 'Release 1.4, Manage Vacancies: 0 features, 1 capabilities',
    })
    expect(cell).toHaveTextContent('No feature · 1 capability')
  })
})

describe('ScopeMapGrid — feature cards', () => {
  it('renders a card per feature, labelled by id and name', () => {
    renderGrid()
    expect(screen.getByLabelText('F-001 Invite employer')).toBeInTheDocument()
    expect(screen.getByLabelText('F-002 Verify employer')).toBeInTheDocument()
  })

  it('shows MVP chips with the option suffix', () => {
    renderGrid()
    const card = screen.getByLabelText('F-002 Verify employer')
    expect(card).toHaveTextContent('948')
    expect(card).toHaveTextContent('1B')
  })

  it('shows the actor summary with counts', () => {
    renderGrid()
    const card = screen.getByLabelText('F-001 Invite employer')
    expect(card).toHaveTextContent('Employer')
    expect(card).toHaveTextContent('Staff')
  })

  it('badges a real conflict but not one the canonical merge resolves', () => {
    renderGrid()
    expect(screen.getByLabelText('F-002 Verify employer')).toHaveTextContent('2 conflicts')
    expect(screen.getByLabelText('F-001 Invite employer')).not.toHaveTextContent('conflict')
  })

  it('badges an unmatched link', () => {
    renderGrid()
    expect(screen.getByLabelText('F-002 Verify employer')).toHaveTextContent('1 unmatched')
  })

  it('drops secondary detail when zoomed out, keeping the id (R-8.7)', () => {
    renderGrid(0.5)
    const card = screen.getByLabelText('F-001 Invite employer')
    // The card and its ID survive; the name is hidden by the compact modifier.
    expect(card).toHaveClass('feature-card--compact')
    expect(card).toHaveTextContent('F-001')
  })

  it('keeps full detail at default zoom', () => {
    renderGrid(1)
    expect(screen.getByLabelText('F-001 Invite employer')).not.toHaveClass(
      'feature-card--compact',
    )
  })
})

describe('ScopeMapGrid — connection edges (R-8.2)', () => {
  it('draws no edges by default', () => {
    const { container } = renderConnected()
    expect(edgeLines(container)).toHaveLength(0)
  })

  it('draws no edges even when the model has them, until one is focused', () => {
    expect(sharedEdges).toHaveLength(1)
    const { container } = renderConnected()
    expect(container.querySelector('.scope-edges')).toBeNull()
  })

  it('draws the selected feature\'s edges', () => {
    const { container } = renderConnected({ selectedId: 'F-001' })
    expect(edgeLines(container)).toHaveLength(1)
  })

  it('reveals edges on hover as a shortcut', async () => {
    const user = userEvent.setup()
    const { container } = renderConnected()

    await user.hover(screen.getByLabelText('F-001 Invite employer'))
    expect(edgeLines(container)).toHaveLength(1)

    await user.unhover(screen.getByLabelText('F-001 Invite employer'))
    expect(edgeLines(container)).toHaveLength(0)
  })

  it('reveals edges on keyboard focus, not hover alone (R-10.3)', () => {
    const { container } = renderConnected({ onSelect: () => {} })

    const card = screen.getByRole('button', { name: 'F-001 Invite employer' })
    // React's onFocus is delegated from focusin, which bubbles from the
    // button up to the card; act() flushes the resulting render.
    act(() => card.focus())
    expect(edgeLines(container)).toHaveLength(1)

    act(() => card.blur())
    expect(edgeLines(container)).toHaveLength(0)
  })

  it('labels an edge with the shared ref', () => {
    const { container } = renderConnected({ selectedId: 'F-001' })
    expect(container.querySelector('.scope-edges__label-text')?.textContent).toBe('938')
  })

  it('marks a cross-release edge distinctly, by dash pattern not hue alone', () => {
    const crossing = buildScopeMap(
      makeScopeGraph({
        pwcFeatures: [
          {
            id: 'F-001',
            name: 'A',
            foundational_build: '',
            release_id: '1.1',
            phase_id: 'access-and-onboarding',
            source_phase_label: null,
            capability_note: null,
            display_order: 1,
            source: 'mapping',
          },
          {
            id: 'F-002',
            name: 'B',
            foundational_build: '',
            release_id: '1.4',
            phase_id: 'access-and-onboarding',
            source_phase_label: null,
            capability_note: null,
            display_order: 2,
            source: 'mapping',
          },
        ],
        featureMvpLinks: [
          { pwc_feature_id: 'F-001', mvp_feature_id: 1, source: 'mapping' },
          { pwc_feature_id: 'F-002', mvp_feature_id: 2, source: 'mapping' },
        ],
      }),
    )
    const edges = buildEdges(crossing.features)
    const { container } = render(
      <ScopeMapGrid
        model={crossing}
        rows={rowsFor(crossing, 'release')}
        view="release"
        zoom={1}
        edges={edges}
        selectedId="F-001"
      />,
    )

    const line = container.querySelector('.scope-edges__line')
    expect(line).toHaveClass('scope-edges__line--cross-release')
  })

  it('keeps the overlay out of the accessibility tree and out of the way', () => {
    const { container } = renderConnected({ selectedId: 'F-001' })
    const svg = container.querySelector('.scope-edges')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('focusable', 'false')
  })
})

describe('ScopeMapGrid — connection density (R-8.3)', () => {
  it('shows a link count on a connected card', () => {
    renderConnected()
    expect(screen.getByLabelText('F-001 Invite employer')).toHaveTextContent('1 link')
  })

  it('shows nothing on an unconnected card', () => {
    renderGrid()
    expect(screen.getByLabelText('F-001 Invite employer')).not.toHaveTextContent('link')
  })

  it('states the count in words, not by colour alone (R-10.6)', () => {
    renderConnected()
    const card = screen.getByLabelText('F-002 Verify employer')
    expect(card).toHaveTextContent('1 link')
  })
})
