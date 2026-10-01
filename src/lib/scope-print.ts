/**
 * The map on paper.
 *
 * The PDF export rasterises the live DOM; this is the other route — the page
 * itself laid out for a sheet, printed by the browser. What comes out is
 * vector: the text stays selectable and sharp at any zoom, and nothing is
 * limited by how big a canvas the browser will allocate.
 *
 * The browser decides pagination from `@page`; the one thing it will not do
 * is shrink a too-wide grid to fit, so that scale is worked out here. It is
 * pure arithmetic, deliberately kept out of the component: a map printed at
 * the wrong scale is cropped at the edge, which nobody notices until it is
 * on a wall.
 */

/** Millimetres. A3 landscape — the widest standard paper an office prints. */
export const PRINT_PAGE = { width: 420, height: 297 } as const

/** Millimetres, matching the `@page` margin in `ScopePrintSheet.css`. */
export const PRINT_MARGIN = 10

/**
 * CSS pixels per millimetre at the 96dpi the print box is measured in. A
 * printer's own dots never enter into it — the browser lays the page out in
 * CSS pixels and scales the result to whatever it is printing on.
 */
export const PX_PER_MM = 96 / 25.4

export type Size = { width: number; height: number }

/** The printable box inside the margins, in CSS pixels. */
export function printableArea(
  page: Size = PRINT_PAGE,
  margin = PRINT_MARGIN,
): Size {
  return {
    width: Math.max(page.width - margin * 2, 0) * PX_PER_MM,
    height: Math.max(page.height - margin * 2, 0) * PX_PER_MM,
  }
}

/**
 * How far a narrow map may be blown up to fill the sheet's width. A filtered
 * map of one package should still use the paper; ten times its own size is
 * no longer a scope map, it is a poster of three cards.
 */
export const MAX_UPSCALE = 2

/**
 * The factor the map is scaled by: the sheet's width, filled.
 *
 * Width alone, not width-and-height. Fitting both put a tall map — which is
 * most of them, once every package has a row — on screen at a third of the
 * sheet's width with the rest of the paper blank, because the height ran out
 * first and the map was shrunk to suit. The page grows downwards instead
 * (`pageHeightMm`), which costs paper but nothing else; a map scaled to the
 * point of illegibility costs the whole artefact.
 *
 * Returns 1 for anything unmeasured, so a sheet renders at natural size
 * rather than collapsing to nothing while the layout settles.
 */
export function fitScale(natural: Size, available: Size = printableArea()): number {
  if (natural.width <= 0 || natural.height <= 0) return 1
  if (available.width <= 0) return 1
  return Math.min(available.width / natural.width, MAX_UPSCALE)
}

/**
 * The height of sheet this content needs, in millimetres, including both
 * margins — the number that goes into `@page size`.
 *
 * The page is as tall as the map rather than the map as short as the page.
 * A3 landscape stays the width, so the sheet prints to A3 by scaling if it
 * goes on real paper, and reads as one continuous picture as a PDF.
 */
export function pageHeightMm(
  contentHeightPx: number,
  page: Size = PRINT_PAGE,
  margin = PRINT_MARGIN,
): number {
  const needed = contentHeightPx / PX_PER_MM + margin * 2
  // Never shorter than the sheet it is based on: a two-card map on a 40mm
  // strip of paper is not a sheet anyone can file.
  return Math.max(Math.ceil(needed), page.height)
}

/**
 * The box a scaled block occupies once printed.
 *
 * A CSS transform paints smaller but leaves the layout box at natural size,
 * so without this the sheet reserves room for the unscaled map and pushes
 * blank paper out into a second page.
 */
export const scaledSize = (natural: Size, scale: number): Size => ({
  width: natural.width * scale,
  height: natural.height * scale,
})
