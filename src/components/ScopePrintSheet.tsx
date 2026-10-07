import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { PRINT_MARGIN, PRINT_PAGE, fitScale, pageHeightMm, printableArea, scaledSize } from '@/lib/scope-print'

export type ScopePrintSheetProps = {
  /** The map's own title, repeated on paper so the sheet stands alone. */
  title: string
  /** Which view the sheet was taken from, in the map's words. */
  subtitle: string
  /** The narrowing and the date — what a reader needs to trust the sheet. */
  meta?: ReactNode
  /** The key to the cards. Printed above the map, as it is on screen. */
  legend?: ReactNode
  /** The map itself, at its natural size — this component scales it. */
  children: ReactNode
  /** The sheet element, for the export that writes it to a PDF as drawn. */
  sheetRef?: React.Ref<HTMLElement>
}

/**
 * One sheet of paper with the map on it.
 *
 * The browser prints this page directly, so the text comes out as text
 * rather than as a picture of text: selectable, searchable, and sharp at any
 * size. The only thing a browser will not do by itself is shrink a grid
 * wider than the paper, so the map is measured and scaled to fit — once on
 * mount, again whenever it resizes, and again just before printing, because
 * a print dialog can change the page box under us.
 */
export function ScopePrintSheet({
  title,
  subtitle,
  meta,
  legend,
  children,
  sheetRef,
}: ScopePrintSheetProps) {
  const headerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [natural, setNatural] = useState({ width: 0, height: 0 })
  const [headerHeight, setHeaderHeight] = useState(0)

  const measure = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    // The grid is a scroll box around the table; the table is what prints,
    // so that is what gets measured. Same rule as the PDF capture.
    const table = map.querySelector<HTMLElement>('.scope-map-grid__table')
    const size = table
      ? { width: table.offsetWidth, height: table.offsetHeight }
      : { width: map.scrollWidth, height: map.scrollHeight }
    if (size.width <= 0 || size.height <= 0) return

    setNatural(size)
    setScale(fitScale(size, printableArea()))
    setHeaderHeight(headerRef.current?.offsetHeight ?? 0)
  }, [])

  useLayoutEffect(() => {
    measure()
    const map = mapRef.current
    if (!map) return
    const observer = new ResizeObserver(() => measure())
    observer.observe(map)
    return () => observer.disconnect()
  }, [measure, children])

  useEffect(() => {
    // Safari and Firefox lay the page out again when the dialog opens, and
    // `print()` is synchronous, so the measurement has to be current before
    // the dialog appears rather than after it.
    const onBeforePrint = () => measure()
    window.addEventListener('beforeprint', onBeforePrint)
    return () => window.removeEventListener('beforeprint', onBeforePrint)
  }, [measure])

  const painted = scaledSize(natural, scale)

  /**
   * The page is cut to the sheet, not the sheet squeezed onto the page: the
   * map fills the width, and the paper is however long that makes it. The
   * header is printed at full size — shrinking the title along with the map
   * would leave a dense sheet with an unreadable heading — so its height is
   * added rather than taken off what the map may use.
   */
  const pageHeight = pageHeightMm(painted.height + headerHeight)

  return (
    <article ref={sheetRef} className="print-sheet" style={{ ['--print-sheet-height' as string]: `${pageHeight}mm` }}>
      {/* `@page` reads no custom property and cannot be written in the
          stylesheet, because the height is whatever this map turned out to
          need. The rule is emitted here instead, and goes with the page. */}
      <style>{`@page { size: ${PRINT_PAGE.width}mm ${pageHeight}mm; margin: ${PRINT_MARGIN}mm; }`}</style>
      <div className="print-sheet__header" ref={headerRef}>
        <h1 className="print-sheet__title">{title}</h1>
        <p className="print-sheet__subtitle">{subtitle}</p>
        {meta ? <p className="print-sheet__meta">{meta}</p> : null}
        {legend ? <div className="print-sheet__legend">{legend}</div> : null}
      </div>

      {/* The outer element holds the space the scaled map actually takes: a
          transform paints smaller but leaves the layout box at natural size,
          which would push blank paper onto a second page. */}
      <div
        className="print-sheet__map"
        style={
          natural.width > 0
            ? { width: `${painted.width}px`, height: `${painted.height}px` }
            : undefined
        }
      >
        <div
          className="print-sheet__map-inner"
          ref={mapRef}
          style={{ transform: `scale(${scale})` }}
        >
          {children}
        </div>
      </div>
    </article>
  )
}
