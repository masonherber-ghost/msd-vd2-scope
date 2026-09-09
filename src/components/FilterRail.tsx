import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { FeatureCardModel, ScopeMapModel } from '@/lib/scope-derive'
import {
  EMPTY_FILTERS,
  GROUP_LABEL,
  countForValue,
  isEmpty,
  toggleValue,
  type FilterGroup,
  type FilterState,
} from '@/lib/scope-filters'

type Option = { value: string | number; label: string; hint?: string }

export type FilterRailProps = {
  id?: string
  onClose?: () => void
  model: ScopeMapModel
  state: FilterState
  onChange: (next: FilterState) => void
  /** Features surviving the current filters, for the header summary. */
  visible: FeatureCardModel[]
}

const ACTOR_OPTIONS: Option[] = [
  { value: 'employer', label: 'Employer' },
  { value: 'staff', label: 'Staff' },
  { value: 'jobseeker', label: 'Jobseeker' },
  { value: 'system', label: 'System' },
]

const OPTION_OPTIONS: Option[] = [
  { value: '1A', label: 'Option 1A' },
  { value: '1B', label: 'Option 1B' },
  { value: 'none', label: 'No option set' },
]

const SOURCE_OPTIONS: Option[] = [
  { value: 'mapping', label: 'Mapping file' },
  { value: 'sequencing', label: 'Sequencing table' },
  { value: 'both', label: 'Both sources' },
  { value: 'manual', label: 'Added or edited here' },
]

const CONFLICT_OPTIONS: Option[] = [
  { value: 'release', label: 'Release conflict' },
  { value: 'phase', label: 'Phase conflict' },
  { value: 'unmatched', label: 'Unmatched link' },
  { value: 'unreviewed', label: 'Unreviewed' },
  { value: 'corrected', label: 'Corrected source' },
  { value: 'none', label: 'No conflict' },
]

export function FilterRail({
  id,
  onClose,
  model,
  state,
  onChange,
  visible,
}: FilterRailProps) {
  const [mvpQuery, setMvpQuery] = useState('')

  const releaseOptions = useMemo<Option[]>(
    () =>
      model.releases.map((release) => ({
        value: release.id,
        label: release.label,
        hint: release.name || undefined,
      })),
    [model.releases],
  )

  const phaseOptions = useMemo<Option[]>(
    () =>
      model.phases.map((phase) => ({
        value: phase.id,
        label: phase.name,
        hint: `epic ${phase.epic_ref}`,
      })),
    [model.phases],
  )

  const mvpOptions = useMemo<Option[]>(() => {
    // One entry per ref, not per record: filtering is by ref (R-8.8).
    const byRef = new Map<number, string>()
    for (const mvp of model.mvpFeatures) {
      if (!byRef.has(mvp.ref)) byRef.set(mvp.ref, mvp.title)
    }
    return [...byRef.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([ref, title]) => ({ value: ref, label: String(ref), hint: title }))
  }, [model.mvpFeatures])

  const filteredMvpOptions = useMemo(() => {
    const query = mvpQuery.trim().toLowerCase()
    if (!query) return mvpOptions
    return mvpOptions.filter(
      (option) =>
        option.label.includes(query) ||
        (option.hint ?? '').toLowerCase().includes(query),
    )
  }, [mvpOptions, mvpQuery])

  const set = <G extends FilterGroup>(group: G, values: FilterState[G]) =>
    onChange({ ...state, [group]: values })

  return (
    <aside className="filter-rail" aria-label="Filters" id={id}>
      <div className="filter-rail__header">
        <h2 className="filter-rail__title">Filters</h2>
        {onClose ? (
          <Button variant="outline" size="sm" onClick={onClose}>
            Hide
          </Button>
        ) : null}
      </div>
      <span className="filter-rail__summary" role="status">
        {visible.length} of {model.features.length} features
      </span>

      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          onChange(EMPTY_FILTERS)
        }
        disabled={isEmpty(state)}
      >
        Clear all
      </Button>

      <Group
        group="release"
        options={releaseOptions}
        selected={state.release}
        model={model}
        state={state}
        onToggle={(value) => set('release', toggleValue(state.release, String(value)))}
      />

      <Group
        group="phase"
        options={phaseOptions}
        selected={state.phase}
        model={model}
        state={state}
        onToggle={(value) => set('phase', toggleValue(state.phase, String(value)))}
      />

      <Group
        group="actor"
        options={ACTOR_OPTIONS}
        selected={state.actor}
        model={model}
        state={state}
        onToggle={(value) =>
          set('actor', toggleValue(state.actor, String(value) as FilterState['actor'][number]))
        }
      />

      <Group
        group="option"
        options={OPTION_OPTIONS}
        selected={state.option}
        model={model}
        state={state}
        onToggle={(value) =>
          set(
            'option',
            toggleValue(state.option, String(value) as FilterState['option'][number]),
          )
        }
      />

      <Group
        group="conflict"
        options={CONFLICT_OPTIONS}
        selected={state.conflict}
        model={model}
        state={state}
        onToggle={(value) =>
          set(
            'conflict',
            toggleValue(state.conflict, String(value) as FilterState['conflict'][number]),
          )
        }
      />

      <Group
        group="source"
        options={SOURCE_OPTIONS}
        selected={state.source}
        model={model}
        state={state}
        onToggle={(value) => set('source', toggleValue(state.source, String(value)))}
      />

      <Group
        group="mvp"
        options={filteredMvpOptions}
        selected={state.mvp}
        model={model}
        state={state}
        scroll
        // 48 refs is too long to sit open; the list appears as you search.
        // Anything already selected stays visible so an active filter is
        // never hidden.
        collapseUntilSearch
        totalOptionCount={mvpOptions.length}
        search={{
          value: mvpQuery,
          onChange: setMvpQuery,
          label: 'Search MVP features',
        }}
        onToggle={(value) => set('mvp', toggleValue(state.mvp, Number(value)))}
      />
    </aside>
  )
}

function Group({
  group,
  options,
  selected,
  model,
  state,
  onToggle,
  scroll = false,
  search,
  collapseUntilSearch = false,
  totalOptionCount,
}: {
  group: FilterGroup
  options: Option[]
  selected: (string | number)[]
  model: ScopeMapModel
  state: FilterState
  onToggle: (value: string | number) => void
  scroll?: boolean
  search?: { value: string; onChange: (value: string) => void; label: string }
  /** Show results only once something is typed, for a very long list. */
  collapseUntilSearch?: boolean
  totalOptionCount?: number
}) {
  const searchId = `filter-${group}-search`
  const searching = (search?.value ?? '').trim() !== ''
  const collapsed = collapseUntilSearch && !searching

  // Collapsed, only the current selection is worth showing — losing sight of
  // an active filter is exactly what the rail is meant to prevent.
  const shown = collapsed
    ? options.filter((option) => selected.includes(option.value))
    : options

  return (
    <fieldset className="filter-rail__group">
      <legend className="filter-rail__legend">
        {GROUP_LABEL[group]}
        {selected.length > 0 ? (
          <span className="filter-rail__legend-count">{selected.length} selected</span>
        ) : null}
      </legend>

      {search ? (
        <>
          <label className="sr-only" htmlFor={searchId}>
            {search.label}
          </label>
          <input
            id={searchId}
            type="search"
            className="filter-rail__search"
            placeholder={search.label}
            value={search.value}
            onChange={(event) => search.onChange(event.target.value)}
          />
        </>
      ) : null}

      {collapsed ? (
        <p className="filter-rail__empty-note">
          {selected.length > 0
            ? `${selected.length} selected. Type to find more of the ${
                totalOptionCount ?? options.length
              }.`
            : `Type to search ${totalOptionCount ?? options.length} MVP features.`}
        </p>
      ) : null}

      <div
        className={`filter-rail__options${
          scroll ? ' filter-rail__options--scroll' : ''
        }`}
      >
        {shown.length === 0 ? (
          collapsed ? null : <p className="filter-rail__empty-note">No matches.</p>
        ) : (
          shown.map((option) => {
            const count = countForValue(model.features, state, group, option.value)
            const checked = selected.includes(option.value)
            return (
              <label
                key={String(option.value)}
                className={`filter-rail__option${
                  count === 0 && !checked ? ' filter-rail__option--zero' : ''
                }`}
              >
                <input
                  type="checkbox"
                  className="filter-rail__checkbox"
                  checked={checked}
                  onChange={() => onToggle(option.value)}
                />
                <span className="filter-rail__option-label">
                  {option.label}
                  {option.hint ? (
                    <span className="filter-rail__summary"> · {option.hint}</span>
                  ) : null}
                </span>
                <span className="filter-rail__option-count" aria-label={`${count} features`}>
                  {count}
                </span>
              </label>
            )
          })
        )}
      </div>
    </fieldset>
  )
}
