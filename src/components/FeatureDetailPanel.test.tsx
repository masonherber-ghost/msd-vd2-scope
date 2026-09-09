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

  it('notes where the source document filed it differently', () => {
    renderPanel('F-001')
    expect(screen.getByText(/filed this under “Onboarding via invite”/)).toBeInTheDocument()
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
      screen.getByText(/the feature ships in Release 1\.1, the table delivers this capability in Release 1\.4/i),
    ).toBeInTheDocument()
  })

  it('shows both placements when the phase differs', () => {
    renderPanel('F-002')
    expect(
      screen.getByText(/the feature sits in Access & Onboarding, the table places this capability in Manage Vacancies/i),
    ).toBeInTheDocument()
  })

  it('says a phase disagreement is resolved by the canonical merge', () => {
    renderPanel('F-001')
    expect(screen.getByText(/resolved by the canonical phase merge/i)).toBeInTheDocument()
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
      screen.getByText(/The mapping document states: “Mapped under Release 2\+ in table”/),
    ).toBeInTheDocument()
  })
})

describe('FeatureDetailPanel — MVP chips pivot the map (R-8.16)', () => {
  it('reports the ref without closing the panel', async () => {
    const user = userEvent.setup()
    const { onPivotToMvp, onClose } = renderPanel('F-002')

    await user.click(screen.getByRole('button', { name: /948/ }))

    expect(onPivotToMvp).toHaveBeenCalledWith(948)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows a chip as pressed when the map is pivoted to it', () => {
    renderPanel('F-002', [948])
    expect(screen.getByRole('button', { name: /948/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
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
