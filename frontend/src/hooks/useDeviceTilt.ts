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
 * There is always a slow idle sway underneath, and the sensor only overrides it
 * while it is actually reporting. The gyroscope is absent far more often than
 * anyone expects — a desktop browser, a declined iOS prompt, a dev server on
 * plain http (Chrome gates the sensor behind a secure context), or simply a
 * phone lying flat on a bench — and every one of those used to leave the body
 * frozen. A decoration that is dead still is indistinguishable from a broken
 * one, which is exactly how this kept getting reported as a regression.
 */

/** Real tilt beyond this contributes nothing more. */
const MAX_INPUT_DEG = 35
/** Furthest the element ever rotates, in degrees. */
const MAX_OUTPUT_DEG = 5.5
/** Ignore below this, or hand tremor makes it twitch while sitting still. */
const DEAD_ZONE_DEG = 1.5
/** Per-frame approach to the target. Lower is heavier and slower to settle. */
const EASING = 0.075
/** Amplitude of the sensorless sway. Under half of what a real tilt can reach. */
const IDLE_DEG = 2.2
/** One full sway. Slow enough that it reads as hanging, not as a metronome. */
const IDLE_PERIOD_MS = 5200
/** No usable reading for this long and the idle sway takes back over. */
const SENSOR_GAP_MS = 1500
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
    if (typeof window === 'undefined') return

    // Someone who has asked for less motion has asked for this too
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (reduced.matches) return

    // The sensor is a phone's, but the sway is not: gating the whole hook on
    // `isPhone` is why a desktop browser showed a body that never moved, which
    // is where "it used to swing" gets reported from in the first place.
    const sensorAvailable = isPhone && 'DeviceOrientationEvent' in window

    let frame = 0
    let listening = false
    let cancelled = false
    /** When the sensor last produced a usable angle. 0 means never. */
    let lastReading = 0

    const onOrientation = (event: DeviceOrientationEvent) => {
      // gamma is left-right tilt in portrait. Null on devices without the
      // sensor, and on desktop browsers that fire the event with no data.
      if (event.gamma == null) return

      lastReading = performance.now()

      const raw = clamp(event.gamma, -MAX_INPUT_DEG, MAX_INPUT_DEG)
      const beyondDeadZone = Math.abs(raw) < DEAD_ZONE_DEG
        ? 0
        : raw - Math.sign(raw) * DEAD_ZONE_DEG

      // Negative: the element rotates AGAINST the tilt, which is what makes it
      // read as staying level with the ground rather than following the screen.
      target.current = -(beyondDeadZone / MAX_INPUT_DEG) * MAX_OUTPUT_DEG
    }

    const tick = (now: number) => {
      // The sensor owns the target while it is reporting; the sway fills every
      // gap. Driving both through the same easing is what stops the handover
      // from being a jump — whichever takes over is approached, not snapped to.
      if (now - lastReading > SENSOR_GAP_MS) {
        target.current = Math.sin((now / IDLE_PERIOD_MS) * Math.PI * 2) * IDLE_DEG
      }

      const next = current.current + (target.current - current.current) * EASING
      // Below a hundredth of a degree nothing is visible; stop re-rendering
      if (Math.abs(next - current.current) > 0.005) {
        current.current = next
        setTilt(Math.round(next * 100) / 100)
      }
      frame = requestAnimationFrame(tick)
    }

    // Runs regardless of the sensor. This is the whole point of the fallback:
    // nothing below may gate the animation on a permission decision.
    frame = requestAnimationFrame(tick)

    const listen = () => {
      if (listening || cancelled || !sensorAvailable) return
      listening = true
      window.addEventListener('deviceorientation', onOrientation)
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

    if (!sensorAvailable) {
      // Sway only. Nothing to ask for and nothing to listen to.
    } else if (!needsPermission() || stored === 'granted') {
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
