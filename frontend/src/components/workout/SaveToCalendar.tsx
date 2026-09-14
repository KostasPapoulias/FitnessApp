import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import SessionStatus, { SessionCard } from './SessionCard'

/**
 * The "saving your workout" screen: the session as a card, tossed into the
 * Calendar tab once the server has it.
 *
 * It replaced a pulsing 💾. The pulse was the problem — a glyph breathing in
 * and out is the universal shape of "something is stuck", and on a save that
 * returns in 400ms it is a twitch nobody can read. This says two things
 * instead: while the request is out a segment laps the card's border, which is
 * alive without claiming progress and without moving the card itself; when the
 * request lands the card flies to the tab where the workout can now be found,
 * which is the one fact worth showing.
 *
 * ── the flight ──
 * The target is measured, never assumed: `[data-nav="calendar"]` is the icon
 * in the bottom bar on a phone and in the left sidebar on desktop, so the
 * travel vector differs per form factor and by hundreds of pixels. It is read
 * at takeoff — not at mount — because BottomNav publishes its own height on a
 * layout effect and a phone rotating mid-save moves the target.
 *
 * The card in flight is a portalled clone, not the card in the panel. The
 * panel sits inside AppLayout's `<main>`, which takes a transform during a
 * page swipe; a `position: fixed` child of a transformed ancestor anchors to
 * the ancestor rather than the viewport, and the arc would land in the wrong
 * place. Portalling to `document.body` makes that structurally impossible.
 *
 * ── honesty ──
 * The toss plays ONCE, on success, and never while the request is still out.
 * Looping it would show the workout landing in the calendar several times
 * before it was actually there, and on a failed save it would have shown it
 * landing having never arrived at all — which is why `failed` skips the
 * flight entirely rather than playing a prettier version of a lie.
 */

/** Flight time. Long enough to read as a throw, short enough to not be a wait. */
const FLIGHT_MS = 560
/** The impact ring overlaps the last of the flight rather than following it. */
const HALO_DELAY_MS = 460
/** Total hold before the caller may move on — the cap on what this costs. */
const SETTLE_MS = 680
/** Without a flight there is still a beat, so the screen does not just blink. */
const SKIP_MS = 160

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

interface Props {
  /** True while the save request is in flight. */
  pending: boolean
  /** Called once the card has landed, or immediately when there is nothing to play. */
  onSettled: () => void
  /** A failed save must not fly into the calendar — hand the caller back at once. */
  failed?: boolean
  headline?: string
  hint?: string
  /** Shown on the card. Both optional: the card still works as a plain label. */
  sets?: number
  durationLabel?: string
}

interface Flight {
  /** Where the clone starts, in viewport coordinates. */
  from: { top: number; left: number; width: number; height: number }
  /** Where it lands — the centre of the nav icon. */
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
  // Ref, not state: StrictMode mounts effects twice, and a second takeoff
  // would measure a card that is already hidden and fly from the origin.
  const launched = useRef(false)
  const timers = useRef<number[]>([])

  // Held in a ref so the effect below depends on `pending` alone. With the
  // callback in the dependency list, a caller that passes an inline arrow
  // re-runs the effect on every render — the cleanup cancels the settle
  // timer, the `launched` guard then returns early, and the screen waits
  // forever on a save that already succeeded.
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

    // No nav to aim at — a narrow window, a layout change, a future screen
    // that renders this outside AppLayout. Degrade to the plain hand-off
    // rather than throwing the card at the top-left corner.
    if (!source || !target || target.width === 0) return finish(SKIP_MS)

    const dx = (target.left + target.width / 2) - (source.left + source.width / 2)
    const dy = (target.top + target.height / 2) - (source.top + source.height / 2)

    setFlight({
      from: { top: source.top, left: source.left, width: source.width, height: source.height },
      to: { x: target.left + target.width / 2, y: target.top + target.height / 2 },
      dx,
      dy,
      // Height scales with how far ACROSS the throw goes, never with how far
      // down. Folding |dy| in looks reasonable and is wrong on a phone: the
      // nav sits ~390px below the card and barely 70px to the side, so a lift
      // sized from the drop almost exactly cancels it, and the card hangs
      // motionless for the first half of the flight before falling the whole
      // distance in the second. Sized from |dx|, the phone gets a slight bow
      // over a descent that accelerates like a drop, and desktop — which is
      // mostly sideways — gets the full lob.
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
        // Kept in the layout while the clone is in flight, so the text below
        // does not jump up by the card's height at takeoff.
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
            {/* No trace on the clone. The answer is in — there is nothing left
                for it to say it is still waiting on. */}
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
