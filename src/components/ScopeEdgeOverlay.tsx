import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import type { ScopeEdge } from '@/lib/scope-edges'

export type ScopeEdgeOverlayProps = {
  /** The grid element the cards are laid out inside. */
  container: HTMLElement | null
  edges: ScopeEdge[]
  /** Redraw when the layout could have changed. */
  layoutKey: string
}

type Box = { x: number; y: number; width: number; height: number }

/**
 * Draws edges between cards as an SVG overlay on the grid — no graph library
 * (PRD §12).
 *
 * Geometry comes from offsetLeft/offsetTop, which are layout values in
 * unscaled CSS pixels. The grid is zoomed with a CSS transform, and a
 * transform does not affect those, so the overlay scales with the grid for
 * free and the coordinates stay correct at any zoom.
 */
export function ScopeEdgeOverlay({ container, edges, layoutKey }: ScopeEdgeOverlayProps) {
  const [boxes, setBoxes] = useState<Map<string, Box>>(new Map())
  const [size, setSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  })

  const measure = useCallback(() => {
    if (!container) return
    const next = new Map<string, Box>()
    for (const node of container.querySelectorAll<HTMLElement>('[data-feature-id]')) {
      const id = node.dataset.featureId
      if (!id) continue
      next.set(id, {
        x: node.offsetLeft,
        y: node.offsetTop,
        width: node.offsetWidth,
        height: node.offsetHeight,
      })
    }
    setBoxes(next)
    setSize({ width: container.offsetWidth, height: container.offsetHeight })
  }, [container])

  useLayoutEffect(() => {
    // Measuring the laid-out DOM and storing the result is exactly what
    // useLayoutEffect is for; there is no way to know a card's position
    // during render. The rule is a heuristic against cascading renders, and
    // this runs once per layout change, before paint.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    measure()
  }, [measure, layoutKey])

  useEffect(() => {
    if (!container) return
    // Filtering, editing and window resizes all reflow the grid.
    const observer = new ResizeObserver(() => measure())
    observer.observe(container)
    return () => observer.disconnect()
  }, [container, measure])

  if (edges.length === 0 || boxes.size === 0) return null

  const drawn = edges
    .map((edge) => {
      const from = boxes.get(edge.fromId)
      const to = boxes.get(edge.toId)
      if (!from || !to) return null
      return { edge, from, to }
    })
    .filter((value): value is { edge: ScopeEdge; from: Box; to: Box } => value !== null)

  if (drawn.length === 0) return null

  return (
    <svg
      className="scope-edges"
      width={size.width}
      height={size.height}
      viewBox={`0 0 ${size.width} ${size.height}`}
      aria-hidden="true"
      focusable="false"
    >
      {drawn.map(({ edge, from, to }) => {
        const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 }
        const end = { x: to.x + to.width / 2, y: to.y + to.height / 2 }
        // A gentle horizontal curve reads better than a straight line across
        // a dense grid, and keeps the label off the cards.
        const dx = Math.abs(end.x - start.x)
        const bend = Math.max(24, Math.min(dx * 0.4, 120))
        const path = `M ${start.x} ${start.y} C ${start.x + bend} ${start.y}, ${
          end.x - bend
        } ${end.y}, ${end.x} ${end.y}`
        const midX = (start.x + end.x) / 2
        const midY = (start.y + end.y) / 2
        const label = edge.sharedRefs.join(', ')
        const labelWidth = Math.max(22, label.length * 6 + 8)
        const lineClass = edge.crossesRelease
          ? 'scope-edges__line scope-edges__line--cross-release'
          : 'scope-edges__line'

        return (
          <g key={edge.id}>
            {/* A background-coloured halo keeps the line readable where it
                crosses a card. */}
            <path className="scope-edges__halo" d={path} />
            <path className={lineClass} d={path} />
            <circle
              className={`scope-edges__endpoint${
                edge.crossesRelease ? ' scope-edges__endpoint--cross-release' : ''
              }`}
              cx={start.x}
              cy={start.y}
              r={3}
            />
            <circle
              className={`scope-edges__endpoint${
                edge.crossesRelease ? ' scope-edges__endpoint--cross-release' : ''
              }`}
              cx={end.x}
              cy={end.y}
              r={3}
            />
            <rect
              className="scope-edges__label-box"
              x={midX - labelWidth / 2}
              y={midY - 8}
              width={labelWidth}
              height={16}
            />
            <text className="scope-edges__label-text" x={midX} y={midY + 1}>
              {label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
