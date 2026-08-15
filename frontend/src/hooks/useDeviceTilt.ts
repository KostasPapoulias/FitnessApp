import { useEffect, useRef, useState } from 'react'
import { useDeviceType } from './useDeviceType'

/**
 * A small amount of counter-rotation driven by how the phone is held, so an
 * element appears to hang and stay upright rather than being painted onto the
 * screen.
 *
 * Deliberately understated. The output is a fraction of the real tilt and hard
 * clamped, because a decoration that tracks the device one-to-one stops reading
 * as physics and starts reading as a bug.
 *
 * Uses DeviceOrientationEvent directly — no Capacitor plugin needed, this works
 * in a Home Screen web app. The one platform wrinkle is iOS 13+, which requires
 * an explicit permission grant triggered by a user gesture.
 *
 * Phone and gyroscope only. There is no time-based fallback animation: with no
 * sensor the element is meant to sit still, because the movement is supposed to
 * be the phone's, not a loop playing at it.
 *
 * If it appears dead on a phone, the sensor is the thing to check before the
 * code — a declined iOS prompt is remembered in `PERMISSION_KEY` and never asked
 * again, and Chrome only delivers `deviceorientation` in a secure context, so a
 * dev server on plain http over the LAN gets nothing at all.
 */

/** Real tilt beyond this contributes nothing more. */
const MAX_INPUT_DEG = 35
/** Furthest the element ever rotates, in degrees. */
const MAX_OUTPUT_DEG = 5.5
/** Ignore below this, or hand tremor makes it twitch while sitting still. */
const DEAD_ZONE_DEG = 1.5
/** Per-frame approach to the target. Lower is heavier and slower to settle. */
const EASING = 0.075
/** localStorage key — iOS should only ever be asked once. */
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

  // Target and current live in refs: the animation frame reads them every tick
  // and re-rendering on each raw sensor event would be ~60 renders a second.
  const target = useRef(0)
  const current = useRef(0)

  useEffect(() => {
    if (!isPhone) return
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return

    // Someone who has asked for less motion has asked for this too
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (reduced.matches) return

    let frame = 0
    let listening = false
    let cancelled = false

    const onOrientation = (event: DeviceOrientationEvent) => {
      // gamma is left-right tilt in portrait. Null on devices without the
      // sensor, and on desktop browsers that fire the event with no data.
      if (event.gamma == null) return

      const raw = clamp(event.gamma, -MAX_INPUT_DEG, MAX_INPUT_DEG)
      const beyondDeadZone = Math.abs(raw) < DEAD_ZONE_DEG
        ? 0
        : raw - Math.sign(raw) * DEAD_ZONE_DEG

      // Negative: the element rotates AGAINST the tilt, which is what makes it
      // read as staying level with the ground rather than following the screen.
      target.current = -(beyondDeadZone / MAX_INPUT_DEG) * MAX_OUTPUT_DEG
    }

    const tick = () => {
      const next = current.current + (target.current - current.current) * EASING
      // Below a hundredth of a degree nothing is visible; stop re-rendering
      if (Math.abs(next - current.current) > 0.005) {
        current.current = next
        setTilt(Math.round(next * 100) / 100)
      }
      frame = requestAnimationFrame(tick)
    }

    // Started with the listener, not before it: with no sensor reporting there
    // is nothing for the loop to ease towards, and a frame loop that only ever
    // computes zero is a wasted wake-up on every frame the phone paints.
    const listen = () => {
      if (listening || cancelled) return
      listening = true
      window.addEventListener('deviceorientation', onOrientation)
      frame = requestAnimationFrame(tick)
    }

    // iOS 13+ only. The prompt appears solely inside a user gesture, so it has
    // to wait for the first tap — asking on load is impossible.
    const requestOnce = async () => {
      document.removeEventListener('touchend', requestOnce)
      document.removeEventListener('click', requestOnce)
      try {
        const result = await (DeviceOrientationEvent as unknown as OrientationEventStatic)
          .requestPermission!()
        localStorage.setItem(PERMISSION_KEY, result)
        if (result === 'granted') listen()
      } catch {
        // Denied, or not called from a real gesture. Either way, drop it —
        // this is decoration and must never nag.
        localStorage.setItem(PERMISSION_KEY, 'denied')
      }
    }

    const stored = localStorage.getItem(PERMISSION_KEY) as PermissionState | null

    if (!needsPermission() || stored === 'granted') {
      // Android and everything else: no gate, just listen
      listen()
    } else if (stored !== 'denied') {
      document.addEventListener('touchend', requestOnce, { once: true })
      document.addEventListener('click', requestOnce, { once: true })
    }

    // One cleanup for every path. The permission branch used to return its own
    // early, which meant a granted iOS session left the orientation listener
    // and the frame loop running after Home unmounted — and started a second
    // loop on the way back in.
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
