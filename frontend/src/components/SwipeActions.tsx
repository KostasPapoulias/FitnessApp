import { ReactNode, useRef, useState } from 'react'

/**
 * A row that reveals an action when dragged sideways (pointer events, so it
 * works with mouse, touch and pen). All gesture state lives in refs. The root
 * carries `data-no-page-swipe`, so AppLayout's page swipe ignores the gesture.
 */

/** Reveal distance and button width; `compact` is for short rows (icon only). */
const REVEAL_FULL_PX = 72
const REVEAL_COMPACT_PX = 56
/** Movement below this is a wobbly tap, not a swipe. */
const DEAD_ZONE_PX = 8

export interface SwipeAction {
  label: string
  icon: React.ReactNode
  onSelect: () => void
  /** Red for destructive actions. */
  tone?: 'danger' | 'neutral'
}

/** Sides are named for where the button sits; swiping the row left reveals the right one. */
interface Props {
  children: ReactNode
  /** On the left edge. Revealed by swiping RIGHT. */
  left?: SwipeAction
  /** On the right edge. Revealed by swiping LEFT. */
  right?: SwipeAction
  /** For short rows: a narrower reveal showing the icon alone. */
  compact?: boolean
}

export default function SwipeActions({ children, left, right, compact }: Props) {
  const REVEAL_PX = compact ? REVEAL_COMPACT_PX : REVEAL_FULL_PX
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  /**
   * The uncovered side, or null. Nothing is rendered behind a closed row (it
   * left a hairline at the edges). Cleared on transitionend, so the button stays
   * visible while the row slides back.
   */
  const [side, setSide] = useState<'left' | 'right' | null>(null)

  const start = useRef({ x: 0, y: 0 })
  /** Null until the direction is known; 'y' means the list is scrolling. */
  const axis = useRef<'x' | 'y' | null>(null)
  const active = useRef(false)
  /** Live offset (the state above lags it). */
  const live = useRef(0)
  /** Resting offset between gestures. */
  const resting = useRef(0)
  /** Swallows the click that ends a drag. */
  const swallowClick = useRef(false)

  const settled = offset <= -REVEAL_PX ? -REVEAL_PX
    : offset >= REVEAL_PX ? REVEAL_PX
    : 0

  const apply = (v: number) => {
    live.current = v
    setOffset(v)
    if (v > 0) setSide('left')
    else if (v < 0) setSide('right')
  }
  const close = () => { resting.current = 0; apply(0) }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only the primary mouse button
    if (e.pointerType === 'mouse' && e.button !== 0) return
    start.current = { x: e.clientX, y: e.clientY }
    axis.current = null
    active.current = true
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!active.current) return

    const dx = e.clientX - start.current.x
    const dy = e.clientY - start.current.y

    if (axis.current === null) {
      if (Math.abs(dx) < DEAD_ZONE_PX && Math.abs(dy) < DEAD_ZONE_PX) return
      axis.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      if (axis.current === 'y') {
        // Vertical scroll: bow out for the rest of the gesture
        active.current = false
        return
      }
      // Capture only once the gesture is ours, so moves keep arriving off the row
      e.currentTarget.setPointerCapture(e.pointerId)
      swallowClick.current = true
      setDragging(true)
    }

    let next = resting.current + dx
    // A side with no action does not move
    if (next < 0 && !right) next = 0
    if (next > 0 && !left) next = 0

    // Resist past the reveal point
    apply(Math.abs(next) > REVEAL_PX
      ? Math.sign(next) * (REVEAL_PX + (Math.abs(next) - REVEAL_PX) * 0.25)
      : next)
  }

  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const wasHorizontal = active.current && axis.current === 'x'
    active.current = false
    axis.current = null

    if (!wasHorizontal) return

    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    setDragging(false)

    const to = live.current <= -REVEAL_PX ? -REVEAL_PX
      : live.current >= REVEAL_PX ? REVEAL_PX
      : 0
    resting.current = to
    apply(to)
  }

  return (
    // `data-no-page-swipe`: AppLayout leaves this gesture alone
    <div
      className={`relative overflow-hidden ${compact ? 'rounded-lg' : 'rounded-card'}`}
      data-no-page-swipe
    >

      {/* Actions behind the row, reachable only once it has moved */}
      {left && side === 'left' && (
        <button
          onClick={() => { left.onSelect(); close() }}
          aria-hidden={settled !== REVEAL_PX}
          tabIndex={settled === REVEAL_PX ? 0 : -1}
          aria-label={left.label}
          style={{ width: REVEAL_PX }}
          className={`absolute inset-y-0 left-0 text-white text-xs font-semibold
                      flex flex-col items-center justify-center gap-1
                      ${left.tone === 'danger' ? 'bg-brand-red' : 'bg-dark-600'}`}
        >
          <span className="text-base leading-none">{left.icon}</span>
          {!compact && left.label}
        </button>
      )}

      {right && side === 'right' && (
        <button
          onClick={() => { right.onSelect(); close() }}
          aria-hidden={settled !== -REVEAL_PX}
          tabIndex={settled === -REVEAL_PX ? 0 : -1}
          aria-label={right.label}
          style={{ width: REVEAL_PX }}
          className={`absolute inset-y-0 right-0 text-white text-xs font-semibold
                      flex flex-col items-center justify-center gap-1
                      ${right.tone === 'danger' ? 'bg-brand-red' : 'bg-dark-600'}`}
        >
          <span className="text-base leading-none">{right.icon}</span>
          {!compact && right.label}
        </button>
      )}

      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onTransitionEnd={() => { if (live.current === 0) setSide(null) }}
        // Tapping an open row closes it (and the click ending a drag is swallowed)
        onClickCapture={e => {
          if (swallowClick.current) {
            swallowClick.current = false
            e.preventDefault()
            e.stopPropagation()
            return
          }
          if (settled !== 0) {
            e.preventDefault()
            e.stopPropagation()
            close()
          }
        }}
        className="relative bg-dark-800 will-change-transform cursor-grab active:cursor-grabbing"
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? 'none' : 'transform 0.2s ease',
          // Vertical panning stays the browser's
          touchAction: 'pan-y',
        }}
      >
        {children}
      </div>
    </div>
  )
}
