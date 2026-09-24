import { describe, expect, it } from 'vitest'
import {
  BLOCK_GAP,
  MAX_CANVAS_EDGE,
  PAGE,
  PAGE_MARGIN,
  captureScale,
  fitBlocks,
  pdfFilenameFor,
} from '@/lib/scope-pdf'
import { EMPTY_FILTERS } from '@/lib/scope-filters'

const within = (value: number, target: number, tolerance = 0.001) =>
  Math.abs(value - target) <= tolerance

describe('fitBlocks — one page, whole map', () => {
  it('keeps a wide grid inside the page margins', () => {
    // 4000 × 900 is the shape of a full seven-phase grid.
    const [grid] = fitBlocks([{ width: 4000, height: 900 }])
    expect(grid.x).toBeGreaterThanOrEqual(PAGE_MARGIN)
    expect(grid.y).toBeGreaterThanOrEqual(PAGE_MARGIN)
    expect(grid.x + grid.width).toBeLessThanOrEqual(PAGE.width - PAGE_MARGIN + 0.001)
    expect(grid.y + grid.height).toBeLessThanOrEqual(PAGE.height - PAGE_MARGIN + 0.001)
  })

  it('preserves each block’s aspect ratio', () => {
    const [grid] = fitBlocks([{ width: 4000, height: 900 }])
    expect(within(grid.width / grid.height, 4000 / 900)).toBe(true)
  })

  it('scales the blocks together, so the legend stays in proportion', () => {
    // The legend is the key to the grid's colours; scaled independently it
    // would stop matching the cards it explains.
    const [legend, grid] = fitBlocks([
      { width: 2000, height: 200 },
      { width: 4000, height: 900 },
    ])
    expect(within(legend.width / 2000, grid.width / 4000)).toBe(true)
  })

  it('stacks the blocks in the order given, with a gap between them', () => {
    const [legend, grid] = fitBlocks([
      { width: 2000, height: 200 },
      { width: 4000, height: 900 },
    ])
    expect(legend.y).toBeLessThan(grid.y)
    expect(within(grid.y - (legend.y + legend.height), BLOCK_GAP)).toBe(true)
  })

  it('centres the stack on the page', () => {
    const blocks = fitBlocks([
      { width: 2000, height: 200 },
      { width: 4000, height: 900 },
    ])
    const top = blocks[0].y
    const bottom = blocks[blocks.length - 1].y + blocks[blocks.length - 1].height
    expect(within(top - PAGE_MARGIN, PAGE.height - PAGE_MARGIN - bottom, 0.01)).toBe(true)
    // And horizontally, each block in its own right.
    for (const block of blocks) {
      expect(within(block.x - PAGE_MARGIN, PAGE.width - PAGE_MARGIN - (block.x + block.width), 0.01)).toBe(true)
    }
  })

  it('fits a tall map by its height rather than overrunning the page', () => {
    const [grid] = fitBlocks([{ width: 500, height: 4000 }])
    expect(grid.y + grid.height).toBeLessThanOrEqual(PAGE.height - PAGE_MARGIN + 0.001)
  })

  it('does not blow a small map up to fill the sheet', () => {
    const [grid] = fitBlocks([{ width: 200, height: 100 }])
    expect(grid.width).toBe(200)
    expect(grid.height).toBe(100)
  })

  it('ignores a block with no size rather than dividing by zero', () => {
    const placed = fitBlocks([
      { width: 0, height: 0 },
      { width: 4000, height: 900 },
    ])
    expect(placed).toHaveLength(1)
    expect(Number.isFinite(placed[0].width)).toBe(true)
  })

  it('returns nothing when there is nothing to place', () => {
    expect(fitBlocks([])).toEqual([])
  })
})

describe('captureScale — oversampling without exhausting memory', () => {
  it('renders at device scale for a map that comfortably fits', () => {
    expect(captureScale({ width: 1200, height: 800 }, 2)).toBe(2)
  })

  it('never oversamples beyond 2, however high the device ratio', () => {
    expect(captureScale({ width: 1200, height: 800 }, 4)).toBe(2)
  })

  it('backs off so the canvas stays under the edge cap', () => {
    const scale = captureScale({ width: 4000, height: 900 }, 2)
    expect(4000 * scale).toBeLessThanOrEqual(MAX_CANVAS_EDGE)
    expect(scale).toBeGreaterThan(1)
  })

  it('still renders a grid wider than the cap, at 1×', () => {
    expect(captureScale({ width: 8000, height: 900 }, 2)).toBe(1)
  })

  it('treats a sizeless element as 1× rather than returning Infinity', () => {
    expect(captureScale({ width: 0, height: 0 }, 2)).toBe(1)
  })
})

describe('pdfFilenameFor', () => {
  it('names the map and the view it was taken from', () => {
    expect(pdfFilenameFor('mvp', EMPTY_FILTERS)).toBe('vd2-scope-map-by-msd-feature.pdf')
    expect(pdfFilenameFor('capability', EMPTY_FILTERS)).toBe(
      'vd2-scope-map-by-capability.pdf',
    )
  })

  it('marks a filtered map, so it is not mistaken for the whole scope', () => {
    expect(pdfFilenameFor('release', { ...EMPTY_FILTERS, release: ['1.1'] })).toBe(
      'vd2-scope-map-by-pwc-release-filtered.pdf',
    )
  })

  it('is distinct from the Markdown export’s filename', () => {
    // Both are "the current view"; they must not collide in Downloads.
    expect(pdfFilenameFor('mvp', EMPTY_FILTERS)).not.toBe('vd2-scope-by-msd-feature.md')
  })
})
