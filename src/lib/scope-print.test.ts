import { describe, expect, it } from 'vitest'
import {
  MAX_UPSCALE,
  PRINT_MARGIN,
  PRINT_PAGE,
  PX_PER_MM,
  fitScale,
  pageHeightMm,
  printableArea,
  scaledSize,
} from '@/lib/scope-print'

describe('printableArea', () => {
  it('is the page less its margins, in CSS pixels', () => {
    const area = printableArea()
    expect(area.width).toBeCloseTo((PRINT_PAGE.width - PRINT_MARGIN * 2) * PX_PER_MM, 5)
    expect(area.height).toBeCloseTo((PRINT_PAGE.height - PRINT_MARGIN * 2) * PX_PER_MM, 5)
  })

  it('never goes negative on a page smaller than its own margins', () => {
    const area = printableArea({ width: 10, height: 10 }, 20)
    expect(area.width).toBe(0)
    expect(area.height).toBe(0)
  })
})

describe('fitScale', () => {
  const area = { width: 1000, height: 500 }

  it('fills the sheet’s width', () => {
    expect(fitScale({ width: 2000, height: 800 }, area)).toBe(0.5)
  })

  it('ignores how tall the map is — the page grows instead', () => {
    // Height-bound fitting shrank a tall map to a third of the sheet and
    // left the rest of the paper blank. Both of these fill the width.
    expect(fitScale({ width: 2000, height: 800 }, area)).toBe(0.5)
    expect(fitScale({ width: 2000, height: 40000 }, area)).toBe(0.5)
  })

  it('blows a narrow map up to the width, within reason', () => {
    expect(fitScale({ width: 500, height: 100 }, area)).toBe(2)
    expect(fitScale({ width: 100, height: 100 }, area)).toBe(MAX_UPSCALE)
  })

  it('stays at 1 while the map is unmeasured, rather than collapsing it', () => {
    expect(fitScale({ width: 0, height: 0 }, area)).toBe(1)
    expect(fitScale({ width: 2000, height: 800 }, { width: 0, height: 0 })).toBe(1)
  })

  it('fits a real grid across the sheet', () => {
    const scale = fitScale({ width: 3000, height: 900 })
    expect(3000 * scale).toBeCloseTo(printableArea().width, 5)
  })
})

describe('pageHeightMm', () => {
  it('is the content plus both margins', () => {
    const tall = 2000 * PX_PER_MM
    expect(pageHeightMm(tall)).toBe(Math.ceil(2000 + PRINT_MARGIN * 2))
  })

  it('never prints a sheet shorter than the page it is based on', () => {
    expect(pageHeightMm(10)).toBe(PRINT_PAGE.height)
    expect(pageHeightMm(0)).toBe(PRINT_PAGE.height)
  })
})

describe('scaledSize', () => {
  it('reports the box the scaled block actually occupies', () => {
    expect(scaledSize({ width: 2000, height: 800 }, 0.5)).toEqual({ width: 1000, height: 400 })
  })
})
