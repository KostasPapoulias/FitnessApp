import { ReactNode, useRef, useState } from 'react'

/**
 * A row that reveals an action when dragged sideways.
 *
 * Swipe LEFT to uncover delete on the right; swipe RIGHT to uncover edit on the
 * left. Either side can be omitted, and a side with no action does not move.
 *
 * The important part is what it does NOT do. `AppLayout` puts a horizontal drag
 * handler on `<main>` that navigates between Home, Calendar, AI and Profile,
 * and React's synthetic touch events bubble — so without intervention every
 * swipe on one of these rows would also slide the whole page to another tab.
 * The handlers here call `stopPropagation`, which stops the event at this node
 * in the React tree and leaves the page swipe working everywhere else.
 *
 * (`hooks/useSwipeNavigation.ts` looks like the thing to worry about and is
 * not — nothing imports it. The live implementation is inline in AppLayout.)
 */

/** How far the row must travel before an action counts as revealed. */
const REVEAL_PX = 72
/** Below this a drag is a tap that wobbled, not a swipe. */
const DEAD_ZONE_PX = 8

interface Props {
  children: ReactNode
  onDelete?: () => void
  onEdit?: () => void
  deleteLabel?: string
  editLabel?: string
}

export default function SwipeActions({
  children,
  onDelete,
  onEdit,
  deleteLabel = 'Delete',
  editLabel = 'Edit',
}: Props) {
  const startX = useRef(0)
  const startY = useRef(0)
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  // Null until the direction is known. A gesture that starts vertically is a
  // scroll and must be left alone for the whole of its life, or the list jams
  // every time someone scrolls with their thumb slightly off-axis.
  const axis = useRef<'x' | 'y' | null>(null)

  const settled = offset <= -REVEAL_PX ? -REVEAL_PX
    : offset >= REVEAL_PX ? REVEAL_PX
    : 0

  const close = () => setOffset(0)

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
    axis.current = null
    setDragging(true)
  }

  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging) return

    const deltaX = e.touches[0].clientX - startX.current
    const deltaY = e.touches[0].clientY - startY.current

    if (axis.current === null) {
      if (Math.abs(deltaX) < DEAD_ZONE_PX && Math.abs(deltaY) < DEAD_ZONE_PX) return
      axis.current = Math.abs(deltaX) > Math.abs(deltaY) ? 'x' : 'y'
    }

    // A vertical gesture is the list scrolling. Let it bubble untouched.
    if (axis.current === 'y') return

    // Horizontal, and ours. Stop it here so AppLayout's page swipe never sees
    // it — otherwise revealing the bin also slides Calendar towards Home.
    e.stopPropagation()

    const canGoLeft = Boolean(onDelete)
    const canGoRight = Boolean(onEdit)
    const next =
      deltaX < 0 && !canGoLeft ? 0 :
      deltaX > 0 && !canGoRight ? 0 :
      deltaX

    // Resist past the reveal point rather than stopping dead — the row keeps
    // following the finger, so the gesture never feels broken.
    const clamped = Math.abs(next) > REVEAL_PX
      ? Math.sign(next) * (REVEAL_PX + (Math.abs(next) - REVEAL_PX) * 0.25)
      : next

    setOffset(clamped)
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    if (axis.current === 'x') e.stopPropagation()
    setDragging(false)
    axis.current = null
    setOffset(settled)
  }

  return (
    <div className="relative overflow-hidden rounded-card">

      {/* Actions sit behind the row and are only reachable once it has moved,
          so neither can be hit by a stray tap on a closed row. */}
      {onEdit && (
        <button
          onClick={() => { onEdit(); close() }}
          aria-hidden={settled !== REVEAL_PX}
          tabIndex={settled === REVEAL_PX ? 0 : -1}
          className="absolute inset-y-0 left-0 w-[72px] bg-dark-600 text-white
                     text-xs font-semibold flex flex-col items-center justify-center gap-1"
        >
          <span className="text-base">✏️</span>
          {editLabel}
        </button>
      )}

      {onDelete && (
        <button
          onClick={() => { onDelete(); close() }}
          aria-hidden={settled !== -REVEAL_PX}
          tabIndex={settled === -REVEAL_PX ? 0 : -1}
          className="absolute inset-y-0 right-0 w-[72px] bg-brand-red text-white
                     text-xs font-semibold flex flex-col items-center justify-center gap-1"
        >
          <span className="text-base">🗑️</span>
          {deleteLabel}
        </button>
      )}

      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        // Tapping an open row closes it instead of activating whatever is
        // underneath — the first thing everyone tries, and the alternative is
        // opening a workout you were about to delete.
        onClickCapture={e => {
          if (settled !== 0) {
            e.preventDefault()
            e.stopPropagation()
            close()
          }
        }}
        className="relative bg-dark-800 will-change-transform"
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? 'none' : 'transform 0.2s ease',
        }}
      >
        {children}
      </div>
    </div>
  )
}
