import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import SessionStatus, { SessionCard } from './SessionCard'

/**
 * The "saving your workout" screen: the session card, tossed into the
 * Calendar tab once the server confirms. The target nav icon is measured at
 * takeoff; the flying card is a clone portalled to <body> (so a transformed
 * <main> can't misplace it). The toss plays once, on success only.
 */

/** Flight time. */
const FLIGHT_MS = 560
/** The landing ring starts just before the flight ends. */
const HALO_DELAY_MS = 460
/** Total hold before the caller moves on. */
const SETTLE_MS = 680
/** A short beat when there is no flight. */
const SKIP_MS = 160

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

interface Props {
  /** True while the save request is in flight. */
  pending: boolean
  /** Called once the card has landed, or at once when there is nothing to play. */
  onSettled: () => void
  /** A failed save never flies — handed back at once. */
  failed?: boolean
  headline?: string
  hint?: string
  /** Shown on the card; optional. */
  sets?: number
  durationLabel?: string
}

interface Flight {
  /** Where the clone starts, in viewport coordinates. */
  from: { top: number; left: number; width: number; height: number }
  /** Where it lands: the nav icon's centre. */
  to: { x: number; y: number }
  dx: number
  dy: number
  lift: number
}

export default function SaveToCalendar({
  pending,
  onSettled,
  failed = false,
  headline = 'Saving your workout',
  sets,
  durationLabel,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [flight, setFlight] = useState<Flight | null>(null)
  const [halo, setHalo] = useState(false)
  // Ref guard: StrictMode would otherwise launch twice
  const launched = useRef(false)
  const timers = useRef<number[]>([])

  // Held in a ref so the effect depends on `pending` only (an inline callback
  // would re-run it and strand the screen)
  const settle = useRef(onSettled)
  settle.current = onSettled

  useEffect(() => () => { timers.current.forEach(window.clearTimeout) }, [])

  useEffect(() => {
    if (pending || launched.current) return
    launched.current = true

    const after = (delay: number, fn: () => void) => {
      timers.current.push(window.setTimeout(fn, delay))
    }
    const finish = (delay: number) => after(delay, () => settle.current())

    if (failed || prefersReducedMotion()) return finish(SKIP_MS)

    const source = cardRef.current?.getBoundingClientRect()
    const target = document
      .querySelector('[data-nav="calendar"]')
      ?.getBoundingClientRect()

    // No nav to aim at: skip the flight
    if (!source || !target || target.width === 0) return finish(SKIP_MS)

    const dx = (target.left + target.width / 2) - (source.left + source.width / 2)
    const dy = (target.top + target.height / 2) - (source.top + source.height / 2)

    setFlight({
      from: { top: source.top, left: source.left, width: source.width, height: source.height },
      to: { x: target.left + target.width / 2, y: target.top + target.height / 2 },
      dx,
      dy,
      // Arc height scales with the horizontal distance only, so the phone's
      // mostly vertical throw still reads as a drop
      lift: Math.min(170, Math.max(50, Math.abs(dx) * 0.30 + 50)),
    })

    after(HALO_DELAY_MS, () => setHalo(true))
    finish(SETTLE_MS)
  }, [pending, failed])

  const flying = flight !== null
  const detail = [
    sets === undefined ? null : `${sets} ${sets === 1 ? 'set' : 'sets'}`,
    durationLabel ?? null,
  ].filter(Boolean).join(' · ')

  return (
    <>
      <SessionStatus
        headline={flying ? 'Saved to your calendar' : `${headline}…`}
        detail={detail}
        live={pending}
        cardRef={cardRef}
        // Keeps its layout space while the clone flies
        cardHidden={flying}
      />

      {flight && createPortal(
        <div className="fixed inset-0 z-[60] pointer-events-none">
          <div
            className="st-toss absolute"
            style={{
              top: flight.from.top,
              left: flight.from.left,
              width: flight.from.width,
              height: flight.from.height,
              willChange: 'transform, opacity',
              ['--st-dx' as string]: `${flight.dx}px`,
              ['--st-dy' as string]: `${flight.dy}px`,
              ['--st-lift' as string]: `${flight.lift}px`,
              ['--st-duration' as string]: `${FLIGHT_MS}ms`,
            }}
          >
            {/* No border trace on the clone — the save is done */}
            <SessionCard detail={detail} />
          </div>

          {halo && (
            <span
              className="st-land absolute block rounded-full border-2 border-brand-teal"
              style={{
                width: 44,
                height: 44,
                top: flight.to.y - 22,
                left: flight.to.x - 22,
                willChange: 'transform, opacity',
              }}
            />
          )}
        </div>,
        document.body
      )}
    </>
  )
}
