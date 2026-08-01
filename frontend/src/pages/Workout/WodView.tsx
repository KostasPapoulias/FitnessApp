import { useEffect, useRef, useState } from 'react'
import { useWorkoutStore, WodFormat } from '../../store/useWorkoutStore'
import { fmtTime, exerciseEmoji } from './helpers'
import { ModalityViewProps, CoachTip, LiveStartGate, EffortPrompt } from './LiveShared'

const FORMATS: [WodFormat, string][] = [['amrap', 'AMRAP'], ['fortime', 'For Time'], ['emom', 'EMOM'], ['rounds', 'Rounds']]
// exIdx -1 marks a demo movement with no WorkoutExercise behind it — nothing to log
const DEFAULT_MOVES = [
  { exIdx: -1, reps: 5, name: 'Pull-Ups' },
  { exIdx: -1, reps: 10, name: 'Push-Ups' },
  { exIdx: -1, reps: 15, name: 'Air Squats' },
]

export default function WodView({ onFinish, coachEnabled }: ModalityViewProps) {
  const { wodConfig, selectedExercises, completeSet } = useWorkoutStore()

  // Planned movements, each keeping its index in the store so the metcon can be
  // logged against every movement rather than only the first one.
  const liveMoves = selectedExercises
    .map((se, exIdx) => ({
      exIdx,
      reps: se.sets[0]?.reps ?? 10,
      name: se.exercise.name,
      skipped: Boolean(se.skipped),
    }))
    .filter(m => !m.skipped)
  const moves = liveMoves.length ? liveMoves : DEFAULT_MOVES
  const CAP = wodConfig?.capSec ?? 720
  const TARGET = wodConfig?.targetRounds ?? 8

  const [started, setStarted] = useState(false)
  const [rating, setRating] = useState(false)
  const [ending, setEnding] = useState(false)
  const endingRef = useRef(false)
  const [format, setFormat] = useState<WodFormat>(wodConfig?.format ?? 'amrap')
  const [sec, setSec] = useState(0)
  const [running, setRunning] = useState(true)
  const [rounds, setRounds] = useState(0)
  const [done, setDone] = useState<boolean[]>(() => moves.map(() => false))
  const [finishSec, setFinishSec] = useState<number | null>(null)

  const box = useRef({ running, format, sec, started })
  box.current = { running, format, sec, started }

  useEffect(() => {
    const id = setInterval(() => {
      const b = box.current
      if (!b.started || !b.running) return
      if (b.format === 'amrap' && b.sec + 1 >= CAP) { setSec(CAP); setRunning(false) }
      else setSec(s => s + 1)
    }, 1000)
    return () => clearInterval(id)
  }, [CAP])

  const reset = (f: WodFormat = format) => {
    setFormat(f); setSec(0); setRunning(true); setRounds(0); setDone(moves.map(() => false)); setFinishSec(null)
  }

  const registerRound = () => {
    const r = rounds + 1
    setRounds(r)
    setDone(moves.map(() => false))
    if ((format === 'fortime' || format === 'rounds') && r >= TARGET) {
      setRunning(false); setFinishSec(sec)
    }
  }
  const tapMove = (i: number) => {
    const next = done.slice(); next[i] = !next[i]
    if (next.length && next.every(Boolean)) registerRound()
    else setDone(next)
  }

  const roundReps = moves.reduce((a, m) => a + m.reps, 0)
  const partialReps = done.reduce((a, d, i) => a + (d ? (moves[i]?.reps ?? 0) : 0), 0)
  const finished = !running && finishSec != null

  // Log the metcon against EVERY movement in it.
  //
  // This used to write a single set, and always at the store's current exercise
  // index — which a metcon never advances. So a three-movement WOD only ever
  // fatigued the first movement's muscles, and the score (rounds and reps) was
  // thrown away entirely. Each movement now carries the shared clock plus its
  // own reps-per-round; the backend scores the metcon once and splits it by rep
  // contribution, so it isn't counted once per movement.
  const endSession = async (rpe: number) => {
    // Ref guard: the summary-set request keeps this button on screen, so a
    // second tap would log the metcon twice and finish twice.
    if (endingRef.current) return
    endingRef.current = true
    setEnding(true)

    const elapsed = finishSec ?? sec
    // Partial rounds count — a half-finished round is real work
    const scoredRounds = rounds + (roundReps > 0 ? partialReps / roundReps : 0)

    for (const move of moves) {
      if (move.exIdx < 0) continue   // demo movement, nothing to log against
      await completeSet(
        { time: elapsed, rpe, restSeconds: 0, reps: move.reps, rounds: scoredRounds },
        { exIdx: move.exIdx, setIdx: 0 }
      )
    }
    onFinish()
  }

  if (!started) {
    return (
      <LiveStartGate
        emoji="🔥"
        label="LIVE · WOD"
        title={FORMATS.find(f => f[0] === format)?.[1] ?? 'WOD'}
        detail={`${moves.length} movements${format === 'amrap' || format === 'emom' ? ` · ${fmtTime(CAP)} cap` : ` · ${TARGET} rounds`}. 3… 2… 1… press start.`}
        onStart={() => setStarted(true)}
      />
    )
  }

  // ── effort rating (before the sets are written) ──
  if (rating) {
    return (
      <EffortPrompt
        emoji="🔥"
        label="METCON DONE"
        title="Rate the effort"
        detail="Work density and effort are what make a metcon cost what it does — the clock alone can't tell."
        summary={[
          { value: fmtTime(finishSec ?? sec), label: 'time' },
          { value: String(rounds), label: 'rounds' },
          { value: String(rounds * roundReps + partialReps), label: 'total reps' },
        ]}
        initial={8}
        busy={ending}
        onConfirm={endSession}
      />
    )
  }

  // clock block
  let clock = '', clockLabel = '', clockSub = '', clockColor = '#FFFFFF', clockBg = '#1A1A1A', clockBorder = '#2A2A2A'
  let roundsValue = String(rounds), roundsLabel = 'Rounds done', scoreValue = '', scoreLabel = ''
  if (format === 'amrap') {
    const rem = Math.max(0, CAP - sec)
    clock = fmtTime(rem); clockLabel = 'TIME CAP REMAINING'
    clockSub = running ? `AMRAP ${fmtTime(CAP)} · as many rounds as possible` : (rem === 0 ? 'Time! Log your score.' : 'Paused')
    if (rem <= 30 && rem > 0) { clockColor = '#EF4444'; clockBg = '#1a0d0d'; clockBorder = 'rgba(239,68,68,0.4)' }
    scoreValue = `${rounds}+${partialReps}`; scoreLabel = 'Score (rounds + reps)'
  } else if (format === 'fortime') {
    clock = fmtTime(finished ? finishSec! : sec); clockLabel = finished ? 'FINISH TIME' : 'ELAPSED'
    clockSub = finished ? `Done — ${TARGET} rounds complete` : (running ? `${TARGET} rounds for time` : 'Paused')
    if (finished) { clockColor = '#00D4AA'; clockBg = '#0a2a22'; clockBorder = 'rgba(0,212,170,0.4)' }
    roundsValue = `${rounds}/${TARGET}`; roundsLabel = 'Rounds'
    scoreValue = finished ? fmtTime(finishSec!) : String(TARGET - rounds); scoreLabel = finished ? 'Final time' : 'Rounds to go'
  } else if (format === 'emom') {
    const minute = Math.floor(sec / 60) + 1; const secLeft = 60 - (sec % 60)
    clock = ':' + String(secLeft).padStart(2, '0'); clockLabel = `MINUTE ${minute}`
    clockSub = running ? 'Every minute on the minute · finish, then rest' : 'Paused'
    if (secLeft <= 10) clockColor = '#FACC15'
    roundsValue = String(minute); roundsLabel = 'Current minute'
    scoreValue = String(rounds); scoreLabel = 'Minutes cleared'
  } else {
    clock = fmtTime(finished ? finishSec! : sec); clockLabel = finished ? 'FINISH TIME' : 'ELAPSED'
    clockSub = finished ? `All ${TARGET} rounds done` : (running ? `${TARGET} rounds for reps` : 'Paused')
    if (finished) { clockColor = '#00D4AA'; clockBg = '#0a2a22'; clockBorder = 'rgba(0,212,170,0.4)' }
    roundsValue = `${rounds}/${TARGET}`; roundsLabel = 'Rounds done'
    scoreValue = String(rounds * roundReps); scoreLabel = 'Total reps'
  }

  const coachTip = format === 'amrap'
    ? 'Pace the first few rounds like they’re easy — break sets before you have to. Consistent unbroken sets beat a fast start.'
    : format === 'emom'
    ? 'Aim to finish each minute with ~15s to spare. If you can’t, scale the reps to keep the rest window.'
    : 'Settle into a sustainable rhythm and only surge on the final two rounds.'

  return (
    <div className="min-h-dvh bg-dark-900 text-white px-5 pt-4 pb-4">
      {/* header */}
      <div className="flex items-center justify-between pb-3">
        <div className="flex items-center gap-1.5 text-brand-red text-xs font-bold tracking-wide">
          <span className="w-2 h-2 rounded-full bg-brand-red animate-pulse" /> LIVE · WOD
        </div>
        <div className="text-[13px] text-dark-300 font-bold">{moves.length} movements</div>
      </div>

      {/* format tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {FORMATS.map(([id, label]) => {
          const on = format === id
          return (
            <button key={id} onClick={() => reset(id)}
              className="whitespace-nowrap flex-shrink-0 text-[12.5px] font-bold px-3.5 py-2 rounded-full border"
              style={{
                borderColor: on ? '#00D4AA' : '#2A2A2A',
                background: on ? 'rgba(0,212,170,0.14)' : '#1A1A1A',
                color: on ? '#00D4AA' : '#AAAAAA',
              }}>{label}</button>
          )
        })}
      </div>

      {/* clock */}
      <div className="mt-4 text-center rounded-2xl px-4"
        style={{ background: clockBg, border: `1px solid ${clockBorder}`, paddingTop: 22, paddingBottom: 22 }}>
        <div className="text-[11px] tracking-[0.1em] text-dark-300">{clockLabel}</div>
        <div className="text-[72px] font-extrabold leading-none tracking-tight" style={{ color: clockColor }}>{clock}</div>
        <div className="text-[13px] text-dark-300 mt-1.5">{clockSub}</div>
      </div>

      {/* rounds / score */}
      <div className="grid grid-cols-2 gap-2.5 mt-3.5">
        <div className="bg-dark-800 border border-dark-600 rounded-card py-3.5 text-center">
          <div className="text-[32px] font-extrabold leading-none">{roundsValue}</div>
          <div className="text-[11px] text-dark-300 mt-1.5">{roundsLabel}</div>
        </div>
        <div className="rounded-card py-3.5 text-center border border-brand-teal/30" style={{ background: '#0a2a22' }}>
          <div className="text-[32px] font-extrabold leading-none text-brand-teal">{scoreValue}</div>
          <div className="text-[11px] text-dark-200 mt-1.5">{scoreLabel}</div>
        </div>
      </div>

      {/* movements */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-2.5">
          <div className="text-[10px] tracking-widest text-dark-400">EACH ROUND</div>
          <div className="text-xs text-dark-300">{moves.map(m => m.reps).join(' · ')}</div>
        </div>
        <div className="flex flex-col gap-2">
          {moves.map((m, i) => {
            const on = done[i]
            return (
              <button key={i} onClick={() => tapMove(i)}
                className="flex items-center gap-3 w-full text-left px-3.5 py-3 rounded-btn border"
                style={{
                  borderColor: on ? 'rgba(0,212,170,0.4)' : '#2A2A2A',
                  background: on ? '#0a2a22' : '#1A1A1A',
                  opacity: running ? 1 : 0.6,
                }}>
                <span className="w-6 h-6 rounded-[7px] flex items-center justify-center text-sm font-extrabold flex-shrink-0"
                  style={{
                    border: `1px solid ${on ? '#00D4AA' : '#333333'}`,
                    background: on ? '#00D4AA' : 'transparent', color: '#000',
                  }}>{on ? '✓' : ''}</span>
                <span className="text-[15px] font-extrabold min-w-[40px]">{m.reps}</span>
                <span className="flex-1 text-[14.5px] font-semibold truncate">{m.name}</span>
                <span className="text-base">{exerciseEmoji({ modality: 'WOD' })}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* primary */}
      <button onClick={finished ? () => reset() : registerRound}
        className="w-full mt-3.5 py-[17px] rounded-btn text-base font-extrabold active:scale-95 transition-transform"
        style={finished ? { background: '#1E1E1E', color: '#888888' } : { background: '#00D4AA', color: '#000' }}>
        {finished ? 'Workout complete — tap Reset' : '✓ Complete Round'}
      </button>

      <div className="grid grid-cols-2 gap-2.5 mt-2.5">
        <button onClick={() => setRunning(r => !r)}
          className="py-3.5 rounded-btn border border-dark-600 bg-dark-800 text-white text-sm font-bold
                     active:scale-95 transition-transform">
          {running ? '‖ Pause' : '▶ Resume'}
        </button>
        <button onClick={() => reset()}
          className="py-3.5 rounded-btn border border-dark-600 bg-dark-800 text-dark-200 text-sm font-semibold
                     active:scale-95 transition-transform">
          ↻ Reset
        </button>
      </div>

      {coachEnabled !== false && <CoachTip text={coachTip} />}

      <button onClick={() => setRating(true)}
        className="w-full mt-3 py-3.5 rounded-btn border border-brand-red/40 bg-[#2a1a1a]
                   text-brand-red text-sm font-bold active:scale-95 transition-transform">
        ■ End Session
      </button>
    </div>
  )
}
