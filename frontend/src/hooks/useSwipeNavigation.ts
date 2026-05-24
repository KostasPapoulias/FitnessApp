import { useNavigate, useLocation } from 'react-router-dom'
import { useRef } from 'react'

// Define the swipeable route order
const SWIPE_ROUTES = ['/', '/calendar', '/ai', '/profile']

export const useSwipeNavigation = () => {
  const navigate  = useNavigate()
  const location  = useLocation()
  const touchStartX = useRef<number>(0)
  const touchStartY = useRef<number>(0)

  const currentIndex = SWIPE_ROUTES.indexOf(location.pathname)

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    const deltaX = e.changedTouches[0].clientX - touchStartX.current
    const deltaY = e.changedTouches[0].clientY - touchStartY.current

    // Only trigger if horizontal swipe is dominant
    if (Math.abs(deltaX) < Math.abs(deltaY)) return
    if (Math.abs(deltaX) < 60) return // minimum swipe distance

    if (deltaX < 0 && currentIndex < SWIPE_ROUTES.length - 1) {
      // Swipe left → go to next screen
      navigate(SWIPE_ROUTES[currentIndex + 1])
    } else if (deltaX > 0 && currentIndex > 0) {
      // Swipe right → go to previous screen
      navigate(SWIPE_ROUTES[currentIndex - 1])
    }
  }

  return { onTouchStart, onTouchEnd }
}