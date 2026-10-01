import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BLOCK_GAP,
  PAGE,
  captureScopeMapPdf,
  orientationFor,
  pageFor,
  type CaptureBlock,
} from '@/lib/scope-pdf'
import { EMPTY_FILTERS } from '@/lib/scope-filters'

/**
 * The canvas libraries are mocked at their own boundary: jsdom renders
 * nothing, so a real capture is impossible here and would prove nothing
 * about the page anyway. What is worth asserting is the contract between
 * this module and them — which elements it hands over, what it does to the
 * clone, and what it puts on the page.
 */

const { html2canvas, save, addImage, jsPDFArgs } = vi.hoisted(() => ({
  html2canvas: vi.fn(),
  save: vi.fn(),
  addImage: vi.fn(),
  jsPDFArgs: [] as unknown[],
}))

vi.mock('html2canvas-pro', () => ({ default: html2canvas }))

vi.mock('jspdf', () => ({
  jsPDF: class {
    constructor(options: unknown) {
      jsPDFArgs.push(options)
    }
    addImage = addImage
    save = save
  },
}))

/** The common case: blocks that carry the page colour behind them. */
const onPage = (...elements: HTMLElement[]): CaptureBlock[] =>
  elements.map((element) => ({ element, background: 'app' }))

/** A stand-in for the canvas html2canvas would hand back. */
const fakeCanvas = (width: number, height: number) => ({ width, height })

function element(className: string, width: number, height: number): HTMLElement {
  const node = document.createElement('div')
  node.className = className
  Object.defineProperty(node, 'offsetWidth', { value: width, configurable: true })
  Object.defineProperty(node, 'offsetHeight', { value: height, configurable: true })
  document.body.appendChild(node)
  return node
}

beforeEach(() => {
  document.body.innerHTML = ''
  jsPDFArgs.length = 0
  html2canvas.mockReset()
  html2canvas.mockImplementation(async (node: HTMLElement) =>
    fakeCanvas(node.offsetWidth, node.offsetHeight),
  )
})

describe('captureScopeMapPdf — what it captures', () => {
  it('captures each element it is given, in order', async () => {
    const legend = element('scope-chrome__legend', 800, 100)
    const grid = element('scope-map-grid', 2000, 700)

    await captureScopeMapPdf({
      blocks: onPage(legend, grid),
      view: 'mvp',
      filters: EMPTY_FILTERS,
    })

    expect(html2canvas).toHaveBeenCalledTimes(2)
    expect(html2canvas.mock.calls[0][0]).toBe(legend)
    expect(html2canvas.mock.calls[1][0]).toBe(grid)
  })

  it('saves one page, trimmed to the map rather than padded out to A3', async () => {
    await captureScopeMapPdf({
      blocks: onPage(element('scope-map-grid', 2000, 700)),
      view: 'release',
      filters: EMPTY_FILTERS,
    })

    const { unit, format, orientation } = jsPDFArgs[0] as {
      unit: string
      format: [number, number]
      orientation: string
    }
    expect(unit).toBe('mm')
    // Stated, and matching the format — jsPDF turns the page on its side
    // otherwise, and the map loses its right-hand columns.
    expect(orientation).toBe(orientationFor({ width: format[0], height: format[1] }))
    expect(format).toEqual([
      pageFor([{ width: 2000, height: 700 }]).width,
      pageFor([{ width: 2000, height: 700 }]).height,
    ])
    // Within A3, so it still prints — but not the whole sheet.
    expect(format[0]).toBeLessThanOrEqual(PAGE.width)
    expect(format[1]).toBeLessThan(PAGE.height)
    expect(addImage).toHaveBeenCalledTimes(1)
  })

  it('compresses the bitmap, so the file is sendable', async () => {
    // jsPDF stores a canvas raw by default: a full map comes out around
    // 35MB instead of under one.
    await captureScopeMapPdf({
      blocks: onPage(element('scope-map-grid', 2000, 700)),
      view: 'release',
      filters: EMPTY_FILTERS,
    })

    expect(addImage.mock.calls[0][1]).toBe('PNG')
    expect(addImage.mock.calls[0][7]).toBe('FAST')
  })

  it('names the file after the view and hands the name back', async () => {
    const filename = await captureScopeMapPdf({
      blocks: onPage(element('scope-map-grid', 2000, 700)),
      view: 'capability',
      filters: EMPTY_FILTERS,
    })

    expect(filename).toBe('vd2-scope-map-by-capability.pdf')
    expect(save).toHaveBeenCalledWith('vd2-scope-map-by-capability.pdf')
  })

  it('refuses an empty capture rather than saving a blank page', async () => {
    await expect(
      captureScopeMapPdf({ blocks: [], view: 'mvp', filters: EMPTY_FILTERS }),
    ).rejects.toThrow('nothing on the map')
    expect(save).not.toHaveBeenCalled()
  })

  it('lets a capture failure through, so the page can report it', async () => {
    html2canvas.mockRejectedValueOnce(new Error('tainted canvas'))
    await expect(
      captureScopeMapPdf({
        blocks: onPage(element('scope-map-grid', 2000, 700)),
        view: 'mvp',
        filters: EMPTY_FILTERS,
      }),
    ).rejects.toThrow('tainted canvas')
    expect(save).not.toHaveBeenCalled()
  })
})

describe('captureScopeMapPdf — the blocks share a width', () => {
  it('stretches a narrower block to the width of the widest', async () => {
    // The legend is a key to the grid under it; narrower, it reads as a
    // separate, smaller picture floating above one.
    const legend = element('scope-chrome__legend', 800, 100)
    const grid = element('scope-map-grid', 2000, 700)

    await captureScopeMapPdf({
      blocks: onPage(legend, grid),
      view: 'mvp',
      filters: EMPTY_FILTERS,
    })

    const clonedLegend = legend.cloneNode(true) as HTMLElement
    const options = html2canvas.mock.calls[0][1] as {
      onclone: (doc: Document, el: HTMLElement) => void
    }
    options.onclone(document.cloneNode(true) as Document, clonedLegend)
    expect(clonedLegend.style.width).toBe('2000px')
  })

  it('leaves the widest block alone', async () => {
    const legend = element('scope-chrome__legend', 800, 100)
    const grid = element('scope-map-grid', 2000, 700)

    await captureScopeMapPdf({
      blocks: onPage(legend, grid),
      view: 'mvp',
      filters: EMPTY_FILTERS,
    })

    const clonedGrid = grid.cloneNode(true) as HTMLElement
    const options = html2canvas.mock.calls[1][1] as {
      onclone: (doc: Document, el: HTMLElement) => void
    }
    options.onclone(document.cloneNode(true) as Document, clonedGrid)
    expect(clonedGrid.style.width).toBe('')
  })

  it('keeps the gap between them tight', async () => {
    // A wide gap reads as two unrelated pictures on one sheet.
    expect(BLOCK_GAP).toBeLessThanOrEqual(3)
  })
})

describe('captureScopeMapPdf — what sits behind each block', () => {
  const backgroundOf = (call: number) =>
    (html2canvas.mock.calls[call][1] as { backgroundColor: string | null }).backgroundColor

  it('fills a text block with the paper colour, so the heading prints without a box', async () => {
    document.body.style.backgroundColor = 'rgb(250, 251, 253)'
    const heading = element('scope-chrome__heading', 400, 90)

    await captureScopeMapPdf({
      blocks: [{ element: heading, background: 'paper' }],
      view: 'mvp',
      filters: EMPTY_FILTERS,
    })

    // White, not the app's tint, and not transparent — jsPDF's handling of
    // alpha is not dependable enough to print a heading on.
    expect(backgroundOf(0)).toBe('rgb(255, 255, 255)')
  })

  it('keeps the page colour behind the legend and the grid', async () => {
    document.body.style.backgroundColor = 'rgb(250, 251, 253)'
    const legend = element('scope-chrome__legend', 800, 100)
    const grid = element('scope-map-grid', 2000, 700)

    await captureScopeMapPdf({
      blocks: onPage(legend, grid),
      view: 'mvp',
      filters: EMPTY_FILTERS,
    })

    // Without it the gaps between the grid's cards come out white, and the
    // map reads as cards floating in nothing.
    expect(backgroundOf(0)).toBe('rgb(250, 251, 253)')
    expect(backgroundOf(1)).toBe('rgb(250, 251, 253)')
  })

  it('decides per block, not per export', async () => {
    document.body.style.backgroundColor = 'rgb(250, 251, 253)'
    const heading = element('scope-chrome__heading', 400, 90)
    const grid = element('scope-map-grid', 2000, 700)

    await captureScopeMapPdf({
      blocks: [
        { element: heading, background: 'paper' },
        { element: grid, background: 'app' },
      ],
      view: 'mvp',
      filters: EMPTY_FILTERS,
    })

    expect(backgroundOf(0)).toBe('rgb(255, 255, 255)')
    expect(backgroundOf(1)).toBe('rgb(250, 251, 253)')
  })
})

describe('captureScopeMapPdf — undoing the screen', () => {
  /** Runs the `onclone` the module passed, against a clone of the page. */
  async function cloneAfterCapture() {
    const grid = element('scope-map-grid', 2000, 700)
    const scaler = document.createElement('div')
    scaler.className = 'scope-map-grid__scaler'
    scaler.style.setProperty('--scope-zoom', '0.6')
    // The scaler is sized to what is painted, so the scroll box matches it.
    scaler.style.width = '1200px'
    scaler.style.height = '420px'
    grid.appendChild(scaler)
    grid.style.overflow = 'auto'

    await captureScopeMapPdf({ blocks: onPage(grid), view: 'mvp', filters: EMPTY_FILTERS })

    const options = html2canvas.mock.calls[0][1] as {
      onclone: (doc: Document, el: HTMLElement) => void
    }
    const cloned = document.cloneNode(true) as Document
    options.onclone(cloned, grid)
    return { cloned, live: { grid, scaler } }
  }

  it('undoes the zoom, so the map is captured whole rather than as drawn', async () => {
    const { cloned } = await cloneAfterCapture()
    const scaler = cloned.querySelector<HTMLElement>('.scope-map-grid__scaler')
    expect(scaler?.style.getPropertyValue('--scope-zoom')).toBe('1')
  })

  it('undoes the scroll box, so nothing off-screen is cropped', async () => {
    const { cloned } = await cloneAfterCapture()
    const grid = cloned.querySelector<HTMLElement>('.scope-map-grid')
    expect(grid?.style.overflow).toBe('visible')
    expect(grid?.style.width).toBe('max-content')
  })

  it('undoes the scaler’s painted size along with the zoom', async () => {
    // Undoing one without the other leaves a box smaller than the content it
    // now renders at full size, and the capture clips the right-hand columns
    // and the bottom rows.
    const { cloned } = await cloneAfterCapture()
    const scaler = cloned.querySelector<HTMLElement>('.scope-map-grid__scaler')
    expect(scaler?.style.width).toBe('max-content')
    expect(scaler?.style.height).toBe('auto')
  })

  it('leaves the live page exactly as it was, so nothing flickers', async () => {
    const { live } = await cloneAfterCapture()
    expect(live.scaler.style.getPropertyValue('--scope-zoom')).toBe('0.6')
    expect(live.scaler.style.width).toBe('1200px')
    expect(live.scaler.style.height).toBe('420px')
    expect(live.grid.style.overflow).toBe('auto')
  })
})
