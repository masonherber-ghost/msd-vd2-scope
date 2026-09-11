import { describe, expect, it } from 'vitest'
import {
  RESOLUTION_LABEL,
  SOURCE_LABEL,
  createFeatureSchema,
  fieldErrors,
  sourceLabel,
  summariseZodError,
  updateFeatureSchema,
} from '@/lib/validators'

const valid = {
  id: 'F-001',
  name: 'Invite employer',
  foundational_build: 'Staff can invite an employer.',
  release_id: '1.1',
  phase_id: 'access-and-onboarding',
}

describe('createFeatureSchema — feature id', () => {
  it.each(['F-001', 'F-093', 'F-999'])('accepts %s', (id) => {
    expect(createFeatureSchema.safeParse({ ...valid, id }).success).toBe(true)
  })

  it.each(['FEATURE-1', 'F-1', 'F-0001', 'f-001', '001', 'F001', ''])(
    'rejects %s',
    (id) => {
      const result = createFeatureSchema.safeParse({ ...valid, id })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(fieldErrors(result.error).id).toMatch(/look like F-001/)
      }
    },
  )

  it('trims surrounding whitespace', () => {
    const result = createFeatureSchema.safeParse({ ...valid, id: '  F-005  ' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.id).toBe('F-005')
  })
})

describe('createFeatureSchema — required placement (R-9.3)', () => {
  it('rejects a missing release', () => {
    const result = createFeatureSchema.safeParse({ ...valid, release_id: '' })
    expect(result.success).toBe(false)
    if (!result.success) expect(fieldErrors(result.error).release_id).toMatch(/release/i)
  })

  it('rejects a missing phase', () => {
    const result = createFeatureSchema.safeParse({ ...valid, phase_id: '   ' })
    expect(result.success).toBe(false)
    if (!result.success) expect(fieldErrors(result.error).phase_id).toMatch(/phase/i)
  })

  it('rejects an absent release entirely', () => {
    const { release_id: _omitted, ...withoutRelease } = valid
    expect(createFeatureSchema.safeParse(withoutRelease).success).toBe(false)
  })
})

describe('createFeatureSchema — name', () => {
  it('rejects a blank name', () => {
    const result = createFeatureSchema.safeParse({ ...valid, name: '   ' })
    expect(result.success).toBe(false)
    if (!result.success) expect(fieldErrors(result.error).name).toMatch(/give the feature a name/i)
  })

  it('rejects a name over 200 characters', () => {
    expect(
      createFeatureSchema.safeParse({ ...valid, name: 'x'.repeat(201) }).success,
    ).toBe(false)
  })

  it('defaults the foundational build to an empty string', () => {
    const { foundational_build: _omitted, ...withoutBuild } = valid
    const result = createFeatureSchema.safeParse(withoutBuild)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.foundational_build).toBe('')
  })
})

describe('updateFeatureSchema', () => {
  it('accepts a single field', () => {
    expect(updateFeatureSchema.safeParse({ name: 'Renamed' }).success).toBe(true)
  })

  it('rejects an empty patch', () => {
    const result = updateFeatureSchema.safeParse({})
    expect(result.success).toBe(false)
    if (!result.success) expect(summariseZodError(result.error)).toMatch(/nothing to update/i)
  })

  it('ignores an id in the patch — identity is not editable', () => {
    const result = updateFeatureSchema.safeParse({ id: 'F-777', name: 'Renamed' })
    expect(result.success).toBe(true)
    if (result.success) expect('id' in result.data).toBe(false)
  })

  it('still rejects a blank name', () => {
    expect(updateFeatureSchema.safeParse({ name: '  ' }).success).toBe(false)
  })
})

describe('error helpers', () => {
  it('reports one message per field', () => {
    const result = createFeatureSchema.safeParse({ id: 'bad', name: '', release_id: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const errors = fieldErrors(result.error)
      expect(Object.keys(errors).sort()).toEqual(['id', 'name', 'phase_id', 'release_id'])
    }
  })

  it('summarises every issue on one line', () => {
    const result = createFeatureSchema.safeParse({ id: 'bad', name: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const summary = summariseZodError(result.error)
      expect(summary).toContain('id:')
      expect(summary).toContain('name:')
    }
  })
})

describe('SOURCE_LABEL — the two source documents have one display name each', () => {
  it('names them as the programme does', () => {
    expect(SOURCE_LABEL.mapping).toBe('PwC features sequencing')
    expect(SOURCE_LABEL.sequencing).toBe('MSD features sequencing')
  })

  it('derives the resolution labels, so the two can never disagree', () => {
    expect(RESOLUTION_LABEL.mapping_wins).toBe(`${SOURCE_LABEL.mapping} is right`)
    expect(RESOLUTION_LABEL.table_wins).toBe(`${SOURCE_LABEL.sequencing} is right`)
  })

  it('covers every source value the schema accepts', () => {
    // A stored source with no label would render blank or raw in the UI.
    for (const source of ['mapping', 'sequencing', 'both', 'manual']) {
      expect(sourceLabel(source)).not.toBe(source)
      expect(sourceLabel(source).length).toBeGreaterThan(0)
    }
  })

  it('falls back to the raw value rather than rendering nothing', () => {
    expect(sourceLabel('something-new')).toBe('something-new')
  })
})
