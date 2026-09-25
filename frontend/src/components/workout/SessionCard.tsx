/**
 * The session card shown while a session is starting or finishing. The only
 * motion is a segment lapping the border — no bobbing or scaling.
 */

interface CardProps {
  /** Bold line: the session's name. */
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
 * A teal segment lapping the card's border. `pathLength="100"` makes one lap
 * -100 whatever the card's size. The rect sits on the padding box (rx 13, one
 * less than the card), and `h-full w-full` is required — an <svg> otherwise
 * defaults to 150px tall.
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

/** A rotating arc. */
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

/** The centred waiting panel: card, headline, one line of context. */
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
