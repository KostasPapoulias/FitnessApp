import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import BottomNav from './BottomNav'
import ErrorBoundary from '../ErrorBoundary'
import { useDeviceType } from '../../hooks/useDeviceType'
import { useOnboardingStore } from '../../store/useOnboardingStore'
import { useOfflineQueue } from '../../hooks/useOfflineQueue'

const SWIPE_ROUTES = ['/', '/calendar', '/ai', '/profile']

/** Horizontal travel that commits a swipe to the next route. */
const COMMIT_PX = 80
/** Fraction of finger travel the page follows. */
const DRAG_DAMPING = 0.3

/**
 * Whether something closer to the finger owns a sideways drag: an element
 * marked `data-no-page-swipe`, or anything that scrolls horizontally.
 * Decided at touchstart for the whole gesture.
 */
const claimedBySomethingCloser = (target: EventTarget | null, boundary: Element) => {
  let node = target instanceof Element ? target : null
  while (node && node !== boundary) {
    if (node.hasAttribute('data-no-page-swipe')) return true
    // +1 absorbs sub-pixel layout differences
    if (node.scrollWidth > node.clientWidth + 1) {
      const { overflowX } = getComputedStyle(node)
      if (overflowX === 'auto' || overflowX === 'scroll') return true
    }
    node = node.parentElement
  }
  return false
}

export default function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { isPhone } = useDeviceType()
  const fetchOnboardingState = useOnboardingStore(s => s.fetchState)

  // Fetched once for the whole app
  useEffect(() => {
    fetchOnboardingState()
  }, [])

  // Drains sets queued offline (also restores the badge count on launch)
  useOfflineQueue()

  const touchStartX  = useRef(0)
  const touchStartY  = useRef(0)
  // Gesture state lives in refs; `dragX` only mirrors it for rendering
  const active       = useRef(false)
  const axis         = useRef<'x' | 'y' | null>(null)
  const liveDragX    = useRef(0)
  const [dragX, setDragX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  const currentIndex = SWIPE_ROUTES.indexOf(location.pathname)
  const isSwipeable  = currentIndex !== -1

  // No page swipe in workout flows
  const isWorkoutFlow = location.pathname.startsWith('/workout')

  const endGesture = () => {
    active.current = false
    axis.current = null
    liveDragX.current = 0
    setIsDragging(false)
    setDragX(0)
  }

  // Reset any in-progress drag on route change
  useEffect(() => { endGesture() }, [location.pathname])

  // <main> persists across pages, so reset its scroll on navigation
  const mainRef = useRef<HTMLElement>(null)
  useEffect(() => { mainRef.current?.scrollTo({ top: 0 }) }, [location.pathname])

  const onTouchStart = (e: React.TouchEvent<HTMLElement>) => {
    if (isWorkoutFlow || !isSwipeable) return
    if (claimedBySomethingCloser(e.target, e.currentTarget)) return
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    axis.current = null
    active.current = true
    setIsDragging(true)
  }

  const onTouchMove = (e: React.TouchEvent) => {
    if (!active.current) return
    const deltaX = e.touches[0].clientX - touchStartX.current
    const deltaY = e.touches[0].clientY - touchStartY.current

    // Decide the axis once per gesture
    if (axis.current === null) {
      if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) return
      axis.current = Math.abs(deltaX) > Math.abs(deltaY) ? 'x' : 'y'
      if (axis.current === 'y') { active.current = false; setIsDragging(false); return }
    }

    // No swipe past the first or last route
    if (deltaX > 0 && currentIndex === 0) return
    if (deltaX < 0 && currentIndex === SWIPE_ROUTES.length - 1) return

    liveDragX.current = deltaX
    setDragX(deltaX)
  }

  const onTouchEnd = () => {
    if (!active.current) { endGesture(); return }
    const travelled = liveDragX.current

    if (Math.abs(travelled) > COMMIT_PX) {
      if (travelled < 0 && currentIndex < SWIPE_ROUTES.length - 1) {
        navigate(SWIPE_ROUTES[currentIndex + 1])
      } else if (travelled > 0 && currentIndex > 0) {
        navigate(SWIPE_ROUTES[currentIndex - 1])
      }
    }

    endGesture()
  }
  return (
    <>
    <div className={`h-dvh overflow-hidden bg-dark-900 text-white ${isPhone ? 'mx-auto max-w-[430px]' : 'w-full'}`}>
      {/* The single scrolling region. h-dvh (not min-h-dvh) keeps the document
          exactly the viewport; the top safe-area inset and the nav's height are
          padded here, once, for every page. Left offset matches the sidebar. */}
      <main
        ref={mainRef}
        className={`flex flex-col h-dvh overflow-y-auto overscroll-contain
                    pt-[var(--page-top)] pb-[var(--bottom-nav-h)] ${isPhone ? '' : 'pl-72'}`}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        style={{
          transform: dragX ? `translateX(${dragX * DRAG_DAMPING}px)` : 'none',
          transition: isDragging ? 'none' : 'transform 0.3s ease',
        }}
      >
        {/* Page-level boundary, keyed on the path so navigating away clears a
            crash. Retry is offered because the shell is still alive. */}
        <ErrorBoundary boundary="page" allowRetry key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
    {/* Outside the shell, so its containing block is the viewport */}
    <BottomNav />
    </>
  )
}