import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { PhaseRow, ReleaseRow } from '@/lib/api-client'
import { createFeatureSchema, fieldErrors } from '@/lib/validators'

export type FeatureFormValues = {
  id: string
  name: string
  foundational_build: string
  release_id: string
  phase_id: string
}

export type FeatureFormProps = {
  releases: ReleaseRow[]
  phases: PhaseRow[]
  /** Pre-filled from the map cell the create was started from (R-9.7). */
  initial: FeatureFormValues
  /** The next free F- number, offered as an overridable default. */
  suggestedId?: string
  pending: boolean
  serverError?: string | null
  onSubmit: (values: FeatureFormValues) => void
  onCancel: () => void
  onDirtyChange?: (dirty: boolean) => void
}

export function FeatureForm({
  releases,
  phases,
  initial,
  suggestedId,
  pending,
  serverError,
  onSubmit,
  onCancel,
  onDirtyChange,
}: FeatureFormProps) {
  const [values, setValues] = useState<FeatureFormValues>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  // null means "not typed yet", so the suggestion can be derived rather than
  // written into state by an effect. Typing anything, including clearing the
  // field, takes over.
  const [typedId, setTypedId] = useState<string | null>(
    initial.id === '' ? null : initial.id,
  )

  const idValue = typedId ?? suggestedId ?? ''
  const formValues: FeatureFormValues = { ...values, id: idValue }

  const dirty =
    values.name.trim() !== initial.name.trim() ||
    values.foundational_build.trim() !== initial.foundational_build.trim() ||
    values.release_id !== initial.release_id ||
    values.phase_id !== initial.phase_id

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  const update = <K extends keyof FeatureFormValues>(key: K, value: FeatureFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }))

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    // The same schema the route uses, so the form cannot disagree with it.
    const parsed = createFeatureSchema.safeParse(formValues)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    onSubmit(formValues)
  }

  const errorFor = (field: keyof FeatureFormValues) => errors[field]

  return (
    <form
      className="feature-form"
      onSubmit={submit}
      noValidate
      aria-labelledby="feature-form-title"
    >
      <h2 className="feature-form__title" id="feature-form-title">
        New PwC feature
      </h2>
      <p className="feature-form__hint">
        Feature ids are sparse — {suggestedId ? `${suggestedId} is the next free one` : 'any free F- number works'}, and you can override it.
      </p>

      <div className="feature-form__row">
        <div className="feature-form__field">
          <label className="feature-form__label" htmlFor="feature-id">
            Feature id
          </label>
          <input
            id="feature-id"
            className="feature-form__input"
            value={idValue}
            onChange={(event) => setTypedId(event.target.value)}
            aria-invalid={Boolean(errorFor('id'))}
            aria-describedby={errorFor('id') ? 'feature-id-error' : undefined}
          />
          {errorFor('id') ? (
            <p className="feature-form__error" id="feature-id-error">
              {errorFor('id')}
            </p>
          ) : null}
        </div>

        <div className="feature-form__field">
          <label className="feature-form__label" htmlFor="feature-name">
            Name
          </label>
          <input
            id="feature-name"
            className="feature-form__input"
            value={values.name}
            onChange={(event) => update('name', event.target.value)}
            aria-invalid={Boolean(errorFor('name'))}
            aria-describedby={errorFor('name') ? 'feature-name-error' : undefined}
          />
          {errorFor('name') ? (
            <p className="feature-form__error" id="feature-name-error">
              {errorFor('name')}
            </p>
          ) : null}
        </div>
      </div>

      <div className="feature-form__row">
        <div className="feature-form__field">
          <label className="feature-form__label" htmlFor="feature-release">
            Release
          </label>
          <select
            id="feature-release"
            className="feature-form__select"
            value={values.release_id}
            onChange={(event) => update('release_id', event.target.value)}
            aria-invalid={Boolean(errorFor('release_id'))}
          >
            <option value="">Choose a release</option>
            {releases.map((release) => (
              <option key={release.id} value={release.id}>
                {release.label}
              </option>
            ))}
          </select>
          {errorFor('release_id') ? (
            <p className="feature-form__error">{errorFor('release_id')}</p>
          ) : null}
        </div>

        <div className="feature-form__field">
          <label className="feature-form__label" htmlFor="feature-phase">
            Phase
          </label>
          <select
            id="feature-phase"
            className="feature-form__select"
            value={values.phase_id}
            onChange={(event) => update('phase_id', event.target.value)}
            aria-invalid={Boolean(errorFor('phase_id'))}
          >
            <option value="">Choose a phase</option>
            {phases.map((phase) => (
              <option key={phase.id} value={phase.id}>
                {phase.name}
              </option>
            ))}
          </select>
          {errorFor('phase_id') ? (
            <p className="feature-form__error">{errorFor('phase_id')}</p>
          ) : null}
        </div>
      </div>

      <div className="feature-form__field">
        <label className="feature-form__label" htmlFor="feature-build">
          Included in foundational build
        </label>
        <textarea
          id="feature-build"
          className="feature-form__textarea"
          rows={3}
          value={values.foundational_build}
          onChange={(event) => update('foundational_build', event.target.value)}
        />
      </div>

      {serverError ? (
        <p role="alert" className="feature-form__error">
          {serverError}
        </p>
      ) : null}

      <div className="feature-form__actions">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Creating…' : 'Create feature'}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
