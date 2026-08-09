import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useRef, useState } from 'react'
import BottomNav from './BottomNav'
import { useDeviceType } from '../../hooks/useDeviceType'

const SWIPE_ROUTES = ['/', '/calendar', '/ai', '/profile']

export default function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { isPhone } = useDeviceType()

  const touchStartX  = useRef(0)
  const touchStartY  = useRef(0)
  const [dragX, setDragX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  const currentIndex = SWIPE_ROUTES.indexOf(location.pathname)
  const isSwipeable  = currentIndex !== -1

  // Don't swipe during workout flows
  const isWorkoutFlow = location.pathname.startsWith('/workout')

  const onTouchStart = (e: React.TouchEvent) => {
    if (isWorkoutFlow || !isSwipeable) return
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    setIsDragging(true)
  }

  const onTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || isWorkoutFlow) return
    const deltaX = e.touches[0].clientX - touchStartX.current
    const deltaY = e.touches[0].clientY - touchStartY.current

    // Ignore if more vertical than horizontal
    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      setIsDragging(false)
      return
    }

    // Resist at edges
    if (deltaX > 0 && currentIndex === 0) return
    if (deltaX < 0 && currentIndex === SWIPE_ROUTES.length - 1) return

    setDragX(deltaX)
  }

  const onTouchEnd = () => {
    if (!isDragging) return
    setIsDragging(false)

    // const deltaX = e.changedTouches[0].clientX - touchStartX.current

    if (Math.abs(dragX) > 80) {
      if (dragX < 0 && currentIndex < SWIPE_ROUTES.length - 1) {
        navigate(SWIPE_ROUTES[currentIndex + 1])
      } else if (dragX > 0 && currentIndex > 0) {
        navigate(SWIPE_ROUTES[currentIndex - 1])
      }
    }

    setDragX(0)
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
        className={`flex flex-col min-h-dvh overflow-y-auto pt-[var(--safe-top)] ${
          isPhone ? 'pb-[var(--bottom-nav-h)]' : 'pb-8 pl-72'
        }`}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform: dragX ? `translateX(${dragX * 0.3}px)` : 'none',
          transition: isDragging ? 'none' : 'transform 0.3s ease',
        }}
      >
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}