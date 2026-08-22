import { ReactNode, useRef, useState } from 'react'

/**
 * A row that reveals an action when dragged sideways.
 *
 * Swipe LEFT to uncover the right-hand action; swipe RIGHT to uncover the
 * left-hand one. Which action lives on which edge is the caller's choice —
 * see `Props`. Either side can be omitted, and a side with no action does not
 * move at all.
 *
 * Three things about the previous version are worth knowing, because all three
 * were reported as "the swipe does nothing":
 *
 * · It bound touch events only, so on a desktop browser the row could not be
 *   moved at all — and the revealed buttons are `aria-hidden` with
 *   `tabIndex={-1}` while closed, so delete and edit were genuinely
 *   unreachable with a mouse or a keyboard. Pointer events cover mouse, touch
 *   and pen on one code path.
 *
 * · It gated `onTouchMove` on a `dragging` flag held in React state and set in
 *   `onTouchStart`. Every gesture therefore raced a commit on its first move.
 *   All gesture state lives in refs now; state is only the render mirror.
 *
 * · It called `stopPropagation` to hide the gesture from `AppLayout`'s page
 *   swipe, but only AFTER the 8px axis decision — so the first few pixels
 *   still started a page drag, and the `touchend` that would have ended it was
 *   then swallowed, stranding `<main>` mid-drag with `transition: none`.
 *   The root carries `data-no-page-swipe` instead and AppLayout declines the
 *   whole gesture from `touchstart`, so there is nothing to stop.
 */

/**
 * How far the row must travel before an action counts as revealed — and how
 * wide the button behind it is. The compact figure is for short rows, where a
 * stacked icon-over-label does not fit in the height available and would be
 * clipped by the row's own `overflow-hidden`.
 */
const REVEAL_FULL_PX = 72
const REVEAL_COMPACT_PX = 56
/** Below this a drag is a tap that wobbled, not a swipe. */
const DEAD_ZONE_PX = 8

export interface SwipeAction {
  label: string
  icon: string
  onSelect: () => void
  /** Red for anything that destroys data; grey otherwise. */
  tone?: 'danger' | 'neutral'
}

/**
 * Sides are named for where the button SITS, not for the direction of the
 * gesture that reveals it — a row moving left uncovers its right edge. The
 * two were previously fixed as edit-left / delete-right, which meant a caller
 * wanting them the other way round had no way to say so, and reading the call
 * site told you nothing about which way anything went.
 */
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
   * Which side is currently uncovered, or null for a row at rest.
   *
   * Nothing is painted behind a closed row. Leaving both buttons mounted under
   * it looked fine in theory — the row is opaque and covers them — but the
   * container clips with `overflow-hidden` + a border radius while the row
   * itself is a composited layer from `will-change: transform`, and the two
   * edges do not land on the same pixel. The result was a hairline of red and
   * grey down the sides of every row.
   *
   * Cleared on transitionend rather than the moment the offset hits 0, so the
   * button stays visible underneath while the row slides back over it.
   */
  const [side, setSide] = useState<'left' | 'right' | null>(null)

  const start = useRef({ x: 0, y: 0 })
  /** Null until the direction is known; 'y' means the list is scrolling. */
  const axis = useRef<'x' | 'y' | null>(null)
  const active = useRef(false)
  /** Live offset. The state above lags it by a commit and must not be read. */
  const live = useRef(0)
  /** Where the row rests between gestures, so a second drag continues it. */
  const resting = useRef(0)
  /** A drag ends in a click the row must not pass on to whatever it covers. */
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
    // Right-click and middle-click are not gestures.
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
        // The list is scrolling. Bow out for the rest of this gesture rather
        // than re-testing on every move, or a thumb drifting off-axis
        // mid-scroll snatches the row out from under it.
        active.current = false
        return
      }
      // Captured only once the gesture is known to be ours, so a vertical
      // scroll is never stolen — and once captured the row keeps receiving
      // moves even when the finger leaves it, which is most of why a fast
      // swipe used to die halfway.
      e.currentTarget.setPointerCapture(e.pointerId)
      swallowClick.current = true
      setDragging(true)
    }

    let next = resting.current + dx
    // Moving left uncovers the right edge, and vice versa. A side with no
    // action does not move at all.
    if (next < 0 && !right) next = 0
    if (next > 0 && !left) next = 0

    // Resist past the reveal point rather than stopping dead — the row keeps
    // following the finger, so the gesture never feels broken.
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
    // AppLayout reads this attribute on touchstart and leaves the whole
    // gesture alone. See the note at the top of the file.
    <div
      className={`relative overflow-hidden ${compact ? 'rounded-lg' : 'rounded-card'}`}
      data-no-page-swipe
    >

      {/* Actions sit behind the row and are only reachable once it has moved,
          so neither can be hit by a stray tap on a closed row. */}
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
        // Tapping an open row closes it instead of activating whatever is
        // underneath — the first thing everyone tries, and the alternative is
        // opening a workout you were about to delete. The same guard eats the
        // click that ends a drag, which would otherwise land on the row.
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
          // Vertical panning stays the browser's; horizontal is ours. Without
          // this the page can scroll sideways under the drag on Android.
          touchAction: 'pan-y',
        }}
      >
        {children}
      </div>
    </div>
  )
}
