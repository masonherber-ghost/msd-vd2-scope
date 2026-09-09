import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ScopeMapGrid } from '@/components/ScopeMapGrid'
import { buildScopeMap } from '@/lib/scope-derive'
import { makeScopeGraph } from '@/test/scope-fixture'

const model = buildScopeMap(makeScopeGraph())

const renderGrid = (zoom = 1) => render(<ScopeMapGrid model={model} zoom={zoom} />)

describe('ScopeMapGrid — axes', () => {
  it('renders one column header per release, including ones with no features', () => {
    renderGrid()
    expect(screen.getByText('Release 1.1')).toBeInTheDocument()
    // 1.4 has capabilities but no features and must still appear (R-8.5).
    expect(screen.getByText('Release 1.4')).toBeInTheDocument()
  })

  it('renders phases in canonical order with their epic refs', () => {
    renderGrid()
    const headers = screen.getAllByRole('rowheader')
    expect(headers).toHaveLength(2)
    expect(headers[0]).toHaveTextContent('Access & Onboarding')
    expect(headers[0]).toHaveTextContent('epic 179')
    expect(headers[1]).toHaveTextContent('Manage Vacancies')
    expect(headers[1]).toHaveTextContent('epic 177')
  })

  it('summarises features and capabilities per release in the header', () => {
    renderGrid()
    expect(screen.getByText(/2 features · 2 capabilities/)).toBeInTheDocument()
    expect(screen.getByText(/0 features · 1 capability/)).toBeInTheDocument()
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
        name: 'Access & Onboarding, Release 1.1: 2 features, 2 capabilities',
      }),
    ).toBeInTheDocument()
  })

  it('keeps an empty cell visible rather than collapsing it', () => {
    renderGrid()
    const empty = screen.getByRole('cell', {
      name: 'Access & Onboarding, Release 1.4: 0 features, 0 capabilities',
    })
    expect(empty).toBeInTheDocument()
    expect(empty).toHaveTextContent('no features')
  })

  it('says a featureless cell still holds capabilities (R-8.5)', () => {
    renderGrid()
    const cell = screen.getByRole('cell', {
      name: 'Manage Vacancies, Release 1.4: 0 features, 1 capabilities',
    })
    expect(cell).toHaveTextContent('no features · 1 capability')
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
