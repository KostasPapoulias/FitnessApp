import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import BottomNav from './BottomNav'
import { useDeviceType } from '../../hooks/useDeviceType'
import { useOnboardingStore } from '../../store/useOnboardingStore'

const SWIPE_ROUTES = ['/', '/calendar', '/ai', '/profile']

/** Past this much horizontal travel the page commits to the next route. */
const COMMIT_PX = 80
/** How much of the finger's travel the page actually moves. */
const DRAG_DAMPING = 0.3

/**
 * Whether something nearer the finger has a better claim on a sideways drag.
 *
 * Two cases, and both were live bugs. A row that swipes to reveal its own
 * actions marks itself `data-no-page-swipe`. Anything that scrolls sideways —
 * the activity heatmap, a row of filter chips — is detected rather than
 * tagged, so a new one is covered the day it is added.
 *
 * Checked at `touchstart` and for the whole gesture, not re-tested per move:
 * the page swipe used to start during the first few pixels of a row swipe and
 * then never see the `touchend`, which left `<main>` translated a couple of
 * pixels off-axis with `transition: none` until the next gesture.
 */
const claimedBySomethingCloser = (target: EventTarget | null, boundary: Element) => {
  let node = target instanceof Element ? target : null
  while (node && node !== boundary) {
    if (node.hasAttribute('data-no-page-swipe')) return true
    // +1 absorbs the sub-pixel difference a fractional layout leaves behind on
    // an element that does not actually overflow.
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

  // Fetched here rather than on Home, because coach-marks live on screens a
  // user can reach directly — landing on Calendar first would otherwise leave
  // every hint permanently hidden behind `loaded === false`.
  useEffect(() => {
    fetchOnboardingState()
  }, [])

  const touchStartX  = useRef(0)
  const touchStartY  = useRef(0)
  // Gesture state is refs; `dragX` state is the render mirror only. Reading
  // the state back inside a handler is a commit behind, which is why the old
  // `onTouchEnd` had to work off a value that could still be 0 on a fast flick.
  const active       = useRef(false)
  const axis         = useRef<'x' | 'y' | null>(null)
  const liveDragX    = useRef(0)
  const [dragX, setDragX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  const currentIndex = SWIPE_ROUTES.indexOf(location.pathname)
  const isSwipeable  = currentIndex !== -1

  // Don't swipe during workout flows
  const isWorkoutFlow = location.pathname.startsWith('/workout')

  const endGesture = () => {
    active.current = false
    axis.current = null
    liveDragX.current = 0
    setIsDragging(false)
    setDragX(0)
  }

  // A route change mid-gesture (a nav tap, a redirect) would otherwise leave
  // the page parked at its drag offset, and a transformed ancestor also
  // re-anchors every `position: fixed` sheet inside it.
  useEffect(() => { endGesture() }, [location.pathname])

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

    // Decide once, then hold. Re-deciding per move meant a diagonal drag
    // flickered between scrolling the list and dragging the page.
    if (axis.current === null) {
      if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) return
      axis.current = Math.abs(deltaX) > Math.abs(deltaY) ? 'x' : 'y'
      if (axis.current === 'y') { active.current = false; setIsDragging(false); return }
    }

    // Resist at edges
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
    <div className={`min-h-dvh bg-dark-900 text-white ${isPhone ? 'mx-auto max-w-[430px]' : 'w-full'}`}>
      {/* The sidebar renders on !isPhone, so the offset keys off the same flag —
          `lg:pl-72` left a 768–1024px gap where the sidebar covered content. */}
      {/* The top inset is applied once, here, rather than on each page header:
          under `viewport-fit=cover` the status bar overlays the page, and every
          screen's own `pt-4`/`pt-6` is far short of a 59px notch.
          The bottom clears the real nav rather than a guessed 5rem. */}
      <main
        className={`flex flex-col min-h-dvh overflow-y-auto pt-[var(--page-top)] ${
          isPhone ? 'pb-[var(--bottom-nav-h)]' : 'pb-8 pl-72'
        }`}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        style={{
          transform: dragX ? `translateX(${dragX * DRAG_DAMPING}px)` : 'none',
          transition: isDragging ? 'none' : 'transform 0.3s ease',
        }}
      >
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}