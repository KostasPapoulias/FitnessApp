import { useEffect, useState } from 'react'

const PHONE_BREAKPOINT = 768

const getIsPhone = () => {
  if (typeof window === 'undefined') return false

  const narrowViewport = window.innerWidth < PHONE_BREAKPOINT
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches
  const touchDevice = navigator.maxTouchPoints > 1

  return narrowViewport || (coarsePointer && touchDevice)
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