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

describe('CapabilityDetailPanel — opening what it links to', () => {
  it('leaves the MSD feature as plain text with no handler', () => {
    renderPanel()
    expect(
      screen.queryByRole('button', { name: /Verification methods/ }),
    ).not.toBeInTheDocument()
  })

  it('opens the MSD feature that owns it', async () => {
    const user = userEvent.setup()
    const onSelectMvpFeature = vi.fn()
    renderPanel({ onSelectMvpFeature })

    await user.click(screen.getByRole('button', { name: /Verification methods/ }))

    expect(onSelectMvpFeature).toHaveBeenCalledWith(card.mvpFeature!.id)
  })

  it('opens a citing PwC feature', async () => {
    const user = userEvent.setup()
    const onSelectFeature = vi.fn()
    renderPanel({ onSelectFeature })

    await user.click(screen.getByRole('button', { name: /F-002/ }))

    expect(onSelectFeature).toHaveBeenCalledWith('F-002')
  })
})

describe('CapabilityDetailPanel — deleting', () => {
  it('offers no delete without a handler', () => {
    renderPanel()
    expect(
      screen.queryByRole('button', { name: 'Delete this capability' }),
    ).not.toBeInTheDocument()
  })

  it('names the citations that go with it before deleting anything', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn().mockResolvedValue(undefined)
    renderPanel({ onDelete })

    await user.click(screen.getByRole('button', { name: 'Delete this capability' }))

    expect(screen.getByText(/removes the citation from F-002/)).toBeInTheDocument()
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('cascades when something cites it, because the citations must go too', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn().mockResolvedValue(undefined)
    renderPanel({ onDelete })

    await user.click(screen.getByRole('button', { name: 'Delete this capability' }))
    await user.click(
      screen.getByRole('button', { name: 'Delete and remove those citations' }),
    )

    expect(onDelete).toHaveBeenCalledWith(true)
  })

  it('does not cascade when nothing cites it', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn().mockResolvedValue(undefined)
    renderPanel({ card: { ...card, pwcFeatures: [] }, onDelete })

    await user.click(screen.getByRole('button', { name: 'Delete this capability' }))
    expect(screen.getByText(/Nothing cites it/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delete it' }))

    expect(onDelete).toHaveBeenCalledWith(false)
  })

  it('surfaces the server’s refusal in place', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn().mockRejectedValue(new Error('Cannot delete capability 12.'))
    renderPanel({ onDelete })

    await user.click(screen.getByRole('button', { name: 'Delete this capability' }))
    await user.click(
      screen.getByRole('button', { name: 'Delete and remove those citations' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Cannot delete capability 12.',
    )
  })

  it('abandons a pending confirmation when another capability arrives', async () => {
    const user = userEvent.setup()
    const { rerender } = renderPanel({ onDelete: vi.fn() })

    await user.click(screen.getByRole('button', { name: 'Delete this capability' }))
    rerender(
      <CapabilityDetailPanel
        card={cards.find((c) => c.id !== card.id)!}
        onClose={vi.fn()}
        releaseLabels={releaseLabels}
        phaseNames={phaseNames}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Delete this capability' })).toBeInTheDocument()
  })
})

describe('CapabilityDetailPanel — keyboard and announcement (WCAG 2.4.3, 4.1.3)', () => {
  it('reaches and opens the confirmation from the keyboard alone', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn().mockResolvedValue(undefined)
    renderPanel({ onDelete })

    const trigger = screen.getByRole('button', { name: 'Delete this capability' })
    trigger.focus()
    await user.keyboard('{Enter}')

    expect(
      screen.getByRole('button', { name: 'Delete and remove those citations' }),
    ).toBeInTheDocument()
  })

  it('keeps focus inside the panel when the confirmation replaces the button', async () => {
    const user = userEvent.setup()
    renderPanel({ onDelete: vi.fn() })

    await user.click(screen.getByRole('button', { name: 'Delete this capability' }))

    // The control that had focus is removed from the DOM. Unless focus is
    // moved somewhere deliberate, it falls to <body> and a keyboard user has
    // to tab from the top of the document to reach the confirmation they
    // just asked for.
    const panel = screen.getByRole('complementary', { name: /^Capability:/ })
    expect(document.activeElement).not.toBe(document.body)
    expect(panel.contains(document.activeElement)).toBe(true)
  })

  it('returns focus to the delete control when the confirmation is cancelled', async () => {
    const user = userEvent.setup()
    renderPanel({ onDelete: vi.fn() })

    await user.click(screen.getByRole('button', { name: 'Delete this capability' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByRole('button', { name: 'Delete this capability' })).toHaveFocus()
  })
})

describe('CapabilityDetailPanel — while the delete is in flight', () => {
  it('shows it is working and cannot be submitted twice', async () => {
    const user = userEvent.setup()
    let release: (() => void) | undefined
    const onDelete = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = () => resolve()
        }),
    )
    renderPanel({ onDelete })

    await user.click(screen.getByRole('button', { name: 'Delete this capability' }))
    await user.click(
      screen.getByRole('button', { name: 'Delete and remove those citations' }),
    )

    const pending = screen.getByRole('button', { name: 'Deleting…' })
    expect(pending).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await user.click(pending)
    expect(onDelete).toHaveBeenCalledTimes(1)

    release?.()
  })
})
