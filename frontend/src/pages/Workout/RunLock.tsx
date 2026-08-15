import { useEffect, useRef, useState } from 'react'

/**
 * The locked run screen.
 *
 * Two jobs. It stops a pocket, a sleeve or a raindrop from pausing a run or
 * ending a session — it is the topmost layer, so every touch lands here and
 * nowhere else. And it is nearly all black, which on the OLED in every iPhone
 * since the X means most of the panel is genuinely switched off while the wake
 * lock holds the screen on for forty minutes.
 *
 * Hold-to-unlock rather than a drawn pattern: this gets used while moving,
 * breathing hard, with damp fingers and often in glare. A gesture needing fine
 * motor precision fails exactly when someone is trying to stop the clock at the
 * end of an interval. A held press is just as immune to a pocket brush and
 * cannot really be got wrong.
 */

/** Long enough that no accidental contact reaches it. */
const HOLD_MS = 1600
const RING_RADIUS = 46
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

interface Props {
  elapsed: string
  distanceKm: string
  /** Current pace — what the legs are doing this minute. */
  pace: string
  /** Distance over time. The one that survives a red light. */
  avgPace: string
  running: boolean
  /** Shown small, so a lost signal is visible without unlocking. */
  statusLabel: string
  statusOk: boolean
  onUnlock: () => void
}

export default function RunLock({
  elapsed, distanceKm, pace, avgPace, running, statusLabel, statusOk, onUnlock,
}: Props) {
  const [holding, setHolding] = useState(false)
  const timer = useRef<number | null>(null)

  // A static readout at high brightness for the length of a long run is the
  // one situation where OLED burn-in is a real risk. Nudging the whole layout
  // by a few pixels every minute costs nothing and removes it.
  const [drift, setDrift] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setDrift(d => (d + 1) % 4), 60_000)
    return () => clearInterval(id)
  }, [])
  const offset = [-3, 0, 3, 0][drift]

  const begin = () => {
    if (timer.current !== null) return
    setHolding(true)
    timer.current = window.setTimeout(() => {
      timer.current = null
      setHolding(false)
      onUnlock()
    }, HOLD_MS)
  }

  const cancel = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
    setHolding(false)
  }

  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current) }, [])

  return (
    <div
      className="fixed inset-0 z-50 bg-black text-white flex flex-col
                 items-center justify-between px-6 py-10 select-none"
      // Nothing on this layer scrolls, and an overscroll at the top of a
      // standalone PWA is a pull-to-refresh — which reloads the page and takes
      // the run with it.
      style={{ touchAction: 'none', overscrollBehavior: 'none' }}
      onContextMenu={e => e.preventDefault()}
    >
      <div
        className="flex flex-col items-center transition-transform duration-1000"
        style={{ transform: `translateY(${offset}px)` }}
      >
        <div className="flex items-center gap-2 mt-2">
          <span
            className={`w-1.5 h-1.5 rounded-full ${running ? 'animate-pulse' : ''}`}
            style={{ background: statusOk ? '#00D4AA' : '#F97316' }}
          />
          <span className="text-[10px] tracking-[0.2em] text-dark-400 uppercase">
            {running ? statusLabel : 'Paused'}
          </span>
        </div>

        <div className="text-[13vw] leading-none font-extrabold tabular-nums mt-8 tracking-tight">
          {elapsed}
        </div>
        <div className="text-[10px] tracking-[0.25em] text-dark-500 mt-2">ELAPSED</div>

        <div className="flex items-end gap-10 mt-14">
          {[
            { value: distanceKm, unit: 'KM' },
            { value: avgPace, unit: 'AVG / KM' },
          ].map(stat => (
            <div key={stat.unit} className="text-center">
              <div className="text-[9vw] leading-none font-extrabold tabular-nums">{stat.value}</div>
              <div className="text-[9.5px] tracking-[0.2em] text-dark-500 mt-2.5">{stat.unit}</div>
            </div>
          ))}
        </div>

        {/* Current pace, deliberately small: on a locked screen the average is
            what you steer by, and the live number moves too much to read at a
            glance while running. */}
        <div className="mt-7 text-[11px] tracking-[0.18em] text-dark-500 tabular-nums">
          NOW {pace} / KM
        </div>
      </div>

      <div className="flex flex-col items-center">
        <button
          onPointerDown={begin}
          onPointerUp={cancel}
          onPointerLeave={cancel}
          onPointerCancel={cancel}
          className="relative w-[112px] h-[112px] flex items-center justify-center"
          aria-label="Hold to unlock the screen"
        >
          <svg width="112" height="112" className="absolute inset-0 -rotate-90">
            <circle
              cx="56" cy="56" r={RING_RADIUS}
              fill="none" stroke="#1a1a1a" strokeWidth="3"
            />
            <circle
              cx="56" cy="56" r={RING_RADIUS}
              fill="none" stroke="#00D4AA" strokeWidth="3" strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              // Driven by a CSS transition rather than an animation frame loop:
              // one property, no JS running per frame, and the release path is
              // the same code as the hold path with a different duration.
              strokeDashoffset={holding ? 0 : RING_CIRCUMFERENCE}
              style={{
                transition: holding
                  ? `stroke-dashoffset ${HOLD_MS}ms linear`
                  : 'stroke-dashoffset 220ms ease-out',
              }}
            />
          </svg>
          <span className="text-[11px] tracking-[0.15em] text-dark-300 font-bold">
            {holding ? 'HOLD…' : 'UNLOCK'}
          </span>
        </button>

        <p className="text-[11px] text-dark-500 mt-5 text-center leading-relaxed max-w-[240px]">
          Screen locked — taps are ignored while you run.
          <br />
          Hold the ring to get the controls back.
        </p>
      </div>
    </div>
  )
}
