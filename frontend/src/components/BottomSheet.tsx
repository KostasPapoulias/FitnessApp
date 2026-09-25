import { ReactNode, useEffect, useRef, useState } from 'react'
import ModalPortal from './ModalPortal'

/**
 * A sheet rising from the bottom edge. Dismissed by dragging the grabber (or
 * the content when scrolled to the top), tapping the scrim, or Escape.
 * Mount conditionally; it plays its exit animation then calls `onClose`.
 * Rendered via ModalPortal at z-[60], above BottomNav.
 */

/** Must match the `duration-*` classes below. */
const ANIM_MS = 280
/** Drag past this and release to close. */
const DISMISS_PX = 110
/** …or flick faster than this. */
const DISMISS_VELOCITY = 0.55 // px per ms

interface Props {
  title: ReactNode
  /** Small line under the title. */
  subtitle?: ReactNode
  onClose: () => void
  /** A pinned action row below the scroll area (e.g. Save), always visible. */
  footer?: ReactNode
  children: ReactNode
}

export default function BottomSheet({ title, subtitle, onClose, footer, children }: Props) {
  // `entered` flips on the next frame, giving the rise a starting point
  const [entered, setEntered] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [dragY, setDragY] = useState(0)
  // Render mirror of drag state, to switch the transition off while dragging
  const [dragging, setDragging] = useState(false)

  const sheet = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const closing = useRef(false)

  const drag = useRef<{
    startX: number
    startY: number
    startedAt: number
    from: 'grabber' | 'content'
    /** Null until the direction is known; only 'y' moves the sheet. */
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
    // Lock page scroll; restore the previous value on unmount (sheets can stack)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [])

  const beginDrag = (e: React.PointerEvent<HTMLElement>, from: 'grabber' | 'content') => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    // Content drags only when scrolled to the top
    if (from === 'content' && (scroller.current?.scrollTop ?? 0) > 0) return
    // Rows that swipe sideways own their gesture
    if (e.target instanceof Element && e.target.closest('[data-no-page-swipe]')) return
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      startedAt: performance.now(),
      from,
      // The grabber and header are the sheet's own handle
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
      // Sideways inside the content belongs to something else
      if (drag.current.axis === 'x') { abandonDrag(); return }
    }

    // Resist upward drags
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
    <ModalPortal>
    {/* `data-no-page-swipe`: stops a drag on the scrim swiping the app to another tab */}
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
          // No transition while dragging
          transition: dragging ? 'none' : `transform ${ANIM_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`,
        }}
      >
        {/* Grabber, with a generous hit area */}
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
          className={`overflow-y-auto px-5 pt-4
                      ${footer ? 'pb-5' : 'pb-[calc(1.25rem+var(--safe-bottom))]'}`}
          style={{ overscrollBehavior: 'contain' }}
        >
          {children}
        </div>

        {footer && (
          <div className="flex-shrink-0 border-t border-dark-700 px-5 pt-3
                          pb-[calc(1.25rem+var(--safe-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
    </ModalPortal>
  )
}
