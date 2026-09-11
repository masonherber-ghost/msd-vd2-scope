import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FeatureDetailPanel } from '@/components/FeatureDetailPanel'
import { buildFeatureDetail } from '@/lib/feature-detail'
import { makeScopeGraph } from '@/test/scope-fixture'

const graph = makeScopeGraph()

function renderPanel(featureId = 'F-002', activeMvpRefs: number[] = []) {
  const detail = buildFeatureDetail(graph, featureId)!
  const onClose = vi.fn()
  const onPivotToMvp = vi.fn()
  const onSelectFeature = vi.fn()
  const result = render(
    <FeatureDetailPanel
      detail={detail}
      onClose={onClose}
      onPivotToMvp={onPivotToMvp}
      onSelectFeature={onSelectFeature}
      activeMvpRefs={activeMvpRefs}
    />,
  )
  return { ...result, onClose, onPivotToMvp, onSelectFeature, detail }
}

const section = (name: RegExp) =>
  screen.getByRole('heading', { name }).closest('div') as HTMLElement

describe('FeatureDetailPanel — header', () => {
  it('names the feature and its placement', () => {
    renderPanel('F-002')
    expect(screen.getByRole('heading', { level: 2, name: 'Verify employer' })).toBeInTheDocument()
    expect(screen.getByText(/Release 1\.1 · Access & Onboarding · epic 179/)).toBeInTheDocument()
  })

  it('no longer contradicts itself about the phase name', () => {
    // The label is the canonical phase's own name, so the "filed this under"
    // note has nothing left to report.
    renderPanel('F-001')
    expect(screen.queryByText(/filed this under/)).not.toBeInTheDocument()
  })

  it('shows the foundational-build statement', () => {
    renderPanel('F-002')
    expect(section(/included in foundational build/i)).toBeInTheDocument()
  })
})

describe('FeatureDetailPanel — capability placement (R-8.15)', () => {
  it('shows both placements inline when the release differs', () => {
    renderPanel('F-002')
    expect(
      screen.getByText(
        /the feature ships in Release 1\.1, the MSD features sequencing delivers this capability in Release 1\.4/i,
      ),
    ).toBeInTheDocument()
  })

  it('shows both placements when the phase differs', () => {
    renderPanel('F-002')
    expect(
      screen.getByText(
        /the feature sits in Access & Onboarding, the MSD features sequencing places this capability in Manage Vacancies/i,
      ),
    ).toBeInTheDocument()
  })

  it('says nothing about a phase the two documents merely word differently', () => {
    // Both now carry the canonical name, so there is no difference to note.
    renderPanel('F-001')
    expect(screen.queryByText(/resolved by the canonical phase merge/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Labelled differently:/)).not.toBeInTheDocument()
  })

  it('explains an unmatched capability rather than hiding it', () => {
    renderPanel('F-002')
    expect(screen.getByText(/not merged on a prefix/i)).toBeInTheDocument()
  })

  it('groups capabilities by actor', () => {
    renderPanel('F-001')
    expect(screen.getByRole('heading', { name: /^Employer \(1\)$/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^Staff \(1\)$/ })).toBeInTheDocument()
  })
})

describe('FeatureDetailPanel — no capabilities (R-8.18)', () => {
  it('states the source\'s own qualifier', () => {
    const withNote = makeScopeGraph({
      pwcFeatures: [
        {
          id: 'F-008',
          name: 'Account access recovery',
          foundational_build: 'Recovery without staff.',
          release_id: '1.1',
          phase_id: 'access-and-onboarding',
          source_phase_label: 'Access & onboarding',
          capability_note: 'Mapped under Release 2+ in table',
          display_order: 1,
          source: 'mapping',
        },
      ],
      featureCapabilityLinks: [],
      featureMvpLinks: [],
    })
    const detail = buildFeatureDetail(withNote, 'F-008')!
    render(
      <FeatureDetailPanel
        detail={detail}
        onClose={vi.fn()}
        onPivotToMvp={vi.fn()}
        onSelectFeature={vi.fn()}
        activeMvpRefs={[]}
      />,
    )
    expect(
      screen.getByText(
        /The PwC features sequencing states: “Mapped under Release 2\+ in table”/,
      ),
    ).toBeInTheDocument()
  })
})

describe('FeatureDetailPanel — MVP chips pivot the map (R-8.16)', () => {
  it('reports the ref without closing the panel', async () => {
    const user = userEvent.setup()
    const { onPivotToMvp, onClose } = renderPanel('F-002')

    // Pivot has its own control; tapping the chip itself opens the lookup.
    await user.click(
      screen.getByRole('button', { name: 'Filter the map to MVP feature 948' }),
    )

    expect(onPivotToMvp).toHaveBeenCalledWith(948)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows the pivot control as pressed when the map is pivoted to it', () => {
    renderPanel('F-002', [948])
    expect(
      screen.getByRole('button', { name: 'Filter the map to MVP feature 948' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('FeatureDetailPanel — connected features (R-8.17)', () => {
  it('states when nothing else shares an MVP feature', () => {
    renderPanel('F-002')
    expect(screen.getByText(/no other feature maps to the same MVP feature/i)).toBeInTheDocument()
  })

  it('flags a connection that crosses a release boundary', async () => {
    const user = userEvent.setup()
    const crossing = makeScopeGraph({
      pwcFeatures: [
        ...graph.pwcFeatures,
        {
          id: 'F-003',
          name: 'Bulk invite campaign',
          foundational_build: '',
          release_id: '1.4',
          phase_id: 'access-and-onboarding',
          source_phase_label: null,
          capability_note: null,
          display_order: 3,
          source: 'mapping',
        },
      ],
      featureMvpLinks: [
        { pwc_feature_id: 'F-001', mvp_feature_id: 1, source: 'mapping' },
        { pwc_feature_id: 'F-003', mvp_feature_id: 1, source: 'mapping' },
      ],
    })
    const detail = buildFeatureDetail(crossing, 'F-001')!
    const onSelectFeature = vi.fn()
    render(
      <FeatureDetailPanel
        detail={detail}
        onClose={vi.fn()}
        onPivotToMvp={vi.fn()}
        onSelectFeature={onSelectFeature}
        activeMvpRefs={[]}
      />,
    )

    const connection = screen.getByRole('button', { name: /F-003/ })
    expect(within(connection).getByText('crosses release')).toBeInTheDocument()

    await user.click(connection)
    expect(onSelectFeature).toHaveBeenCalledWith('F-003')
  })
})

describe('FeatureDetailPanel — keyboard and close', () => {
  it('closes on the Close button', async () => {
    const user = userEvent.setup()
    const { onClose } = renderPanel()
    await user.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on Escape (R-10.4)', async () => {
    const user = userEvent.setup()
    const { onClose } = renderPanel()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('takes focus when it opens, so it is keyboard reachable', () => {
    renderPanel()
    expect(screen.getByRole('region', { name: 'Verify employer' })).toHaveFocus()
  })
})

describe('FeatureDetailPanel — a reviewed capability collapses (R-8.23)', () => {
  const resolvers = {
    onKeepCapability: vi.fn().mockResolvedValue(undefined),
    onMoveCapability: vi.fn().mockResolvedValue(undefined),
    releaseOptions: [
      { value: '1.1', label: 'Release 1.1' },
      { value: '1.4', label: 'Release 1.4' },
    ],
    phaseOptions: [
      { value: 'access-and-onboarding', label: 'Access & Onboarding' },
      { value: 'manage-vacancies', label: 'Manage Vacancies' },
    ],
  }

  /** F-002's link 102 carries the release conflict shown in the panel. */
  const renderWithState = (resolutionState: string) => {
    const withState = {
      ...graph,
      featureCapabilityLinks: graph.featureCapabilityLinks.map((l) =>
        l.id === 102 ? { ...l, resolution_state: resolutionState } : l,
      ),
    }
    const detail = buildFeatureDetail(withState as typeof graph, 'F-002')!
    return render(
      <FeatureDetailPanel
        detail={detail}
        onClose={vi.fn()}
        onPivotToMvp={vi.fn()}
        onSelectFeature={vi.fn()}
        activeMvpRefs={[]}
        {...resolvers}
      />,
    )
  }

  it('argues the case while it is unreviewed', () => {
    renderWithState('unreviewed')
    expect(screen.getByText(/Release differs:/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeInTheDocument()
  })

  it('stops arguing it once decided', () => {
    renderWithState('table_wins')
    expect(screen.queryByText(/Release differs:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Phase differs:/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Resolve' })).not.toBeInTheDocument()
  })

  it('leaves one control, naming the decision in words', () => {
    renderWithState('table_wins')
    // The tick is never the only signal (R-10.6) — the accessible name
    // carries the decision, and `title` shows it on hover.
    const control = screen.getByRole('button', {
      name: /Reviewed: MSD features sequencing is right\. Change the decision for Electronic T&Cs acceptance/,
    })
    expect(control).toHaveAttribute(
      'title',
      'MSD features sequencing is right — change this decision',
    )
  })

  it('names whichever decision was taken', () => {
    renderWithState('defect_raised')
    expect(
      screen.getByRole('button', { name: /Reviewed: Defect raised\./ }),
    ).toBeInTheDocument()
  })

  it('reopens the full decision from that control', async () => {
    const user = userEvent.setup()
    renderWithState('table_wins')
    await user.click(screen.getByRole('button', { name: /Reviewed:/ }))

    const dialog = screen.getByRole('dialog')
    // Collapsed in the panel, still stated in full in the modal.
    expect(within(dialog).getByText(/F-002 ships in Release 1\.1/)).toBeInTheDocument()
    expect(
      within(dialog).getByText(/delivers this capability in Release 1\.4/),
    ).toBeInTheDocument()
  })

  it('has nothing to show for a phase the documents merely word differently', () => {
    const detail = buildFeatureDetail(graph, 'F-001')!
    render(
      <FeatureDetailPanel
        detail={detail}
        onClose={vi.fn()}
        onPivotToMvp={vi.fn()}
        onSelectFeature={vi.fn()}
        activeMvpRefs={[]}
        {...resolvers}
      />,
    )
    expect(screen.queryByText(/Labelled differently:/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Reviewed:/ })).not.toBeInTheDocument()
  })

  it('collapses without a reload once the decision is confirmed', async () => {
    const user = userEvent.setup()
    renderWithState('unreviewed')
    expect(screen.getByText(/Release differs:/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Resolve' }))
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm' }),
    )

    expect(resolvers.onKeepCapability).toHaveBeenCalled()
  })
})
