import { useEffect, useRef, useState } from 'react'
import { useT, MessageKey } from '../../i18n'
import { useWorkoutStore, WodFormat } from '../../store/useWorkoutStore'
import { useLiveCues } from '../../hooks/useLiveCues'
import { cues } from '../../lib/speech'
import { fmtTime,} from './helpers'
import { ModalityViewProps, LiveStartGate, EffortPrompt } from './LiveShared'
import { useModalityVoice } from '../../hooks/useModalityVoice'
import { AlertTriangleIcon, ModalityIcon } from '../../components/icons'

const FORMATS: [WodFormat, MessageKey][] = [
  ['amrap', 'wod.fmtAmrap'], ['fortime', 'wod.fmtForTime'],
  ['emom', 'wod.fmtEmom'], ['rounds', 'wod.fmtRounds'],
]
// exIdx -1 marks a demo movement with no WorkoutExercise behind it — nothing to log
const DEFAULT_MOVES = [
  { exIdx: -1, reps: 5, weight: 0, name: 'Pull-Ups' },
  { exIdx: -1, reps: 10, weight: 0, name: 'Push-Ups' },
  { exIdx: -1, reps: 15, weight: 0, name: 'Air Squats' },
]

export default function WodView({ onFinish, registerVoice }: ModalityViewProps) {
  const { t } = useT()
  const { wodConfig, selectedExercises, completeSet } = useWorkoutStore()

  // Planned movements with their store index, so every movement is logged
  const liveMoves = selectedExercises
    .map((se, exIdx) => ({
      exIdx,
      reps: se.sets[0]?.reps ?? 10,
      // The movement's load, planned in WodPlan
      weight: se.sets[0]?.weight ?? 0,
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

  // Audible round count and cap cues — the athlete can't watch the screen
  const cue = useLiveCues()

  /** True when only the demo movements remain, so nothing will be logged — the screen says so. */
  const nothingToLog = liveMoves.length === 0

  const box = useRef({ running, format, sec, started })
  box.current = { running, format, sec, started }
  const cueRef = useRef(cue)
  cueRef.current = cue

  useEffect(() => {
    const id = setInterval(() => {
      const b = box.current
      if (!b.started || !b.running) return
      if (b.format === 'amrap' || b.format === 'emom') {
        // Count off the value about to show
        cueRef.current.countdown(CAP - (b.sec + 1))
      }
      if (b.format === 'amrap' && b.sec + 1 >= CAP) {
        setSec(CAP); setRunning(false)
        cueRef.current.buzz('complete')
        cueRef.current.interrupt(cues.capReached(roundsRef.current))
      }
      else setSec(s => s + 1)
    }, 1000)
    return () => clearInterval(id)
  }, [CAP])

  // For the cap cue, which fires inside the interval
  const roundsRef = useRef(0)

  const reset = (f: WodFormat = format) => {
    setFormat(f); setSec(0); setRunning(true); setRounds(0); setDone(moves.map(() => false)); setFinishSec(null)
  }

  const registerRound = () => {
    const r = rounds + 1
    setRounds(r)
    roundsRef.current = r
    setDone(moves.map(() => false))
    if ((format === 'fortime' || format === 'rounds') && r >= TARGET) {
      setRunning(false); setFinishSec(sec)
      cue.buzz('complete')
      cue.interrupt(cues.capReached(r))
      return
    }
    cue.buzz('milestone')
    cue.say(cues.roundComplete(r))
  }
  const tapMove = (i: number) => {
    const next = done.slice(); next[i] = !next[i]
    if (next.length && next.every(Boolean)) registerRound()
    else setDone(next)
  }

  const roundReps = moves.reduce((a, m) => a + m.reps, 0)
  const partialReps = done.reduce((a, d, i) => a + (d ? (moves[i]?.reps ?? 0) : 0), 0)
  const finished = !running && finishSec != null

  // Log the metcon against every movement: the shared clock plus each
  // movement's reps per round. The backend scores it once and splits it.
  const endSession = async (rpe: number) => {
    // Ref guard against a double tap logging it twice
    if (endingRef.current) return
    endingRef.current = true
    setEnding(true)

    const elapsed = finishSec ?? sec
    // Partial rounds count — a half-finished round is real work
    const scoredRounds = rounds + (roundReps > 0 ? partialReps / roundReps : 0)

    for (const move of moves) {
      if (move.exIdx < 0) continue   // demo movement, nothing to log against
      await completeSet(
        {
          time: elapsed, rpe, restSeconds: 0, reps: move.reps,
          // The movement's load (0 for bodyweight)
          weight: move.weight,
          rounds: scoredRounds,
        },
        { exIdx: move.exIdx, setIdx: 0 }
      )
    }
    if (!nothingToLog) {
      cue.buzz('logged')
      cue.say(cues.metconLogged(scoredRounds, Math.max(1, Math.round(elapsed / 60))))
    }
    onFinish()
  }

  // Voice control ("round done"). Above the early returns — it is a hook.
  useModalityVoice(registerVoice, command => {
    switch (command.kind) {
      case 'pauseRest':  setRunning(false); return true
      case 'resumeRest': setRunning(true); return true
      // "round done" and "next" both mean: count the round
      case 'mark':
      case 'skipRest':
      case 'advance':
        if (finished) return true
        registerRound()
        return true
      default: return false
    }
  })

  if (!started) {
    return (
      <LiveStartGate
        icon={<ModalityIcon modality="WOD" className="w-14 h-14" />}
        label={t('wod.header')}
        title={t(FORMATS.find(f => f[0] === format)?.[1] ?? 'wod.header')}
        detail={format === 'amrap' || format === 'emom'
          ? t('wod.introCap', { count: moves.length, cap: fmtTime(CAP) })
          : t('wod.introRounds', { count: moves.length, rounds: TARGET })}
        onStart={() => setStarted(true)}
      />
    )
  }

  // ── effort rating (before the sets are written) ──
  if (rating) {
    return (
      <EffortPrompt
        icon={<ModalityIcon modality="WOD" className="w-14 h-14" />}
        label={t('wod.doneLabel')}
        title={t('wod.rateTitle')}
        detail={t('wod.rateDetail')}
        summary={[
          { value: fmtTime(finishSec ?? sec), label: t('sets.statTime') },
          { value: String(rounds), label: t('wod.statRounds') },
          { value: String(rounds * roundReps + partialReps), label: t('wod.statTotalReps') },
        ]}
        initial={8}
        busy={ending}
        onConfirm={endSession}
      />
    )
  }

  // Clock display
  let clock = '', clockLabel = '', clockSub = '', clockColor = '#FFFFFF', clockBg = '#1A1A1A', clockBorder = '#2A2A2A'
  let roundsValue = String(rounds), roundsLabel = t('wod.roundsDone'), scoreValue = '', scoreLabel = ''
  if (format === 'amrap') {
    const rem = Math.max(0, CAP - sec)
    clock = fmtTime(rem); clockLabel = t('wod.capRemaining')
    clockSub = running
      ? t('wod.amrapSub', { cap: fmtTime(CAP) })
      : (rem === 0 ? t('wod.timeUp') : t('wod.paused'))
    if (rem <= 30 && rem > 0) { clockColor = '#EF4444'; clockBg = '#1a0d0d'; clockBorder = 'rgba(239,68,68,0.4)' }
    scoreValue = `${rounds}+${partialReps}`; scoreLabel = 'Score (rounds + reps)'
  } else if (format === 'fortime') {
    clock = fmtTime(finished ? finishSec! : sec)
    clockLabel = t(finished ? 'wod.finishTime' : 'wod.elapsed')
    clockSub = finished
      ? t('wod.forTimeDone', { rounds: TARGET })
      : (running ? t('wod.forTimeSub', { rounds: TARGET }) : t('wod.paused'))
    if (finished) { clockColor = '#00D4AA'; clockBg = '#0a2a22'; clockBorder = 'rgba(0,212,170,0.4)' }
    roundsValue = `${rounds}/${TARGET}`; roundsLabel = t('wod.roundsLabel')
    scoreValue = finished ? fmtTime(finishSec!) : String(TARGET - rounds)
    scoreLabel = t(finished ? 'wod.finalTime' : 'wod.roundsToGo')
  } else if (format === 'emom') {
    const minute = Math.floor(sec / 60) + 1; const secLeft = 60 - (sec % 60)
    clock = ':' + String(secLeft).padStart(2, '0'); clockLabel = `MINUTE ${minute}`
    clockSub = running ? t('wod.emomSub') : t('wod.paused')
    if (secLeft <= 10) clockColor = '#FACC15'
    roundsValue = String(minute); roundsLabel = t('wod.currentMinute')
    scoreValue = String(rounds); scoreLabel = t('wod.minutesCleared')
  } else {
    clock = fmtTime(finished ? finishSec! : sec)
    clockLabel = t(finished ? 'wod.finishTime' : 'wod.elapsed')
    clockSub = finished
      ? t('wod.roundsAllDone', { rounds: TARGET })
      : (running ? t('wod.roundsSub', { rounds: TARGET }) : t('wod.paused'))
    if (finished) { clockColor = '#00D4AA'; clockBg = '#0a2a22'; clockBorder = 'rgba(0,212,170,0.4)' }
    roundsValue = `${rounds}/${TARGET}`; roundsLabel = t('wod.roundsDone')
    scoreValue = String(rounds * roundReps); scoreLabel = t('wod.totalReps')
  }

  return (
    <div className="flex-1 bg-dark-900 text-white px-5 pt-4 pb-4">
      {/* header */}
      <div className="flex items-center justify-between pb-3">
        <div className="flex items-center gap-1.5 text-brand-red text-xs font-bold tracking-wide">
          <span className="w-2 h-2 rounded-full bg-brand-red animate-pulse" /> LIVE · WOD
        </div>
        <div className="text-[13px] text-dark-300 font-bold">{moves.length} movements</div>
      </div>

      {/* Format tabs — switchable only before the clock starts, so a mis-tap can't erase a score */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {FORMATS.map(([id, label]) => {
          const on = format === id
          const locked = sec > 0 || rounds > 0
          if (locked && !on) return null
          return (
            <button key={id} onClick={() => { if (!locked) reset(id) }} disabled={locked}
              className="whitespace-nowrap flex-shrink-0 text-[12.5px] font-bold px-3.5 py-2 rounded-full border"
              style={{
                borderColor: on ? '#00D4AA' : '#2A2A2A',
                background: on ? 'rgba(0,212,170,0.14)' : '#1A1A1A',
                color: on ? '#00D4AA' : '#AAAAAA',
              }}>{t(label)}</button>
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

      {nothingToLog && (
        <div className="mt-3.5 flex gap-2.5 px-4 py-3 rounded-card border border-brand-yellow/40 bg-[#2a2410]">
          <AlertTriangleIcon className="w-4 h-4" />
          <p className="flex-1 text-[12.5px] text-white leading-snug">
            {t('wod.demoBefore')}
            <span className="font-bold">{t('wod.demoBold')}</span>{t('wod.demoAfter')}
          </p>
        </div>
      )}

      {/* movements */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-2.5">
          <div className="text-[10px] tracking-widest text-dark-400">{t('wod.eachRound')}</div>
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
                <div className="flex-1 min-w-0">
                  <div className="text-[14.5px] font-semibold truncate">{m.name}</div>
                  {/* Load shown only when there is one */}
                  {m.weight > 0 && (
                    <div className="text-[11px] font-bold text-brand-orange mt-0.5">{m.weight} kg</div>
                  )}
                </div>
                <ModalityIcon modality="WOD" className="w-4 h-4" />
              </button>
            )
          })}
        </div>
      </div>

      {/* primary */}
      <button onClick={finished ? () => reset() : registerRound}
        className="w-full mt-3.5 py-[17px] rounded-btn text-base font-extrabold active:scale-95 transition-transform"
        style={finished ? { background: '#1E1E1E', color: '#888888' } : { background: '#00D4AA', color: '#000' }}>
        {t(finished ? 'wod.allDone' : 'wod.completeRound')}
      </button>

      <div className="grid grid-cols-2 gap-2.5 mt-2.5">
        <button onClick={() => setRunning(r => !r)}
          className="py-3.5 rounded-btn border border-dark-600 bg-dark-800 text-white text-sm font-bold
                     active:scale-95 transition-transform">
          {t(running ? 'rest.pause' : 'rest.resume')}
        </button>
        <button onClick={() => reset()}
          className="py-3.5 rounded-btn border border-dark-600 bg-dark-800 text-dark-200 text-sm font-semibold
                     active:scale-95 transition-transform">
          {t('wod.reset')}
        </button>
      </div>


      <button onClick={() => setRating(true)}
        className="w-full mt-3 py-3.5 rounded-btn border border-brand-red/40 bg-[#2a1a1a]
                   text-brand-red text-sm font-bold active:scale-95 transition-transform">
        {t('cardio.endSession')}
      </button>
    </div>
  )
}
