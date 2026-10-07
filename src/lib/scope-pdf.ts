import type { ViewMode } from '@/lib/scope-derive'
import { PX_PER_MM } from '@/lib/scope-print'
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
/**
 * Between the legend and the grid, in millimetres. Deliberately tight: the
 * legend is a key to the grid directly under it, and a wide gap reads as two
 * unrelated pictures on one sheet.
 */
export const BLOCK_GAP = 2

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
  const measured = measureStack(blocks, page, margin, gap)
  if (!measured) return []

  const { usable, scale, stackHeight } = measured
  const availableWidth = page.width - margin * 2

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
 * The scale the stack fits at, and the size it occupies at that scale.
 *
 * Shared by `fitBlocks` and `pageFor` so the two cannot disagree about how
 * big the map comes out — the page is trimmed to exactly what gets drawn on
 * it, which only holds while both read the same number.
 */
function measureStack(
  blocks: BlockSize[],
  page: BlockSize,
  margin: number,
  gap: number,
): { usable: BlockSize[]; scale: number; stackWidth: number; stackHeight: number } | null {
  const usable = blocks.filter((block) => block.width > 0 && block.height > 0)
  if (usable.length === 0) return null

  const availableWidth = page.width - margin * 2
  const availableHeight = page.height - margin * 2 - gap * (usable.length - 1)
  if (availableWidth <= 0 || availableHeight <= 0) return null

  const naturalWidth = Math.max(...usable.map((block) => block.width))
  const naturalHeight = usable.reduce((total, block) => total + block.height, 0)

  // Never scale up: a small map blown out to fill A3 just looks broken.
  const scale = Math.min(availableWidth / naturalWidth, availableHeight / naturalHeight, 1)

  return {
    usable,
    scale,
    stackWidth: naturalWidth * scale,
    stackHeight:
      usable.reduce((total, block) => total + block.height * scale, 0) +
      gap * (usable.length - 1),
  }
}

/**
 * The sheet to print on: A3 landscape, trimmed to what the map actually
 * fills.
 *
 * A3 landscape stays the ceiling — the scale is still worked out against it,
 * so nothing comes out smaller than it used to. What changes is the paper
 * left over around the result. A map taller than the sheet is wide fits by
 * its height and leaves barely half the width used, which prints as a column
 * of cards stranded in the middle of a landscape sheet; trimming the page to
 * the stack takes that away and leaves the margin, and no more, on all four
 * sides. A trimmed page still prints to A3 — the printer scales it to fit —
 * and it drops straight into a deck or onto a wall without cropping by hand.
 */
export function pageFor(
  blocks: BlockSize[],
  page: BlockSize = PAGE,
  margin = PAGE_MARGIN,
  gap = BLOCK_GAP,
): BlockSize {
  const measured = measureStack(blocks, page, margin, gap)
  if (!measured) return page

  return {
    width: measured.stackWidth + margin * 2,
    height: measured.stackHeight + margin * 2,
  }
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

/**
 * The orientation to declare for a page of this shape.
 *
 * Not cosmetic, and not optional: jsPDF *swaps* the two numbers it is given
 * whenever they disagree with the orientation — a portrait document hands
 * back `[short, long]` however the format was written. Leaving it to the
 * default therefore turned a wide trimmed page on its side, and the map was
 * drawn past the right-hand edge and lost its last columns. Stating the
 * orientation the page already has makes that swap a no-op.
 */
export const orientationFor = (page: BlockSize): 'landscape' | 'portrait' =>
  page.width >= page.height ? 'landscape' : 'portrait'

/** `vd2-scope-map-by-msd-feature.pdf`, marked when filters narrowed it. */
export const pdfFilenameFor = (view: ViewMode, filters: FilterState) =>
  `vd2-scope-map-${SCOPE_VIEW_SLUG[view]}${isEmpty(filters) ? '' : '-filtered'}.pdf`

/**
 * The sheet's own colour. jsPDF pages are white, so a block filled with this
 * has no visible edge — it prints as words on paper.
 *
 * White rather than a transparent canvas on purpose. jsPDF's own image path
 * falls back to white for transparency in some cases and to black in others,
 * so alpha here would be a coin toss; filling with the paper colour reaches
 * the same picture by a route that cannot go wrong.
 */
const PAPER = 'rgb(255, 255, 255)'

export type CaptureBlock = {
  element: HTMLElement
  /**
   * What fills the canvas behind the element.
   *
   * `app` paints the app's own page colour. The legend and the grid both
   * need it: the legend's swatches and the grid's cards are drawn against
   * that tint, and the gaps between the grid's cards *are* the tint, so on
   * white the map comes out as cards floating in nothing.
   *
   * `paper` fills it with the sheet colour instead, for a block that is only
   * text. The app's page colour behind a heading has nothing to sit against
   * — it just prints a filled rectangle around the words, which reads as a
   * container the heading does not have.
   */
  background: 'app' | 'paper'
}

export type CaptureInput = {
  /** In the order they should stack on the page, top first. */
  blocks: CaptureBlock[]
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
  const { blocks, view, filters } = input
  if (blocks.length === 0) throw new Error('There is nothing on the map to export.')

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas-pro'),
    import('jspdf'),
  ])

  // The page's own background, so the render matches the theme in use
  // rather than assuming a light one.
  const background =
    getComputedStyle(document.body).backgroundColor || 'rgb(255, 255, 255)'

  // Measured up front so every block can be captured at the width of the
  // widest one — the legend is a key to the grid, and a key narrower than
  // what it explains reads as a separate, smaller picture. Stretching it in
  // the clone lets it fill the width at its own type size, rather than being
  // scaled up to fit and ending up larger than the grid it labels.
  const sizes = blocks.map((block) => naturalSize(block.element))
  const targetWidth = Math.max(...sizes.map((size) => size.width))

  const canvases = []
  for (const [index, block] of blocks.entries()) {
    const element = block.element
    const size = { width: targetWidth, height: sizes[index].height }
    canvases.push(
      await html2canvas(element, {
        backgroundColor: block.background === 'app' ? background : PAPER,
        scale: captureScale(size, window.devicePixelRatio),
        logging: false,
        // The grid is zoomable and scrolls inside its own box. Both are
        // properties of the screen, not of the map, so they are undone in
        // the clone — the live DOM is never touched and nothing flickers.
        onclone: (cloned: Document, clonedElement: HTMLElement) => {
          // Equal widths also align the blocks on the page, since each is
          // centred in the same usable column.
          if (sizes[index].width < targetWidth) {
            clonedElement.style.width = `${targetWidth}px`
          }
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

  const canvasSizes = canvases.map((canvas) => ({
    width: canvas.width,
    height: canvas.height,
  }))
  // The page is trimmed to the map before anything is placed on it, so the
  // sheet is the picture rather than the picture adrift on a sheet.
  const page = pageFor(canvasSizes)
  const placements = fitBlocks(canvasSizes, page)

  const pdf = new jsPDF({
    orientation: orientationFor(page),
    unit: 'mm',
    format: [page.width, page.height],
  })
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

export type SheetCapture = {
  /** The laid-out sheet, exactly as it appears on screen. */
  element: HTMLElement
  view: ViewMode
  filters: FilterState
}

/**
 * The print sheet, written straight to a PDF the size of itself.
 *
 * The browser's own print path produces vector text, but what it produces is
 * decided by the print dialog: a sheet longer than the chosen paper comes
 * back sliced across pages, with rows cut through at the boundary. This
 * route takes the decision away from the dialog — one page, exactly the
 * sheet's own dimensions, exactly the picture on screen. The text is an
 * image rather than selectable text; that is the trade for a file that
 * cannot come out different from the preview.
 *
 * The element is measured and the size handed to `html2canvas` explicitly.
 * Left to itself it sizes the canvas from the live layout box, which is how
 * the old export silently cropped the right-hand columns and bottom rows.
 */
export async function captureSheetPdf({
  element,
  view,
  filters,
}: SheetCapture): Promise<string> {
  const width = Math.max(element.offsetWidth, element.scrollWidth)
  const height = Math.max(element.offsetHeight, element.scrollHeight)
  if (width <= 0 || height <= 0) throw new Error('There is nothing on the sheet to export.')

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas-pro'),
    import('jspdf'),
  ])

  const background = getComputedStyle(element).backgroundColor || PAPER

  const canvas = await html2canvas(element, {
    backgroundColor: background,
    scale: captureScale({ width, height }, window.devicePixelRatio),
    logging: false,
    width,
    height,
    onclone: (_cloned: Document, clone: HTMLElement) => {
      // The sheet is shown as paper on screen — edged, rounded and lifted
      // off a grey backdrop. On the page it *is* the paper, so the frame
      // around it would print as a box drawn on the sheet.
      clone.style.border = 'none'
      clone.style.borderRadius = '0'
      clone.style.boxShadow = 'none'
      clone.style.margin = '0'
    },
  })

  // The page is the sheet: same proportions, same scale, nothing to fit.
  const page = { width: width / PX_PER_MM, height: height / PX_PER_MM }
  const pdf = new jsPDF({
    orientation: orientationFor(page),
    unit: 'mm',
    format: [page.width, page.height],
  })
  pdf.addImage(canvas, 'PNG', 0, 0, page.width, page.height, undefined, 'FAST')

  const filename = pdfFilenameFor(view, filters)
  pdf.save(filename)
  return filename
}

/**
 * The size this element will actually be captured at.
 *
 * The grid is a scroll box around a scaled map, so its own dimensions are
 * the viewport onto the map rather than the map — at fit zoom they are just
 * the window width. The table inside is what the capture renders, at its
 * full unscaled size, so that is what gets measured.
 */
function naturalSize(element: HTMLElement): BlockSize {
  const table = element.querySelector<HTMLElement>('.scope-map-grid__table')
  if (table) return { width: table.offsetWidth, height: table.offsetHeight }
  return {
    width: Math.max(element.offsetWidth, element.scrollWidth),
    height: Math.max(element.offsetHeight, element.scrollHeight),
  }
}
