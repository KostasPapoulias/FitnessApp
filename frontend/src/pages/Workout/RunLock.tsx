import { useEffect, useRef, useState } from 'react'

/**
 * The locked run screen: the topmost layer, so pocket touches can't pause or
 * end a run, and nearly all black to save OLED power. Unlocked by a long
 * press, which works with damp fingers and in glare.
 */

/** Long enough that no accidental contact reaches it. */
const HOLD_MS = 1600
const RING_RADIUS = 46
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

interface Props {
  elapsed: string
  distanceKm: string
  /** Current pace. */
  pace: string
  /** Average pace (distance over time). */
  avgPace: string
  running: boolean
  /** Shown small, so a lost signal is visible without unlocking. */
  statusLabel: string
  statusOk: boolean
  /** Whether a screen wake lock is actually held right now. */
  screenAwake: boolean
  /** The pace target, or null with no coach. Read-only here, so a pocket can't mute it. */
  coachTarget?: string | null
  /** The coach's verdict, worded as on the unlocked strip. */
  coachLabel?: string | null
  coachColor?: string
  /** Re-request the wake lock; must be called from a gesture. */
  onKeepAwake: () => void
  onUnlock: () => void
}

export default function RunLock({
  elapsed, distanceKm, pace, avgPace, running, statusLabel, statusOk,
  screenAwake, coachTarget, coachLabel, coachColor, onKeepAwake, onUnlock,
}: Props) {
  const [holding, setHolding] = useState(false)
  const timer = useRef<number | null>(null)

  // Shift the layout a few pixels each minute to prevent OLED burn-in
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
      // No scroll or overscroll: pull-to-refresh would reload and lose the run
      style={{ touchAction: 'none', overscrollBehavior: 'none' }}
      onContextMenu={e => e.preventDefault()}
      // Any touch re-takes a dropped wake lock (iOS only grants one from a gesture)
      onPointerDown={() => { if (!screenAwake) onKeepAwake() }}
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

        {/* Current pace small; the average is what to steer by on a locked screen */}
        <div className="mt-7 text-[11px] tracking-[0.18em] text-dark-500 tabular-nums">
          NOW {pace} / KM
        </div>

        {coachTarget && (
          <div className="mt-4 flex items-center gap-2 text-[11px] tracking-[0.14em] tabular-nums">
            <span className="text-dark-500">TARGET {coachTarget} / KM</span>
            {coachLabel && (
              <span className="font-bold" style={{ color: coachColor ?? '#00D4AA' }}>
                · {coachLabel.toUpperCase()}
              </span>
            )}
          </div>
        )}
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
              // CSS transition drives the ring, for both hold and release
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

        {/* Whether the screen will stay on — a lock never granted must not look like one held */}
        <p className="text-[11px] text-dark-500 mt-5 text-center leading-relaxed max-w-[240px]">
          {screenAwake
            ? 'Screen locked and staying on — taps are ignored while you run.'
            : 'Screen locked. Your phone may still dim on its own — tap once anywhere to try holding it awake.'}
          <br />
          Hold the ring to get the controls back.
        </p>
      </div>
    </div>
  )
}
