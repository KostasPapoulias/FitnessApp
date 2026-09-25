import { useEffect, useRef, useState } from 'react'
import { useDeviceType } from './useDeviceType'

/**
 * Slight counter-rotation from how the phone is held, so an element seems to
 * hang level. Phone gyroscope only, no fallback animation. iOS 13+ needs a
 * permission granted from a user gesture.
 *
 * If it seems dead: a declined iOS prompt is remembered in PERMISSION_KEY
 * (clear it to re-test), and Chrome only delivers `deviceorientation` over https.
 */

/** Real tilt beyond this contributes nothing more. */
const MAX_INPUT_DEG = 35
/** Furthest the element ever rotates, in degrees. */
const MAX_OUTPUT_DEG = 5.5
/** Ignore tilt below this (hand tremor). */
const DEAD_ZONE_DEG = 1.5
/** Per-frame easing toward the target; lower is heavier. */
const EASING = 0.075
/** localStorage key; iOS is only ever asked once. */
const PERMISSION_KEY = 'somatrack_tilt_permission'

type PermissionState = 'unknown' | 'granted' | 'denied'

interface OrientationEventStatic {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

const needsPermission = (): boolean =>
  typeof (DeviceOrientationEvent as unknown as OrientationEventStatic)?.requestPermission === 'function'

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

export const useDeviceTilt = (): number => {
  const { isPhone } = useDeviceType()
  const [tilt, setTilt] = useState(0)

  // Refs, read by the animation frame, so sensor events don't re-render
  const target = useRef(0)
  const current = useRef(0)

  useEffect(() => {
    if (!isPhone) return
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return

    // Respect reduced motion
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (reduced.matches) return

    let frame = 0
    let listening = false
    let cancelled = false

    const onOrientation = (event: DeviceOrientationEvent) => {
      // gamma is left-right tilt; null without the sensor
      if (event.gamma == null) return

      const raw = clamp(event.gamma, -MAX_INPUT_DEG, MAX_INPUT_DEG)
      const beyondDeadZone = Math.abs(raw) < DEAD_ZONE_DEG
        ? 0
        : raw - Math.sign(raw) * DEAD_ZONE_DEG

      // Rotate against the tilt, so the element stays level
      target.current = -(beyondDeadZone / MAX_INPUT_DEG) * MAX_OUTPUT_DEG
    }

    const tick = () => {
      const next = current.current + (target.current - current.current) * EASING
      // Skip invisible changes
      if (Math.abs(next - current.current) > 0.005) {
        current.current = next
        setTilt(Math.round(next * 100) / 100)
      }
      frame = requestAnimationFrame(tick)
    }

    // The frame loop starts with the listener, not before
    const listen = () => {
      if (listening || cancelled) return
      listening = true
      window.addEventListener('deviceorientation', onOrientation)
      frame = requestAnimationFrame(tick)
    }

    // iOS 13+: the prompt only appears inside a user gesture, so wait for the first tap
    const requestOnce = async () => {
      document.removeEventListener('touchend', requestOnce)
      document.removeEventListener('click', requestOnce)
      try {
        const result = await (DeviceOrientationEvent as unknown as OrientationEventStatic)
          .requestPermission!()
        localStorage.setItem(PERMISSION_KEY, result)
        if (result === 'granted') listen()
      } catch {
        // Denied: never ask again
        localStorage.setItem(PERMISSION_KEY, 'denied')
      }
    }

    const stored = localStorage.getItem(PERMISSION_KEY) as PermissionState | null

    if (!needsPermission() || stored === 'granted') {
      // Elsewhere: no permission gate
      listen()
    } else if (stored !== 'denied') {
      document.addEventListener('touchend', requestOnce, { once: true })
      document.addEventListener('click', requestOnce, { once: true })
    }

    // One cleanup for every path, so no listener or frame loop outlives the component
    return () => {
      cancelled = true
      document.removeEventListener('touchend', requestOnce)
      document.removeEventListener('click', requestOnce)
      window.removeEventListener('deviceorientation', onOrientation)
      cancelAnimationFrame(frame)
    }
  }, [isPhone])

  return tilt
}
