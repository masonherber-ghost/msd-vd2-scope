import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CapabilityDetailPanel } from '@/components/CapabilityDetailPanel'
import { buildCapabilityCards } from '@/lib/capability-derive'
import { makeScopeGraph } from '@/test/scope-fixture'

const graph = makeScopeGraph()
const cards = buildCapabilityCards(graph)
const card = cards.find((c) => c.id === 12)!

const releaseLabels = new Map(graph.releases.map((r) => [r.id, r.label]))
const phaseNames = new Map(graph.phases.map((p) => [p.id, p.name]))

function renderPanel(props: Partial<Parameters<typeof CapabilityDetailPanel>[0]> = {}) {
  return render(
    <CapabilityDetailPanel
      card={card}
      onClose={vi.fn()}
      releaseLabels={releaseLabels}
      phaseNames={phaseNames}
      {...props}
    />,
  )
}

describe('CapabilityDetailPanel — what it shows', () => {
  it('names the capability, its actor and its placement', () => {
    renderPanel()
    expect(screen.getByText('Capability · Employer')).toBeInTheDocument()
    expect(screen.getByText('Release 1.4 · Manage Vacancies')).toBeInTheDocument()
  })

  it('names the MSD feature it sits under', () => {
    renderPanel()
    expect(screen.getByText('948 · 1B')).toBeInTheDocument()
    expect(screen.getByText('Verification methods')).toBeInTheDocument()
  })

  it('lists the PwC features citing it', () => {
    renderPanel()
    expect(screen.getByText('PwC features citing this (1)')).toBeInTheDocument()
    expect(screen.getByText('F-002')).toBeInTheDocument()
  })

  it('flags a citing feature whose release differs from the capability’s', () => {
    renderPanel()
    expect(screen.getByText(/differs from this capability/)).toBeInTheDocument()
  })
})

describe('CapabilityDetailPanel — editing the text', () => {
  it('renders a plain heading when no save handler is given', () => {
    renderPanel()
    const heading = screen.getByRole('heading', { name: 'Electronic T&Cs acceptance' })
    expect(heading).toHaveClass('capability-detail__name')
    expect(
      within(heading).queryByRole('button', { name: /^Edit capability text/ }),
    ).not.toBeInTheDocument()
  })

  it('makes the heading the control when one is', () => {
    renderPanel({ onSaveText: vi.fn().mockResolvedValue(undefined) })
    const trigger = screen.getByRole('button', {
      name: 'Edit capability text: Electronic T&Cs acceptance',
    })
    // The title is the control; there is no second Edit button beside it.
    expect(trigger.closest('h2')).toHaveClass('capability-detail__name')
    expect(
      screen.queryByRole('button', { name: 'Edit capability text' }),
    ).not.toBeInTheDocument()
  })

  it('passes the trimmed text to the handler', async () => {
    const user = userEvent.setup()
    const onSaveText = vi.fn().mockResolvedValue(undefined)
    renderPanel({ onSaveText })

    await user.click(screen.getByRole('button', { name: /^Edit capability text:/ }))
    const input = screen.getByLabelText('Capability text')
    await user.clear(input)
    await user.type(input, '  Accept terms electronically  ')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSaveText).toHaveBeenCalledWith('Accept terms electronically')
  })

  it('does not call the handler when nothing changed', async () => {
    const user = userEvent.setup()
    const onSaveText = vi.fn().mockResolvedValue(undefined)
    renderPanel({ onSaveText })

    await user.click(screen.getByRole('button', { name: /^Edit capability text:/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSaveText).not.toHaveBeenCalled()
  })

  it('reports an edit in progress, so navigation can warn', async () => {
    const user = userEvent.setup()
    const onDirtyChange = vi.fn()
    renderPanel({ onSaveText: vi.fn().mockResolvedValue(undefined), onDirtyChange })

    await user.click(screen.getByRole('button', { name: /^Edit capability text:/ }))
    await user.type(screen.getByLabelText('Capability text'), '!')

    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
  })
})

describe('CapabilityDetailPanel — questions', () => {
  const withQuestion = { ...card, question: 'Is this in or out of R1.1?' }

  it('offers nothing when the panel has no question handler', () => {
    renderPanel()
    expect(screen.queryByRole('button', { name: 'Add a question' })).not.toBeInTheDocument()
  })

  it('offers to add one when it has', () => {
    renderPanel({ onSaveQuestion: vi.fn().mockResolvedValue(undefined) })
    expect(screen.getByRole('button', { name: 'Add a question' })).toBeInTheDocument()
  })

  it('shows an existing question as a warning, like a conflict', () => {
    renderPanel({ card: withQuestion })
    const note = screen.getByRole('note')
    expect(note).toHaveTextContent('Question: Is this in or out of R1.1?')
    expect(note).toHaveClass('capability-detail__question')
  })

  it('saves a question', async () => {
    const user = userEvent.setup()
    const onSaveQuestion = vi.fn().mockResolvedValue(undefined)
    renderPanel({ onSaveQuestion })

    await user.click(screen.getByRole('button', { name: 'Add a question' }))
    await user.type(screen.getByLabelText('Question'), 'Who owns this?')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSaveQuestion).toHaveBeenCalledWith('Who owns this?')
  })

  it('offers to edit rather than add once one exists', () => {
    renderPanel({ card: withQuestion, onSaveQuestion: vi.fn() })
    expect(screen.getByRole('button', { name: 'Edit question' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add a question' })).not.toBeInTheDocument()
  })

  it('clears the question when the text is emptied, rather than storing a blank', async () => {
    const user = userEvent.setup()
    const onSaveQuestion = vi.fn().mockResolvedValue(undefined)
    renderPanel({ card: withQuestion, onSaveQuestion })

    await user.click(screen.getByRole('button', { name: 'Edit question' }))
    await user.clear(screen.getByLabelText('Question'))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSaveQuestion).toHaveBeenCalledWith(null)
  })
})
