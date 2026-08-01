import { useState } from 'react'
import { rpeColor, rpeTint, rpeLabel } from './helpers'

// Payload logged to the store when a set/hold completes
export interface LogPayload {
  reps: number
  weight: number
  rpe: number
  restSeconds: number
  duration?: number   // seconds under tension for isometric holds
  distance?: number   // cardio / wod
  time?: number       // cardio / wod
  rounds?: number     // wod rounds completed
}

// Callbacks ActiveWorkout hands to every modality view
export interface ModalityViewProps {
  elapsed: number                       // whole-session seconds
  onRest: (p: LogPayload) => void       // log set → show rest timer
  onAdvance: (p: LogPayload) => void    // log set → next set/exercise, no rest
  onFinish: () => void                  // end the session → Finish screen
  coachEnabled?: boolean
}

// ── LIVE header (pulse badge + workout time + exercise counter) ──
export function LiveHeader({
  label, accent = '#EF4444', time, counterLabel, counter,
}: {
  label: string
  accent?: string
  time: string
  counterLabel?: string
  counter?: string
}) {
  return (
    <div className="flex justify-between items-start pb-3.5 border-b border-dark-600">
      <div>
        <div className="flex items-center gap-1.5 text-xs font-bold tracking-wide" style={{ color: accent }}>
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: accent }} /> {label}
        </div>
        <p className="text-dark-300 text-xs mt-2">Workout time</p>
        <p className="text-[30px] font-extrabold leading-none mt-0.5">{time}</p>
      </div>
      {counter != null && (
        <div className="text-right">
          <p className="text-dark-300 text-xs">{counterLabel ?? 'Exercise'}</p>
          <p className="text-[26px] font-extrabold mt-1">{counter}</p>
        </div>
      )}
    </div>
  )
}

// ── set-progress segment bar (tap to jump) ──
export function SegmentBar({
  count, current, isDone, onGo,
}: {
  count: number
  current: number
  isDone: (i: number) => boolean
  onGo: (i: number) => void
}) {
  return (
    <div className="flex gap-2 mt-4">
      {Array.from({ length: count }, (_, i) => {
        const done = isDone(i)
        const active = i === current
        return (
          <button key={i} onClick={() => onGo(i)} className="flex-1 text-left">
            <div className="h-1 rounded-full" style={{ background: done || active ? '#00D4AA' : '#2A2A2A' }} />
            <div className="mt-1.5 text-xs" style={{
              fontWeight: active ? 700 : 500,
              color: active ? '#00D4AA' : done ? '#AAAAAA' : '#555555',
            }}>
              Set {i + 1} {done ? '✓' : active ? '←' : ''}
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ── RPE 1–10 grid ──
export function RpeRow({ value, onPick }: { value: number; onPick: (n: number) => void }) {
  return (
    <div className="flex gap-[5px]">
      {Array.from({ length: 10 }, (_, i) => i + 1).map(n => {
        const on = n === value
        return (
          <button key={n} onClick={() => onPick(n)}
            className="flex-1 py-2.5 rounded-[9px] text-sm font-extrabold border transition-all active:scale-90"
            style={{
              borderColor: on ? rpeColor(n) : 'transparent',
              background: on ? rpeColor(n) : rpeTint(n),
              color: on ? '#000' : rpeColor(n),
            }}>{n}</button>
        )
      })}
    </div>
  )
}

// ── end-of-effort RPE prompt ──
// Cardio and metcons used to ship a hardcoded RPE (6 and 8), which left the
// fatigue model with no measure of how hard the session actually was — the one
// input that separates a recovery jog from a threshold run.
export function EffortPrompt({
  emoji, label, title, detail, summary, initial = 7, confirmLabel = 'Save & Finish',
  busy, onConfirm,
}: {
  emoji: string
  label: string
  title: string
  detail: string
  summary?: { value: string; label: string }[]
  initial?: number
  confirmLabel?: string
  busy?: boolean
  onConfirm: (rpe: number) => void
}) {
  const [rpe, setRpe] = useState(initial)

  return (
    <div className="min-h-dvh bg-dark-900 text-white px-5 pt-10 pb-8 flex flex-col">
      <div className="text-center">
        <div className="text-[52px] leading-none">{emoji}</div>
        <div className="flex items-center justify-center gap-1.5 text-brand-teal text-xs
                        font-bold tracking-widest mt-3">
          <span className="w-2 h-2 rounded-full bg-brand-teal" /> {label}
        </div>
        <h1 className="text-[24px] font-extrabold leading-tight mt-2">{title}</h1>
        <p className="text-dark-300 text-sm mt-2 max-w-[300px] mx-auto">{detail}</p>
      </div>

      {summary && summary.length > 0 && (
        <div className="grid gap-2.5 mt-6"
          style={{ gridTemplateColumns: `repeat(${summary.length}, minmax(0, 1fr))` }}>
          {summary.map(s => (
            <div key={s.label} className="bg-dark-800 border border-dark-600 rounded-card py-3.5 px-1.5 text-center">
              <div className="text-xl font-extrabold">{s.value}</div>
              <div className="text-[10.5px] text-dark-300 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-7">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[11px] tracking-widest text-dark-300">HOW HARD WAS IT?</span>
          <span className="text-[13px] font-bold" style={{ color: rpeColor(rpe) }}>
            {rpeLabel(rpe, 'standard')}
          </span>
        </div>
        <RpeRow value={rpe} onPick={setRpe} />
        <p className="text-[12px] text-dark-400 mt-3 leading-relaxed">
          1 is barely moving, 10 is everything you had. This is what tells the app
          how much recovery the session actually earned.
        </p>
      </div>

      <div className="flex-1" />

      <button onClick={() => onConfirm(rpe)} disabled={busy}
        className="w-full mt-8 py-[17px] rounded-card bg-brand-teal text-black
                   text-[17px] font-extrabold active:scale-95 transition-transform
                   disabled:opacity-50">
        {busy ? 'Saving…' : confirmLabel}
      </button>
    </div>
  )
}

// ── Gemini coach tip strip ──
export function CoachTip({ text }: { text: string }) {
  return (
    <div className="mt-4 flex gap-2.5 bg-[#0a2a22] border border-brand-teal/25 rounded-card p-3.5">
      <span className="text-base">🤖</span>
      <div>
        <p className="text-[10px] tracking-wide text-brand-teal font-bold mb-1">
          COACH · POWERED BY GEMINI
        </p>
        <p className="text-[13px] text-dark-200 leading-relaxed">{text}</p>
      </div>
    </div>
  )
}

// ── pre-live "get ready, press Start" gate ──
export function LiveStartGate({
  emoji, label, title, detail, onStart, onBack,
}: {
  emoji: string
  label: string
  title: string
  detail: string
  onStart: () => void
  onBack?: () => void
}) {
  return (
    <div className="min-h-dvh bg-dark-900 text-white flex flex-col items-center justify-center px-8 text-center">
      <div className="text-[64px] leading-none mb-4">{emoji}</div>
      <div className="flex items-center gap-1.5 text-brand-teal text-xs font-bold tracking-widest mb-2">
        <span className="w-2 h-2 rounded-full bg-brand-teal" /> {label}
      </div>
      <h1 className="text-[26px] font-extrabold leading-tight">{title}</h1>
      <p className="text-dark-300 text-sm mt-2 max-w-[280px]">{detail}</p>

      <button onClick={onStart}
        className="mt-9 w-full max-w-[320px] py-5 rounded-card bg-brand-teal text-black
                   text-[19px] font-extrabold active:scale-95 transition-transform"
        style={{ boxShadow: '0 10px 30px -8px rgba(0,212,170,0.5)' }}>
        ▶ Start
      </button>
      {onBack && (
        <button onClick={onBack} className="mt-4 text-dark-400 text-sm">← Back to plan</button>
      )}
    </div>
  )
}

// ── UP NEXT card ──
export function UpNext({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="mt-4 bg-dark-800 border border-dark-600 rounded-card px-4 py-3.5">
      <p className="text-[10px] tracking-widest text-dark-400 mb-1">UP NEXT</p>
      <p className="text-[15px] font-bold">{title}</p>
      <p className="text-[12.5px] text-dark-300 mt-0.5">{detail}</p>
    </div>
  )
}
