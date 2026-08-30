import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFatigueStore } from '../../store/useFatigueStore'
import { useWorkoutStore } from '../../store/useWorkoutStore'
import { useSessionPrefsStore } from '../../store/useSessionPrefsStore'
import { templateService } from '../../services/template.service'
import CoachMark, { HINTS } from '../../components/onboarding/CoachMark'
import VoiceCommandSheet from '../../components/workout/VoiceCommandSheet'
import { ScheduledWorkout } from '../../types'
import { workoutService, ActiveSession } from '../../services/workout.service'

// ── modality catalogue (id → label/desc/CTA), matching the prototype ──
type ModId = 'strength' | 'calisthenics' | 'cardio' | 'mobility' | 'wod'
const MODALITIES: { id: ModId; label: string; desc: string; cta: string }[] = [
  { id: 'strength',     label: 'Strength',     desc: 'Weights & machines',   cta: 'Browse Exercises →' },
  { id: 'calisthenics', label: 'Calisthenics', desc: 'Bodyweight & skills',  cta: 'Browse Exercises →' },
  { id: 'cardio',       label: 'Cardio',       desc: 'Runs, swims & rides',  cta: 'Choose Activity →' },
  { id: 'mobility',     label: 'Mobility',     desc: 'Yoga, pilates, stretch', cta: 'Browse Flows →' },
  { id: 'wod',          label: 'WOD',          desc: 'CrossFit & metcons',   cta: 'Browse WODs →' },
]
// label sent to the browse/exercise screens (ExerciseList filters on this)
const MOD_LABEL: Record<ModId, string> = {
  strength: 'Strength', calisthenics: 'Calisthenics', cardio: 'Cardio',
  mobility: 'Mobility', wod: 'WOD',
}

const FEELINGS = ['Dead', 'Tired', 'Okay', 'Ready', 'Beast']
const ENERGY_COLORS = ['#EF4444', '#F97316', '#FACC15', '#4ADE80', '#00D4AA']

// Five ascending bars, coloured by the selected level
function EnergyBars({ level }: { level: number }) {
  return (
    <div className="flex items-end gap-[3px] h-5">
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} style={{
          width: 4,
          height: 5 + i * 3.4,
          borderRadius: 2,
          background: i <= level ? ENERGY_COLORS[level] : 'var(--dark-600, #2A2A2A)',
        }} />
      ))}
    </div>
  )
}

// ── modality icons ──
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const ModIcon = ({ id }: { id: ModId }) => {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', ...S }
  switch (id) {
    case 'strength': return <svg {...common}><path d="M6 4v16M18 4v16M4 8h4M16 8h4M4 16h4M16 16h4" /></svg>
    case 'calisthenics': return <svg {...common}><circle cx="12" cy="5" r="2" /><path d="M12 7v6M6 10h12M12 13l-4 6M12 13l4 6" /></svg>
    case 'cardio': return <svg {...common}><path d="M3 12h4l2-6 3.5 12L15 9l2 3h4" /></svg>
    case 'mobility': return <svg {...common}><circle cx="12" cy="4" r="2" /><path d="M12 6v5M12 11l-6 3M12 11l6 3M6 14l1 6M18 14l-1 6" /></svg>
    case 'wod': return <svg {...common}><path d="M13 2L5 13h6l-1 9 9-12h-6l1-8z" /></svg>
  }
}
const IcMic = () => <svg width="20" height="20" viewBox="0 0 24 24" {...S}><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" /></svg>
const IcVibrate = () => <svg width="20" height="20" viewBox="0 0 24 24" {...S}><path d="M8 4h8v16H8z" /><path d="M4 8v8M20 8v8" /></svg>
const IcSpeaker = () => <svg width="20" height="20" viewBox="0 0 24 24" {...S}><path d="M4 9v6h4l5 4V5L8 9H4z" /><path d="M17 8a5 5 0 0 1 0 8" /></svg>
const IcSpark = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /></svg>
const IcCheck = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>

// iOS-style toggle
function Toggle({ on, onChange, disabled }: {
  on: boolean; onChange: (v: boolean) => void; disabled?: boolean
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!on)}
      disabled={disabled}
      aria-pressed={on}
      className={`w-10 h-6 rounded-full flex items-center px-0.5 transition-all duration-200
                 disabled:opacity-30
                 ${on && !disabled ? 'bg-brand-teal justify-end' : 'bg-dark-600 justify-start'}`}
    >
      <div className="w-5 h-5 bg-white rounded-full shadow" />
    </button>
  )
}

export default function StartWorkout() {
  const navigate = useNavigate()
  const { muscles } = useFatigueStore()
  const { clearExercises } = useWorkoutStore()

  const [feeling, setFeeling] = useState(3)
  const [modality, setModality] = useState<ModId>('strength')

  // Persisted and device-local — the screen that owns these switches is
  // unmounted by the time the workout they govern starts, so they cannot live
  // in local state and still reach the live session.
  const {
    voice, haptic, audio, voiceSupported,
    setVoice, setHaptic, setAudio, probeVoiceSupport,
  } = useSessionPrefsStore()

  const [showVoiceHelp, setShowVoiceHelp] = useState(false)

  useEffect(() => { void probeVoiceSupport() }, [probeVoiceSupport])

  const activeMod = MODALITIES.find(m => m.id === modality)!

  // Today, e.g. "Tuesday, July 15"
  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  // Coach copy from real fatigue data
  const recovered = muscles.filter(m => m.status === 'recovered').map(m => m.muscleName)
  const highFatigue = muscles.filter(m => m.status === 'high').map(m => m.muscleName)
  const coachByMod: Record<ModId, string> = {
    strength: recovered.length
      ? `Your ${recovered.slice(0, 2).join(' and ')} are recovered — a great day for a push session.`
      : 'All muscles recovered — great day for a full-body session.',
    calisthenics: 'Upper body is fresh. Good day for pull work and skill practice.',
    cardio: highFatigue.length
      ? `${highFatigue[0]} still fatigued. Keep it Zone 2 — an easy 30-minute effort.`
      : 'Legs are fresh — a good day for a tempo effort.',
    mobility: highFatigue.length
      ? `High ${highFatigue[0]} fatigue. A hip-opening flow will speed recovery.`
      : 'A short mobility flow keeps you loose between sessions.',
    wod: 'Moderate fatigue overall. A short AMRAP keeps intensity without overreaching.',
  }
  const coachChips = (recovered.length ? recovered : ['All groups']).slice(0, 2)
    .map(m => `${m} · Recovered`)

  const handleBrowse = () => {
    clearExercises()
    const label = MOD_LABEL[modality]
    // Strength picks a muscle group first; every other modality picks
    // exercises / a type / movements directly (filtered by modality).
    if (modality === 'strength') {
      navigate('/workout/browse', { state: { modality: label } })
    } else {
      navigate('/workout/exercises', { state: { modality: label, direct: true } })
    }
  }

  const Eyebrow = ({ children }: { children: React.ReactNode }) => (
    <p className="text-[11px] font-bold tracking-[1.4px] text-dark-300 mb-3">{children}</p>
  )

  return (
    <div className="flex-1 bg-dark-900 text-white px-5 pt-6 pb-6 overflow-y-auto">

      {/* Title */}
      <div className="relative">
        <h1 className="text-[27px] font-extrabold tracking-tight">Start Workout</h1>
        <p className="text-dark-300 text-[13px] mt-1 mb-5">{todayLabel}</p>

        <CoachMark
          hintKey={HINTS.workout}
          placement="bottom"
          className="left-0"
          title="Pick a modality"
          body="Choose how you're training, plan the sets, then start. Everything you log feeds back into your readiness."
        />
      </div>

      {/* Standby first. Someone who planned a session already decided what to
          do — making them rebuild it from the modality grid is the app
          forgetting on their behalf. */}
      {/* Above standby: an unfinished workout is a decision already in
          progress, and it must be resolved before another one is started. */}
      <UnfinishedStrip />

      <StandbyStrip />


      {/* AI Coach */}
      <div className="bg-[#0a2a22] border border-brand-teal/30 rounded-card p-4 mb-6">
        <div className="flex items-center gap-2.5 mb-2.5">
          <span className="w-[26px] h-[26px] rounded-badge bg-brand-teal text-black
                           flex items-center justify-center"><IcSpark /></span>
          <span className="text-brand-teal text-sm font-bold">AI Coach</span>
          <span className="ml-auto text-[10px] font-bold tracking-wide text-brand-teal/70">GEMINI</span>
        </div>
        <p className="text-dark-200 text-sm leading-relaxed mb-3">{coachByMod[modality]}</p>
        <div className="flex flex-wrap gap-2">
          {coachChips.map(c => (
            <span key={c}
              className="inline-flex items-center gap-1.5 bg-brand-green/15 border border-brand-green/35
                         text-brand-green text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap">
              {c}
            </span>
          ))}
        </div>
      </div>

      {/* Feeling */}
      <Eyebrow>HOW ARE YOU FEELING?</Eyebrow>
      <div className="grid grid-cols-5 gap-2 mb-6">
        {FEELINGS.map((label, i) => (
          <button key={label} onClick={() => setFeeling(i)}
            className="relative flex flex-col items-center gap-2 pt-3 pb-2.5 px-1
                       bg-dark-800 border border-dark-600 rounded-btn active:scale-95 transition-transform">
            <span className="h-5 flex items-end"><EnergyBars level={i} /></span>
            <span className="text-[10px] font-semibold text-dark-300">{label}</span>
            {feeling === i && (
              <div className="absolute inset-0 rounded-btn border-[1.5px] border-brand-teal pointer-events-none" />
            )}
          </button>
        ))}
      </div>

      {/* Modality */}
      <Eyebrow>CHOOSE YOUR TRAINING</Eyebrow>
      <div className="flex flex-col gap-2.5 mb-6">
        {MODALITIES.map(m => {
          const on = modality === m.id
          return (
            <button key={m.id} onClick={() => setModality(m.id)}
              className="relative flex items-center gap-3 px-3.5 py-3 bg-dark-800
                         border border-dark-600 rounded-card text-left active:scale-[0.99] transition-transform">
              <span className="w-[42px] h-[42px] rounded-[11px] bg-[#0a2a22] text-brand-teal
                               flex items-center justify-center flex-shrink-0">
                <ModIcon id={m.id} />
              </span>
              <span className="flex-1">
                <span className="block text-[15px] font-bold">{m.label}</span>
                <span className="block text-xs text-dark-300 mt-px">{m.desc}</span>
              </span>
              {on ? (
                <span className="w-6 h-6 rounded-full bg-brand-teal text-black flex items-center justify-center">
                  <IcCheck />
                </span>
              ) : (
                <span className="w-6 h-6 rounded-full border-[1.5px] border-dark-500" />
              )}
              {on && <div className="absolute inset-0 rounded-card border-[1.5px] border-brand-teal pointer-events-none" />}
            </button>
          )
        })}
      </div>

      {/* Smart features */}
      <Eyebrow>SMART FEATURES</Eyebrow>
      <div className="relative bg-dark-800 border border-dark-600 rounded-card px-4 mb-6">
        {/* Priority 1 so it waits for the modality hint at the top of the page —
            only one coach mark shows at a time, and picking your training comes
            before learning to talk to it. */}
        <CoachMark
          hintKey={HINTS.voiceSetup}
          enabled={voiceSupported !== false}
          placement="top"
          className="left-0"
          priority={1}
          title="Train hands-free"
          body="With these on you can log a set by saying “set done”, and the phone buzzes and calls the next set when rest ends."
        />
        {[
          {
            icon: <IcMic />,
            label: 'Voice Commands',
            // Unsupported is stated rather than hidden: a missing row reads as
            // a bug, an explained one reads as a device limit.
            sub: voiceSupported === false
              ? 'This device has no speech recognition'
              : '"Set done", "eight reps at sixty"',
            on: voice, set: setVoice,
            off: voiceSupported === false,
          },
          {
            icon: <IcVibrate />,
            label: 'Haptic Rest Alerts',
            sub: 'Vibrate when rest ends',
            on: haptic, set: setHaptic,
          },
          {
            icon: <IcSpeaker />,
            label: 'Audio Cues',
            sub: 'Announce the next set out loud',
            on: audio, set: setAudio,
          },
        ].map((item, i) => (
          <div key={item.label}
            className={`flex items-center gap-3 py-3.5 ${i < 2 ? 'border-b border-dark-700' : ''}`}>
            <span className={item.off ? 'text-dark-500' : 'text-brand-teal'}>{item.icon}</span>
            <span className="flex-1">
              <span className={`block text-sm font-semibold ${item.off ? 'text-dark-400' : ''}`}>
                {item.label}
              </span>
              <span className="block text-xs text-dark-300">{item.sub}</span>
            </span>
            <Toggle on={item.on} onChange={item.set} disabled={item.off} />
          </div>
        ))}
      </div>

      {/* A way in to the full list, rather than a paragraph of it. Shown only
          when voice is on and can work — a command list under a dead switch is
          just noise. */}
      {voice && voiceSupported !== false && (
        <button
          onClick={() => setShowVoiceHelp(true)}
          className="w-full -mt-3 mb-6 flex items-center gap-2.5 px-3.5 py-3 rounded-btn
                     border border-dashed border-dark-600 text-left
                     active:scale-[0.99] transition-transform"
        >
          <span className="text-[15px]">🎤</span>
          <span className="flex-1 min-w-0">
            <span className="block text-[12.5px] text-dark-200">
              “set done” · “eight reps” · “log eight at sixty”
            </span>
            <span className="block text-[11px] text-dark-400 mt-0.5">
              See all voice commands
            </span>
          </span>
          <span className="text-dark-400 text-sm">→</span>
        </button>
      )}

      {/* CTA */}
      <button
        onClick={handleBrowse}
        className="w-full bg-brand-teal text-black font-bold py-[15px] rounded-btn
                   text-[15px] active:scale-95 transition-transform">
        {activeMod.cta}
      </button>

      {showVoiceHelp && <VoiceCommandSheet onClose={() => setShowVoiceHelp(false)} />}
    </div>
  )
}

/**
 * What is already lined up, above the "what shall I do today" grid.
 *
 * Renders nothing at all when there is neither a standby workout nor a saved
 * plan — an empty prompt on a screen someone opened to start training is just
 * an obstacle between them and the barbell.
 */
/**
 * The workout that was started and never finished.
 *
 * `startSession` creates a row on the Start tap and only `finishSession` writes
 * `duration`, so anything interrupted in between — a force quit, a dead
 * battery, or just changing your mind — used to sit in the database forever and
 * show up in the calendar as a blank entry.
 *
 * The prompt is the honest half of the fix: an interrupted session usually has
 * real sets in it, and silently binning them because the app never asked is a
 * worse bug than the clutter. Anything still open after a threshold is swept
 * server-side, so ignoring this costs nothing.
 */
function UnfinishedStrip() {
  const navigate = useNavigate()

  const [active, setActive] = useState<ActiveSession | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    workoutService.getActiveSession()
      .then(session => { if (!cancelled) setActive(session) })
      // A failed lookup hides the strip. The sweep still clears it later, and
      // an error banner on the Start screen helps nobody mid-gym.
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  if (!active) return null

  const discard = async () => {
    setBusy(true)
    try {
      await workoutService.deleteSession(active.id)
      setActive(null)
    } catch {
      setBusy(false)
    }
  }

  const started = new Date(active.dateTime)
  const summary = active.exerciseNames.length > 0
    ? active.exerciseNames.slice(0, 2).join(', ') +
      (active.exerciseNames.length > 2 ? ` +${active.exerciseNames.length - 2}` : '')
    : 'Nothing logged'

  return (
    <div className="mb-4 rounded-card border border-brand-yellow/40 bg-[#2a2410] px-4 py-3.5">
      <p className="text-[10px] tracking-wider text-brand-yellow font-bold">
        UNFINISHED WORKOUT
      </p>
      <p className="text-white text-sm font-bold mt-0.5">
        Started {started.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        {' · '}
        {active.setCount} set{active.setCount === 1 ? '' : 's'}
      </p>
      <p className="text-dark-300 text-[12px] mt-0.5">{summary}</p>

      <div className="flex gap-2 mt-3">
        <button
          onClick={() => navigate('/workout/active')}
          disabled={busy}
          className="flex-1 py-2.5 rounded-btn bg-brand-yellow text-black text-[13px]
                     font-extrabold active:scale-95 transition-transform disabled:opacity-40"
        >
          Resume
        </button>
        <button
          onClick={discard}
          disabled={busy}
          className="px-4 py-2.5 rounded-btn border border-dark-600 bg-dark-800
                     text-dark-200 text-[13px] font-bold active:scale-95
                     transition-transform disabled:opacity-40"
        >
          {busy ? '…' : 'Discard'}
        </button>
      </div>
    </div>
  )
}

function StandbyStrip() {
  const navigate = useNavigate()
  const loadTemplate = useWorkoutStore(s => s.loadTemplate)

  const [next, setNext] = useState<ScheduledWorkout | null>(null)
  const [planCount, setPlanCount] = useState(0)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    Promise.all([
      templateService.listScheduled('standby'),
      templateService.list(false),
    ])
      .then(([scheduled, templates]) => {
        if (cancelled) return
        setNext(scheduled[0] ?? null)
        setPlanCount(templates.length)
      })
      // A failed lookup just means the strip stays hidden; the rest of the
      // screen is what the athlete came for.
      .catch(() => {})
      .finally(() => { if (!cancelled) setReady(true) })

    return () => { cancelled = true }
  }, [])

  if (!ready || (!next && planCount === 0)) return null

  if (!next) {
    return (
      <button
        onClick={() => navigate('/plans')}
        className="w-full mb-6 rounded-card border border-dark-600 bg-dark-800 px-4 py-3.5
                   text-left active:scale-[0.99] transition-transform"
      >
        <p className="text-[10px] tracking-wide text-dark-400">SAVED PLANS</p>
        <p className="text-[13px] font-semibold mt-0.5">
          Load one of your {planCount} plan{planCount === 1 ? '' : 's'} →
        </p>
      </button>
    )
  }

  const when = new Date(next.scheduledFor)
  const today = new Date()
  const isToday = when.toDateString() === today.toDateString()

  return (
    <div className="mb-6 rounded-card border border-brand-teal/40 bg-[#0a2a22] px-4 py-3.5">
      <p className="text-[10px] tracking-wider text-brand-teal font-bold">
        {isToday ? 'ON STANDBY · TODAY' : `ON STANDBY · ${when.toLocaleDateString('en-GB', {
          weekday: 'short', day: 'numeric', month: 'short',
        }).toUpperCase()}`}
      </p>
      <p className="text-white text-sm font-bold mt-0.5">{next.template.name}</p>
      <p className="text-dark-300 text-[12px] mt-0.5">
        {next.template.exercises.length} exercises ·{' '}
        {next.template.exercises.reduce((sum, e) => sum + e.sets.length, 0)} sets
      </p>

      <div className="flex gap-2 mt-3">
        <button
          onClick={() => {
            loadTemplate(next.template, next.id)
            navigate('/workout/plan')
          }}
          className="flex-1 py-2.5 rounded-btn bg-brand-teal text-black text-[13px] font-extrabold
                     active:scale-95 transition-transform"
        >
          Start this →
        </button>
        <button
          onClick={() => navigate('/plans')}
          className="px-4 py-2.5 rounded-btn border border-dark-600 bg-dark-800
                     text-white text-[13px] font-bold active:scale-95 transition-transform"
        >
          All plans
        </button>
      </div>
    </div>
  )
}
