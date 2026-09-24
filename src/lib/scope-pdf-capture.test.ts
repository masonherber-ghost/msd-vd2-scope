import { beforeEach, describe, expect, it, vi } from 'vitest'
import { captureScopeMapPdf } from '@/lib/scope-pdf'
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
      elements: [legend, grid],
      view: 'mvp',
      filters: EMPTY_FILTERS,
    })

    expect(html2canvas).toHaveBeenCalledTimes(2)
    expect(html2canvas.mock.calls[0][0]).toBe(legend)
    expect(html2canvas.mock.calls[1][0]).toBe(grid)
  })

  it('saves one landscape A3 page', async () => {
    await captureScopeMapPdf({
      elements: [element('scope-map-grid', 2000, 700)],
      view: 'release',
      filters: EMPTY_FILTERS,
    })

    expect(jsPDFArgs[0]).toMatchObject({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a3',
    })
    expect(addImage).toHaveBeenCalledTimes(1)
  })

  it('compresses the bitmap, so the file is sendable', async () => {
    // jsPDF stores a canvas raw by default: a full map comes out around
    // 35MB instead of under one.
    await captureScopeMapPdf({
      elements: [element('scope-map-grid', 2000, 700)],
      view: 'release',
      filters: EMPTY_FILTERS,
    })

    expect(addImage.mock.calls[0][1]).toBe('PNG')
    expect(addImage.mock.calls[0][7]).toBe('FAST')
  })

  it('names the file after the view and hands the name back', async () => {
    const filename = await captureScopeMapPdf({
      elements: [element('scope-map-grid', 2000, 700)],
      view: 'capability',
      filters: EMPTY_FILTERS,
    })

    expect(filename).toBe('vd2-scope-map-by-capability.pdf')
    expect(save).toHaveBeenCalledWith('vd2-scope-map-by-capability.pdf')
  })

  it('refuses an empty capture rather than saving a blank page', async () => {
    await expect(
      captureScopeMapPdf({ elements: [], view: 'mvp', filters: EMPTY_FILTERS }),
    ).rejects.toThrow('nothing on the map')
    expect(save).not.toHaveBeenCalled()
  })

  it('lets a capture failure through, so the page can report it', async () => {
    html2canvas.mockRejectedValueOnce(new Error('tainted canvas'))
    await expect(
      captureScopeMapPdf({
        elements: [element('scope-map-grid', 2000, 700)],
        view: 'mvp',
        filters: EMPTY_FILTERS,
      }),
    ).rejects.toThrow('tainted canvas')
    expect(save).not.toHaveBeenCalled()
  })
})

describe('captureScopeMapPdf — undoing the screen', () => {
  /** Runs the `onclone` the module passed, against a clone of the page. */
  async function cloneAfterCapture() {
    const grid = element('scope-map-grid', 2000, 700)
    const scaler = document.createElement('div')
    scaler.className = 'scope-map-grid__scaler'
    scaler.style.setProperty('--scope-zoom', '0.6')
    grid.appendChild(scaler)
    grid.style.overflow = 'auto'

    await captureScopeMapPdf({ elements: [grid], view: 'mvp', filters: EMPTY_FILTERS })

    const options = html2canvas.mock.calls[0][1] as {
      onclone: (doc: Document) => void
    }
    const cloned = document.cloneNode(true) as Document
    options.onclone(cloned)
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

  it('leaves the live page exactly as it was, so nothing flickers', async () => {
    const { live } = await cloneAfterCapture()
    expect(live.scaler.style.getPropertyValue('--scope-zoom')).toBe('0.6')
    expect(live.grid.style.overflow).toBe('auto')
  })
})
