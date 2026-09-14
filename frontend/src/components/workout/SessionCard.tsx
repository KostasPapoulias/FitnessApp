/**
 * The card that stands for the session itself while the server is being asked
 * about it — starting one, and finishing one.
 *
 * Shared by both screens on purpose. They are the two ends of the same
 * workout and they used to be two unrelated emoji; one shape means the app
 * looks like it is doing one continuous thing rather than two random ones.
 *
 * Nothing here moves the card. No float, no breath, no scale: a surface that
 * bobs or swells reads as a stalled spinner, and it is what both of these
 * screens did before. The only motion is the teal segment lapping the border,
 * which is the one honest statement available — work is happening, and no
 * claim is made about how much is left.
 */

interface CardProps {
  /** Bold line. The session's name, not a status. */
  title?: string
  /** Second line — "14 sets · 48:20", "6 exercises". */
  detail?: string
  /** Run the perimeter trace. False once the answer is in. */
  live?: boolean
  /** Leading mark: a rotating arc rather than a static dot. */
  spin?: boolean
}

export function SessionCard({ title = 'Workout', detail, live = false, spin = false }: CardProps) {
  return (
    <div className="relative w-[168px] rounded-card border border-brand-teal/45
                    bg-gradient-to-b from-[#0d2f27] to-[#0a231d] px-4 py-3.5 text-left
                    shadow-[0_10px_30px_-12px_rgba(0,0,0,0.9)]">
      <div className="flex items-center gap-2">
        {spin ? <ArcMark /> : <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-brand-teal" />}
        <p className="text-[12.5px] font-extrabold text-white">{title}</p>
      </div>
      <p className="mt-1 text-[11.5px] font-medium text-brand-teal/90">
        {detail || 'Session'}
      </p>

      {live && <PerimeterTrace />}
    </div>
  )
}

/**
 * A teal segment running a lap of the card's own border.
 *
 * An SVG rect rather than a gradient sweep, because the segment has to follow
 * the rounded corners: anything masked across the box travels in a straight
 * line and cuts the corner, which is exactly where the eye is.
 *
 * `pathLength="100"` renormalises the perimeter to 100 units, so the dash
 * pattern is a percentage and one lap is always -100 — no measuring the box,
 * and a taller card laps at the same visual speed rather than slower.
 *
 * `inset-0` on an absolutely positioned child resolves to the PADDING box,
 * which already starts one pixel in — past the card's own 1px border. The rect
 * sits on that boundary and its 2px stroke is centred there, so the segment
 * covers the border exactly and bleeds one pixel inward. Insetting it any
 * further (the obvious `inset-[1px]`, to "clear the border") stacks on top of
 * that pixel and the segment floats inside the outline instead of replacing
 * it — invisible at 1× and unmistakable the moment you zoom.
 *
 * `rx` is 13 rather than the card's 14 for the same reason: a rounded corner
 * inset by a pixel has a radius a pixel smaller.
 *
 * `h-full w-full` is not redundant next to `inset-0`. An `<svg>` is a replaced
 * element, so `height: auto` takes its INTRINSIC height — 150px — and the
 * `bottom` inset is then dropped as over-constrained. The rect's `height="100%"`
 * resolves against that 150px viewport instead of the card, and on a card
 * shorter than 150px the trace hangs visibly out of the bottom.
 */
function PerimeterTrace() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible text-brand-teal"
      aria-hidden="true"
    >
      <rect
        className="st-trace"
        x="0"
        y="0"
        width="100%"
        height="100%"
        rx="13"
        pathLength={100}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Rotation only — the one kind of motion left once bobbing and scaling are out. */
function ArcMark() {
  return (
    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 flex-shrink-0 text-brand-teal" aria-hidden="true">
      <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <circle
        className="st-spin"
        cx="6" cy="6" r="5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray="30 70"
      />
    </svg>
  )
}

/**
 * The centred panel both waits render: card, headline, one line of context.
 *
 * SaveToCalendar wraps this and adds the flight; a wait with nowhere to fly to
 * — starting a session — uses it directly.
 */
export default function SessionStatus({
  headline,
  hint,
  detail,
  spin = false,
  live = true,
  cardRef,
  cardHidden = false,
}: {
  headline: string
  hint?: string
  detail?: string
  spin?: boolean
  live?: boolean
  /** Lets a caller measure the card to fly a copy of it. */
  cardRef?: React.Ref<HTMLDivElement>
  /** Keeps the card's box in the layout while a clone of it is in flight. */
  cardHidden?: boolean
}) {
  return (
    <div className="flex-1 bg-dark-900 flex items-center justify-center px-5">
      <div className="text-center w-full max-w-[300px]">
        <div className="flex justify-center">
          <div ref={cardRef} className={cardHidden ? 'invisible' : undefined}>
            <SessionCard detail={detail} live={live} spin={spin} />
          </div>
        </div>

        <p className="text-white font-semibold mt-5">{headline}</p>
        {hint && <p className="text-dark-300 text-[13px] mt-2 leading-snug">{hint}</p>}
      </div>
    </div>
  )
}
