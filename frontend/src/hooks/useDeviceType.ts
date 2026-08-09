import { useEffect, useState } from 'react'

const PHONE_BREAKPOINT = 768

const getIsPhone = () => {
  if (typeof window === 'undefined') return false

  const narrowViewport = window.innerWidth < PHONE_BREAKPOINT
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches
  const touchDevice = navigator.maxTouchPoints > 1

  // Touch alone doesn't make something a phone — a tablet or a touchscreen
  // laptop matches it too, and both were getting the 430px phone column on a
  // wide display. The shortest side is what distinguishes them, and unlike
  // width it survives the device being turned: a phone held landscape is still
  // narrow one way, a tablet isn't.
  const shortestSide = Math.min(window.innerWidth, window.innerHeight)

  return narrowViewport || (coarsePointer && touchDevice && shortestSide < PHONE_BREAKPOINT)
}

export const useDeviceType = () => {
  const [isPhone, setIsPhone] = useState(getIsPhone)

  useEffect(() => {
    const updateDeviceType = () => setIsPhone(getIsPhone())

    updateDeviceType()
    window.addEventListener('resize', updateDeviceType)
    window.addEventListener('orientationchange', updateDeviceType)

    return () => {
      window.removeEventListener('resize', updateDeviceType)
      window.removeEventListener('orientationchange', updateDeviceType)
    }
  }, [])

  return {
    isPhone,
    isDesktop: !isPhone,
  }
}