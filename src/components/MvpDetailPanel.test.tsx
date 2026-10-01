import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MvpDetailPanel } from '@/components/MvpDetailPanel'
import { buildMvpCards } from '@/lib/mvp-derive'
import { makeScopeGraph } from '@/test/scope-fixture'

const graph = makeScopeGraph()
const cards = buildMvpCards(graph)
// Ref 938's bare record — it owns the two capabilities the ref carries.
const card = cards.find((c) => c.id === 2)!

const releaseLabels = new Map(graph.releases.map((r) => [r.id, r.label]))
const phaseNames = new Map(graph.phases.map((p) => [p.id, p.name]))

const capabilityOptions = graph.capabilities.map((capability) => ({
  id: capability.id,
  label: capability.text,
  hint: `${capability.mvp_ref} · ${capability.actor}`,
  related: capability.mvp_ref === card.ref,
}))

function renderPanel(props: Partial<Parameters<typeof MvpDetailPanel>[0]> = {}) {
  return render(
    <MvpDetailPanel
      card={card}
      onClose={vi.fn()}
      releaseLabels={releaseLabels}
      phaseNames={phaseNames}
      {...props}
    />,
  )
}

const editable = (onSetCapabilities = vi.fn().mockResolvedValue(undefined)) => ({
  capabilityOptions,
  ownedCapabilityIds: card.capabilities.map((c) => c.id),
  onSetCapabilities,
})

const releaseOptions = graph.releases.map((r) => ({ value: r.id, label: r.label }))
const phaseOptions = graph.phases.map((p) => ({ value: p.id, label: p.name }))

const placeable = (onSetStatedPlacement = vi.fn().mockResolvedValue(undefined)) => ({
  releaseOptions,
  phaseOptions,
  onSetStatedPlacement,
})

describe('MvpDetailPanel — renaming the record', () => {
  it('renders a plain heading when there is no save handler', () => {
    renderPanel()
    const heading = screen.getByRole('heading', { name: 'Additional users' })
    expect(heading).toHaveClass('mvp-detail__name')
  })

  it('makes the title itself the control when there is', () => {
    renderPanel({ onSaveTitle: vi.fn().mockResolvedValue(undefined) })
    const trigger = screen.getByRole('button', {
      name: 'Edit msd feature title: Additional users',
    })
    // No second Edit button beside it — the title is the thing you click.
    expect(trigger.closest('h2')).toHaveClass('mvp-detail__name')
  })

  it('passes the trimmed title to the handler', async () => {
    const user = userEvent.setup()
    const onSaveTitle = vi.fn().mockResolvedValue(undefined)
    renderPanel({ onSaveTitle })

    await user.click(screen.getByRole('button', { name: /^Edit msd feature title:/ }))
    const input = screen.getByLabelText('MSD feature title')
    await user.clear(input)
    await user.type(input, '  Additional portal users  ')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSaveTitle).toHaveBeenCalledWith('Additional portal users')
  })

  it('does not call the handler when nothing changed', async () => {
    const user = userEvent.setup()
    const onSaveTitle = vi.fn().mockResolvedValue(undefined)
    renderPanel({ onSaveTitle })

    await user.click(screen.getByRole('button', { name: /^Edit msd feature title:/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSaveTitle).not.toHaveBeenCalled()
  })

  it('reports an edit in progress, so navigation can warn', async () => {
    const user = userEvent.setup()
    const onDirtyChange = vi.fn()
    renderPanel({ onSaveTitle: vi.fn().mockResolvedValue(undefined), onDirtyChange })

    await user.click(screen.getByRole('button', { name: /^Edit msd feature title:/ }))
    await user.type(screen.getByLabelText('MSD feature title'), '!')

    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
  })

  it('keeps the typing and surfaces the server’s refusal when a save fails', async () => {
    const user = userEvent.setup()
    const onSaveTitle = vi
      .fn()
      .mockRejectedValue(new Error('Give the MVP feature a title.'))
    renderPanel({ onSaveTitle })

    await user.click(screen.getByRole('button', { name: /^Edit msd feature title:/ }))
    const input = screen.getByLabelText('MSD feature title')
    await user.clear(input)
    await user.type(input, 'Renamed')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Give the MVP feature a title.',
    )
    expect(screen.getByLabelText('MSD feature title')).toHaveValue('Renamed')
  })
})

describe('MvpDetailPanel — placing the record', () => {
  it('offers nothing without a placement handler', () => {
    renderPanel()
    expect(screen.queryByRole('button', { name: 'Edit package' })).not.toBeInTheDocument()
  })

  it('offers a release and a stage on any record', () => {
    // Including one that owns no capability: the record's own placement is
    // the only thing that can reach those.
    renderPanel(placeable())
    expect(screen.getByRole('button', { name: 'Edit package' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit stage' })).toBeInTheDocument()
  })

  it('shows "Not stated" until someone places it', () => {
    renderPanel(placeable())
    expect(screen.getAllByText('Not stated').length).toBeGreaterThan(0)
  })

  it('shows the placement stated on the record, not where its capabilities are', () => {
    // The fixture's capabilities sit in 1.1; the statement says 1.4. The
    // statement is what places the card, so it is what the field shows.
    renderPanel({
      ...placeable(),
      card: {
        ...card,
        stated: { releaseId: '1.4', phaseId: 'manage-vacancies' },
      },
    })
    expect(screen.getByText('Package 1.4')).toBeInTheDocument()
    expect(screen.getByText('Manage Vacancies')).toBeInTheDocument()
  })

  it('places the record by writing its own release', async () => {
    const user = userEvent.setup()
    const onSetStatedPlacement = vi.fn().mockResolvedValue(undefined)
    renderPanel(placeable(onSetStatedPlacement))

    await user.click(screen.getByRole('button', { name: 'Edit package' }))
    await user.selectOptions(screen.getByLabelText('Package'), '1.4')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(onSetStatedPlacement).toHaveBeenCalledWith({ release_id: '1.4' }),
    )
  })

  it('sets the stage without touching the release', async () => {
    const user = userEvent.setup()
    const onSetStatedPlacement = vi.fn().mockResolvedValue(undefined)
    renderPanel(placeable(onSetStatedPlacement))

    await user.click(screen.getByRole('button', { name: 'Edit stage' }))
    await user.selectOptions(screen.getByLabelText('Stage'), 'manage-vacancies')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(onSetStatedPlacement).toHaveBeenCalledWith({ phase_id: 'manage-vacancies' }),
    )
  })

  it('hands the record back to the sources when set to "Not stated"', async () => {
    const user = userEvent.setup()
    const onSetStatedPlacement = vi.fn().mockResolvedValue(undefined)
    renderPanel({
      ...placeable(onSetStatedPlacement),
      card: { ...card, stated: { releaseId: '1.4', phaseId: null } },
    })

    await user.click(screen.getByRole('button', { name: 'Edit package' }))
    await user.selectOptions(screen.getByLabelText('Package'), '')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    // Null, not an empty string — an empty string would be a placement
    // pointing at nothing.
    await waitFor(() =>
      expect(onSetStatedPlacement).toHaveBeenCalledWith({ release_id: null }),
    )
  })

  it('says half a statement places nothing', async () => {
    renderPanel({
      ...placeable(),
      card: { ...card, stated: { releaseId: '1.4', phaseId: null } },
    })
    expect(screen.getByText(/Set the stage too/)).toBeInTheDocument()
  })

  it('says a stated placement outranks the derived ones', () => {
    renderPanel({
      ...placeable(),
      card: {
        ...card,
        placement: 'stated' as const,
        stated: { releaseId: '1.4', phaseId: 'manage-vacancies' },
      },
    })
    expect(
      screen.getByText(/outranks where its capabilities and citing features are/),
    ).toBeInTheDocument()
  })

  it('surfaces the server’s refusal in place', async () => {
    const user = userEvent.setup()
    const onSetStatedPlacement = vi
      .fn()
      .mockRejectedValue(new Error('There is no release "9.9".'))
    renderPanel(placeable(onSetStatedPlacement))

    await user.click(screen.getByRole('button', { name: 'Edit package' }))
    await user.selectOptions(screen.getByLabelText('Package'), '1.4')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('There is no release "9.9".')
  })

  it('no longer offers a separate control for moving its capabilities', () => {
    // Capabilities follow the record now; a control that moved them apart
    // would put the two back out of step.
    renderPanel(placeable())
    expect(screen.queryByText(/Where its capabilities sit/i)).not.toBeInTheDocument()
  })
})

describe('MvpDetailPanel — capabilities it owns', () => {
  it('lists them as plain text when there is no edit handler', () => {
    renderPanel()
    expect(screen.getByText('Capabilities (2)')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Change capabilities' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Invite employer to register' }),
    ).not.toBeInTheDocument()
  })

  it('offers the editor when it has one', () => {
    renderPanel(editable())
    expect(screen.getByRole('button', { name: 'Change capabilities' })).toBeInTheDocument()
    // Closed until asked for, so the panel reads as the record.
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  it('offers to assign rather than change when it owns none', () => {
    renderPanel({
      ...editable(),
      card: { ...card, capabilities: [] },
      ownedCapabilityIds: [],
    })
    expect(screen.getByRole('button', { name: 'Assign capabilities' })).toBeInTheDocument()
  })

  it('opens the lookup by tapping the capability that is there', async () => {
    const user = userEvent.setup()
    renderPanel(editable())

    await user.click(screen.getByRole('button', { name: 'Invite employer to register' }))

    expect(screen.getByRole('group', { name: /Capabilities owned by SVD-938/ })).toBeInTheDocument()
  })

  it('sends the complete new set when one is ticked', async () => {
    const user = userEvent.setup()
    const onSetCapabilities = vi.fn().mockResolvedValue(undefined)
    renderPanel(editable(onSetCapabilities))

    await user.click(screen.getByRole('button', { name: 'Change capabilities' }))
    await user.click(screen.getByRole('checkbox', { name: /Electronic T&Cs acceptance/ }))

    expect(onSetCapabilities).toHaveBeenCalledWith([10, 11, 12])
  })

  it('sends the set without the one unticked', async () => {
    const user = userEvent.setup()
    const onSetCapabilities = vi.fn().mockResolvedValue(undefined)
    renderPanel(editable(onSetCapabilities))

    await user.click(screen.getByRole('button', { name: 'Change capabilities' }))
    await user.click(screen.getByRole('checkbox', { name: /Invite employer to register/ }))

    expect(onSetCapabilities).toHaveBeenCalledWith([11])
  })

  it('says what unticking does, since an unowned capability leaves this view', async () => {
    const user = userEvent.setup()
    renderPanel(editable())

    await user.click(screen.getByRole('button', { name: 'Change capabilities' }))

    expect(screen.getByText(/no MSD feature until another record claims it/)).toBeInTheDocument()
  })

  it('surfaces the server’s refusal in place', async () => {
    const user = userEvent.setup()
    const onSetCapabilities = vi.fn().mockRejectedValue(new Error('No capability with id 12.'))
    renderPanel(editable(onSetCapabilities))

    await user.click(screen.getByRole('button', { name: 'Change capabilities' }))
    await user.click(screen.getByRole('checkbox', { name: /Electronic T&Cs acceptance/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No capability with id 12.')
  })

  it('stays open when a second listed capability is tapped', async () => {
    const user = userEvent.setup()
    renderPanel(editable())

    await user.click(screen.getByRole('button', { name: 'Invite employer to register' }))
    await user.click(screen.getByRole('button', { name: 'Receive secure email invite' }))

    // Every row points at the same editor, so a second tap must not shut it.
    expect(screen.getByRole('searchbox')).toBeInTheDocument()
  })

  it('returns focus to the trigger when the lookup is dismissed', async () => {
    const user = userEvent.setup()
    renderPanel(editable())

    await user.click(screen.getByRole('button', { name: 'Change capabilities' }))
    await user.click(screen.getByRole('button', { name: 'Done' }))

    expect(screen.getByRole('button', { name: 'Change capabilities' })).toHaveFocus()
  })

  it('closes an open editor when another record arrives', async () => {
    const user = userEvent.setup()
    const { rerender } = renderPanel(editable())

    await user.click(screen.getByRole('button', { name: 'Change capabilities' }))
    rerender(
      <MvpDetailPanel
        card={cards.find((c) => c.id === 3)!}
        onClose={vi.fn()}
        releaseLabels={releaseLabels}
        phaseNames={phaseNames}
        {...editable()}
      />,
    )

    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })
})

describe('MvpDetailPanel — keyboard (WCAG 2.4.3)', () => {
  it('opens the lookup from the keyboard alone', async () => {
    const user = userEvent.setup()
    renderPanel(editable())

    screen.getByRole('button', { name: 'Change capabilities' }).focus()
    await user.keyboard('{Enter}')

    expect(screen.getByRole('group', { name: /Capabilities owned by SVD-938/ })).toBeInTheDocument()
  })

  it('keeps focus inside the panel when the lookup replaces the button', async () => {
    const user = userEvent.setup()
    renderPanel(editable())

    await user.click(screen.getByRole('button', { name: 'Change capabilities' }))

    // The button that had focus is gone. Without a deliberate move, focus
    // lands on <body> and the lookup that just opened is reachable only by
    // tabbing from the top of the document.
    const panel = screen.getByRole('complementary', { name: /^MSD feature/ })
    expect(document.activeElement).not.toBe(document.body)
    expect(panel.contains(document.activeElement)).toBe(true)
  })
})

/**
 * A question raised against an MSD feature record — the third thing on the
 * map that can carry one, after capabilities and PwC features.
 */
describe('MvpDetailPanel — questions', () => {
  const renderEditable = (question: string | null = null) => {
    const base = buildMvpCards(graph).find((c) => c.id === 2)!
    const onSaveQuestion = vi.fn().mockResolvedValue(undefined)
    render(
      <MvpDetailPanel
        card={{ ...base, question }}
        onClose={vi.fn()}
        onSaveQuestion={onSaveQuestion}
      />,
    )
    return { onSaveQuestion }
  }

  it('shows a question that has been raised', () => {
    renderEditable('Does this belong in 1.4?')
    expect(screen.getByRole('note')).toHaveTextContent('Does this belong in 1.4?')
  })

  it('offers to add one when there is none', () => {
    renderEditable()
    expect(screen.getByRole('button', { name: /add a question/i })).toBeInTheDocument()
  })

  it('saves a question against the record', async () => {
    const user = userEvent.setup()
    const { onSaveQuestion } = renderEditable()

    await user.click(screen.getByRole('button', { name: /add a question/i }))
    await user.type(screen.getByLabelText('Question'), 'Who owns this?')
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(onSaveQuestion).toHaveBeenCalledWith('Who owns this?'))
  })

  it('clears the question when the field is emptied', async () => {
    // Otherwise an answered question lingers as a blank flag on the card.
    const user = userEvent.setup()
    const { onSaveQuestion } = renderEditable('Old question')

    await user.click(screen.getByRole('button', { name: /edit question/i }))
    await user.clear(screen.getByLabelText('Question'))
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(onSaveQuestion).toHaveBeenCalledWith(null))
  })

  it('offers no editor when the panel is read-only', () => {
    const base = buildMvpCards(graph).find((c) => c.id === 2)!
    render(<MvpDetailPanel card={base} onClose={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /add a question/i })).not.toBeInTheDocument()
  })
})

describe('MvpDetailPanel — details', () => {
  const detailsSection = () =>
    screen.getByRole('heading', { name: /^details$/i }).closest('section') as HTMLElement

  const renderDetails = (details: string, onSaveDetails?: (next: string) => Promise<unknown>) =>
    renderPanel({ card: { ...card, details }, onSaveDetails })

  it('renders the markdown rather than showing its syntax', () => {
    renderDetails('1. Covers **delegated** access only.\n2. Employers only.')
    const items = within(detailsSection()).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual([
      'Covers delegated access only.',
      'Employers only.',
    ])
    expect(within(detailsSection()).getByText('delegated').tagName).toBe('STRONG')
  })

  it('shows raw HTML as text, never as markup', () => {
    renderDetails('<img src=x onerror="alert(1)">')
    expect(detailsSection().querySelector('img')).toBeNull()
  })

  it('says when there are none', () => {
    renderDetails('')
    expect(within(detailsSection()).getByText('None recorded.')).toBeInTheDocument()
  })

  it('edits the whole block as markdown source and saves it as one field', async () => {
    const user = userEvent.setup()
    const onSaveDetails = vi.fn().mockResolvedValue(undefined)
    renderDetails('First line.', onSaveDetails)

    await user.click(screen.getByRole('button', { name: /edit details/i }))
    const field = screen.getByRole('textbox', { name: /details/i })
    expect(field).toHaveValue('First line.')

    await user.type(field, '\n\nSecond line.')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(onSaveDetails).toHaveBeenCalledWith('First line.\n\nSecond line.'),
    )
  })

  it('offers to add them when there are none', () => {
    renderDetails('', vi.fn())
    expect(screen.getByRole('button', { name: 'Add details' })).toBeInTheDocument()
  })
})
