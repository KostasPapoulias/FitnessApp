import { ReactNode, useEffect, useRef, useState } from 'react'

/**
 * An iOS-style sheet that rises from the bottom edge.
 *
 * Dismissed by dragging the grabber down, by dragging the content down when it
 * is already scrolled to the top, by tapping the scrim, or with Escape.
 *
 * Mount it conditionally — `{thing && <BottomSheet …>}`. It plays its own exit
 * animation and calls `onClose` when that finishes, so the parent must not
 * unmount it itself; clearing the state in `onClose` is the whole contract.
 *
 * `z-[60]`, per the rule in CLAUDE.md: `BottomNav` is `fixed z-50` and renders
 * after `<main>`, so at equal z-index it paints over a sheet that rises from
 * the same edge it is pinned to — which once ate a Save button whole. The scrim
 * covers the nav deliberately; a sheet is modal and leaving the nav lit and
 * tappable underneath is wrong regardless of the clipping.
 */

/** Must match the `duration-*` classes below. */
const ANIM_MS = 280
/** Drag far enough and let go and it closes, however slowly you did it. */
const DISMISS_PX = 110
/** …or flick it, however short the throw. */
const DISMISS_VELOCITY = 0.55 // px per ms

interface Props {
  title: ReactNode
  /** Small line under the title — a count, a date, a total. */
  subtitle?: ReactNode
  onClose: () => void
  children: ReactNode
}

export default function BottomSheet({ title, subtitle, onClose, children }: Props) {
  // `entered` drives the rise; `leaving` drives the fall. Starting at false and
  // flipping on the next frame is what gives the browser a "from" to animate
  // out of — set in the same paint and it simply appears.
  const [entered, setEntered] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [dragY, setDragY] = useState(0)
  // Mirrors `drag.current` for rendering. The ref alone cannot switch the
  // transition off, because setting it does not re-render — the sheet would
  // then ease toward the finger for the first frame of every drag.
  const [dragging, setDragging] = useState(false)

  const sheet = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const closing = useRef(false)

  const drag = useRef<{
    startX: number
    startY: number
    startedAt: number
    from: 'grabber' | 'content'
    /** Null until the direction is known. Only a 'y' gesture moves the sheet. */
    axis: 'x' | 'y' | null
  } | null>(null)
  const liveY = useRef(0)

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const close = () => {
    if (closing.current) return
    closing.current = true
    setLeaving(true)
    window.setTimeout(onClose, ANIM_MS)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    // The page behind must not scroll under the sheet. Restored on unmount
    // rather than set to '' blindly, so a sheet opened over another sheet does
    // not hand the scroll back early.
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [])

  const beginDrag = (e: React.PointerEvent<HTMLElement>, from: 'grabber' | 'content') => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    // Dragging the body only makes sense at the top of its scroll; anywhere
    // else the gesture is the list scrolling and the sheet must not move.
    if (from === 'content' && (scroller.current?.scrollTop ?? 0) > 0) return
    // A row inside the sheet that swipes sideways owns its own gesture. Same
    // attribute AppLayout checks, for the same reason: without it, swiping a
    // set row also drags the sheet towards dismissal.
    if (e.target instanceof Element && e.target.closest('[data-no-page-swipe]')) return
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      startedAt: performance.now(),
      from,
      // The grabber and the header are the sheet's own handle: nothing else
      // there wants a horizontal gesture, so skip the axis test for them.
      axis: from === 'grabber' ? 'y' : null,
    }
    setDragging(true)
  }

  const abandonDrag = () => {
    drag.current = null
    liveY.current = 0
    setDragging(false)
    setDragY(0)
  }

  const onDragMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!drag.current) return
    const dx = e.clientX - drag.current.startX
    const dy = e.clientY - drag.current.startY

    if (drag.current.axis === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      drag.current.axis = Math.abs(dy) > Math.abs(dx) ? 'y' : 'x'
      // Sideways inside the content is somebody else's gesture.
      if (drag.current.axis === 'x') { abandonDrag(); return }
    }

    // Upward is the sheet already at its stop. Resist rather than follow, so
    // it reads as a limit instead of a broken drag.
    const next = dy < 0 ? dy * 0.18 : dy
    if (drag.current.from === 'content' && dy <= 0) {
      abandonDrag()
      return
    }

    if (!e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    liveY.current = next
    setDragY(next)
  }

  const endDrag = (e: React.PointerEvent<HTMLElement>) => {
    const state = drag.current
    drag.current = null
    setDragging(false)
    if (!state) return

    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }

    const travelled = liveY.current
    const velocity = travelled / Math.max(1, performance.now() - state.startedAt)
    liveY.current = 0

    if (travelled > DISMISS_PX || velocity > DISMISS_VELOCITY) close()
    else setDragY(0)
  }

  const hidden = leaving || !entered
  const translate = hidden ? '100%' : `${Math.max(0, dragY)}px`

  return (
    // `data-no-page-swipe`: the scrim sits inside `<main>`, so without this a
    // sideways drag across it would slide the whole app to another tab behind
    // an open sheet.
    <div className="fixed inset-0 z-[60] flex items-end" data-no-page-swipe>
      <div
        onClick={close}
        className={`absolute inset-0 bg-black/60 transition-opacity duration-[280ms]
                    ${hidden ? 'opacity-0' : 'opacity-100'}`}
      />

      <div
        ref={sheet}
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-[430px] mx-auto bg-dark-800
                   border-t border-dark-600 rounded-t-2xl
                   max-h-[88dvh] flex flex-col overflow-hidden"
        style={{
          transform: `translateY(${translate})`,
          // No transition while the finger is down, or the sheet lags behind it.
          transition: dragging ? 'none' : `transform ${ANIM_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`,
        }}
      >
        {/* Grabber. Generous hit area around a small bar — the bar is the
            affordance, the padding is the target. */}
        <div
          onPointerDown={e => beginDrag(e, 'grabber')}
          onPointerMove={onDragMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="flex-shrink-0 pt-2.5 pb-1 cursor-grab active:cursor-grabbing"
          style={{ touchAction: 'none' }}
        >
          <div className="mx-auto w-9 h-1 rounded-full bg-dark-500" />
        </div>

        <div
          onPointerDown={e => beginDrag(e, 'grabber')}
          onPointerMove={onDragMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="flex-shrink-0 flex items-start justify-between gap-3 px-5 pt-2 pb-3
                     border-b border-dark-700 cursor-grab active:cursor-grabbing"
          style={{ touchAction: 'none' }}
        >
          <div className="min-w-0">
            <h2 className="text-white text-[17px] font-bold leading-tight truncate">{title}</h2>
            {subtitle && <p className="text-dark-400 text-xs mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={close}
            aria-label="Close"
            className="flex-shrink-0 w-8 h-8 rounded-full bg-dark-700 text-dark-300
                       flex items-center justify-center text-lg leading-none
                       active:scale-90 transition-transform"
          >
            ×
          </button>
        </div>

        <div
          ref={scroller}
          onPointerDown={e => beginDrag(e, 'content')}
          onPointerMove={onDragMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="overflow-y-auto px-5 pt-4 pb-[calc(1.25rem+var(--safe-bottom))]"
          style={{ overscrollBehavior: 'contain' }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
