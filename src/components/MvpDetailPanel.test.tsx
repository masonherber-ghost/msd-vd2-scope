import { render, screen } from '@testing-library/react'
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

const placeable = (onSetPlacement = vi.fn().mockResolvedValue(undefined)) => ({
  releaseOptions,
  phaseOptions,
  onSetPlacement,
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

describe('MvpDetailPanel — re-assigning the record', () => {
  it('offers nothing without a placement handler', () => {
    renderPanel()
    expect(screen.queryByRole('button', { name: 'Edit release' })).not.toBeInTheDocument()
  })

  it('offers a release and a stage when it owns capabilities to move', () => {
    renderPanel(placeable())
    expect(screen.getByRole('button', { name: 'Edit release' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit stage' })).toBeInTheDocument()
  })

  it('shows where its capabilities currently sit', () => {
    renderPanel(placeable())
    // Both owned capabilities are in 1.1 · Access & Onboarding.
    expect(screen.getAllByText('Release 1.1').length).toBeGreaterThan(0)
  })

  it('moves the record by moving what it owns', async () => {
    const user = userEvent.setup()
    const onSetPlacement = vi.fn().mockResolvedValue(undefined)
    renderPanel(placeable(onSetPlacement))

    await user.click(screen.getByRole('button', { name: 'Edit release' }))
    await user.selectOptions(screen.getByLabelText('Release'), '1.4')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    // One axis at a time: the stage each capability sits in is left alone.
    expect(onSetPlacement).toHaveBeenCalledWith({ release_id: '1.4' })
  })

  it('moves the stage without touching the release', async () => {
    const user = userEvent.setup()
    const onSetPlacement = vi.fn().mockResolvedValue(undefined)
    renderPanel(placeable(onSetPlacement))

    await user.click(screen.getByRole('button', { name: 'Edit stage' }))
    await user.selectOptions(screen.getByLabelText('Stage'), 'manage-vacancies')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSetPlacement).toHaveBeenCalledWith({ phase_id: 'manage-vacancies' })
  })

  it('says a straddling record is mixed rather than naming one release', () => {
    renderPanel({
      ...placeable(),
      card: {
        ...card,
        capabilities: [
          { ...card.capabilities[0], releaseId: '1.1' },
          { ...card.capabilities[1], releaseId: '1.4' },
        ],
      },
    })

    expect(screen.getByText(/Mixed — Release 1.1, Release 1.4/)).toBeInTheDocument()
  })

  it('says what a move actually does, since the record has no release of its own', () => {
    renderPanel(placeable())
    expect(
      screen.getByText(/moves the 2 capabilities this record owns/),
    ).toBeInTheDocument()
  })

  it('offers no placement editor when the record owns nothing to move', () => {
    renderPanel({ ...placeable(), card: { ...card, capabilities: [] } })
    expect(screen.queryByRole('button', { name: 'Edit release' })).not.toBeInTheDocument()
  })

  it('surfaces the server’s refusal in place', async () => {
    const user = userEvent.setup()
    const onSetPlacement = vi
      .fn()
      .mockRejectedValue(new Error('There is no release "9.9".'))
    renderPanel(placeable(onSetPlacement))

    await user.click(screen.getByRole('button', { name: 'Edit release' }))
    await user.selectOptions(screen.getByLabelText('Release'), '1.4')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('There is no release "9.9".')
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

    expect(screen.getByRole('group', { name: /Capabilities owned by 938/ })).toBeInTheDocument()
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

    expect(screen.getByRole('group', { name: /Capabilities owned by 938/ })).toBeInTheDocument()
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
