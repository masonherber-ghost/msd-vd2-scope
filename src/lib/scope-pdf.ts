import type { ViewMode } from '@/lib/scope-derive'
import { SCOPE_VIEW_SLUG } from '@/lib/scope-export'
import { isEmpty, type FilterState } from '@/lib/scope-filters'

/**
 * The map as a picture.
 *
 * The Markdown export answers "what is in scope"; this one answers "what
 * does the map look like", which is the artefact that goes into a deck or a
 * wall. It is a render of the live DOM, so what comes out is the view as
 * drawn — zoom and scroll position excepted, which are properties of the
 * screen rather than of the map.
 *
 * Everything that touches a canvas lives behind `captureScopeMapPdf`; the
 * geometry above it is pure, because fitting a very wide grid onto a page is
 * the part that can be wrong in ways nobody notices until it prints.
 */

/** Millimetres. A3 landscape: the widest standard paper an office prints. */
export const PAGE = { width: 420, height: 297 } as const
export const PAGE_MARGIN = 12
/** Between the legend and the grid, in millimetres. */
export const BLOCK_GAP = 6

/**
 * Canvases get expensive fast — the grid is a few thousand pixels wide
 * before any oversampling. Rendering above device scale buys nothing once
 * the whole map is scaled down onto one page, so the multiplier is capped
 * and then reduced further if it would blow past this.
 */
export const MAX_CANVAS_EDGE = 6000

export type BlockSize = { width: number; height: number }
export type PlacedBlock = { x: number; y: number; width: number; height: number }

/**
 * Stacks the blocks down the page and scales them **together** to fit.
 *
 * One shared scale, not one per block: the legend is a key to the grid, so
 * the two have to stay in proportion or the swatches stop matching the cards
 * they explain. The stack is centred on both axes, which is what keeps a
 * short map from sitting in the top-left corner of a big sheet.
 */
export function fitBlocks(
  blocks: BlockSize[],
  page: BlockSize = PAGE,
  margin = PAGE_MARGIN,
  gap = BLOCK_GAP,
): PlacedBlock[] {
  const usable = blocks.filter((block) => block.width > 0 && block.height > 0)
  if (usable.length === 0) return []

  const availableWidth = page.width - margin * 2
  const availableHeight = page.height - margin * 2 - gap * (usable.length - 1)
  if (availableWidth <= 0 || availableHeight <= 0) return []

  const naturalWidth = Math.max(...usable.map((block) => block.width))
  const naturalHeight = usable.reduce((total, block) => total + block.height, 0)

  // Never scale up: a small map blown out to fill A3 just looks broken.
  const scale = Math.min(availableWidth / naturalWidth, availableHeight / naturalHeight, 1)

  const stackHeight =
    usable.reduce((total, block) => total + block.height * scale, 0) +
    gap * (usable.length - 1)

  let y = margin + (page.height - margin * 2 - stackHeight) / 2

  return usable.map((block) => {
    const width = block.width * scale
    const height = block.height * scale
    const placed = {
      x: margin + (availableWidth - width) / 2,
      y,
      width,
      height,
    }
    y += height + gap
    return placed
  })
}

/**
 * The oversampling factor for a capture, reduced until the biggest canvas
 * edge stays under the cap. Returns at least 1, so a grid wider than the cap
 * still renders rather than failing.
 */
export function captureScale(
  size: BlockSize,
  devicePixelRatio = 1,
  maxEdge = MAX_CANVAS_EDGE,
): number {
  const longest = Math.max(size.width, size.height)
  if (longest <= 0) return 1
  const wanted = Math.min(Math.max(devicePixelRatio, 1), 2)
  return Math.max(Math.min(wanted, maxEdge / longest), 1)
}

/** `vd2-scope-map-by-msd-feature.pdf`, marked when filters narrowed it. */
export const pdfFilenameFor = (view: ViewMode, filters: FilterState) =>
  `vd2-scope-map-${SCOPE_VIEW_SLUG[view]}${isEmpty(filters) ? '' : '-filtered'}.pdf`

export type CaptureInput = {
  /** In the order they should stack on the page, top first. */
  elements: HTMLElement[]
  view: ViewMode
  filters: FilterState
}

/**
 * Renders the given elements and saves them as one landscape page.
 *
 * `html2canvas-pro`, not `html2canvas`: every colour in this app is
 * `oklch()` and the original parser throws on it.
 *
 * Both libraries are imported dynamically. Together they are around a
 * megabyte, and nobody pays for that until they ask for a PDF.
 */
export async function captureScopeMapPdf(input: CaptureInput): Promise<string> {
  const { elements, view, filters } = input
  if (elements.length === 0) throw new Error('There is nothing on the map to export.')

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas-pro'),
    import('jspdf'),
  ])

  // The page's own background, so the render matches the theme in use
  // rather than assuming a light one.
  const background =
    getComputedStyle(document.body).backgroundColor || 'rgb(255, 255, 255)'

  const canvases = []
  for (const element of elements) {
    const size = naturalSize(element)
    canvases.push(
      await html2canvas(element, {
        backgroundColor: background,
        scale: captureScale(size, window.devicePixelRatio),
        logging: false,
        // The grid is zoomable and scrolls inside its own box. Both are
        // properties of the screen, not of the map, so they are undone in
        // the clone — the live DOM is never touched and nothing flickers.
        onclone: (cloned: Document) => {
          cloned.querySelectorAll<HTMLElement>('.scope-map-grid').forEach((node) => {
            node.style.overflow = 'visible'
            node.style.width = 'max-content'
          })
          cloned
            .querySelectorAll<HTMLElement>('.scope-map-grid__scaler')
            .forEach((node) => {
              node.style.setProperty('--scope-zoom', '1')
              // The scaler carries an inline `natural × zoom` size so the
              // scroll box matches what is painted. Undoing the zoom without
              // undoing that leaves a box smaller than the content it now
              // renders at full size, and the capture clips the right-hand
              // columns and the bottom rows.
              node.style.width = 'max-content'
              node.style.height = 'auto'
            })
        },
      }),
    )
  }

  const placements = fitBlocks(
    canvases.map((canvas) => ({ width: canvas.width, height: canvas.height })),
  )

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' })
  canvases.forEach((canvas, index) => {
    const placed = placements[index]
    if (!placed) return
    // `FAST` is deflate. Without it jsPDF stores the bitmap raw and a full
    // map comes out around 35MB — too big to send, for no gain. Deflate is
    // lossless, so the text stays crisp, and costs about 60ms.
    pdf.addImage(
      canvas,
      'PNG',
      placed.x,
      placed.y,
      placed.width,
      placed.height,
      undefined,
      'FAST',
    )
  })

  const filename = pdfFilenameFor(view, filters)
  pdf.save(filename)
  return filename
}

/**
 * The element's laid-out size, ignoring any CSS transform above it —
 * `offsetWidth` is a layout value, so a zoomed grid still reports the size
 * it will be captured at.
 */
function naturalSize(element: HTMLElement): BlockSize {
  return {
    width: Math.max(element.offsetWidth, element.scrollWidth),
    height: Math.max(element.offsetHeight, element.scrollHeight),
  }
}
