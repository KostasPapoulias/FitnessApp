import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import { useFatigueStore } from '../store/useFatigueStore'
import { useOnboardingStore } from '../store/useOnboardingStore'
import MuscleMap from '../components/muscle/MuscleMap'
import { useDeviceTilt } from '../hooks/useDeviceTilt'
import MuscleFatiguePopup from '../components/muscle/MuscleFatiguePopup'
import CoachMark, { HINTS } from '../components/onboarding/CoachMark'

export default function Home() {
  const { user } = useAuthStore()
  const { fetchFatigue, readinessScore, sleep, isLoading, selectedMuscle } = useFatigueStore()
  // AppLayout does the fetching; Home only reads the result.
  const { loaded, optionalStageDoneAt } = useOnboardingStore()
  const [side, setSide] = useState<'front' | 'back'>('front')
  const [aiVisible, setAiVisible] = useState(true)
  // Degrees of counter-rotation from the phone's tilt. Always 0 on desktop,
  // and on any device that declines the sensor.
  const tilt = useDeviceTilt()

  useEffect(() => {
    fetchFatigue()
  }, [])

  // The optional stage has never been answered. Not an error state — the app
  // works without it — so this is a card to act on, not a warning.
  const showSetupPrompt = loaded && !optionalStageDoneAt

  // Readiness score color
  const readinessColor =
    readinessScore >= 70 ? 'text-brand-green' :
    readinessScore >= 40 ? 'text-brand-yellow' :
    'text-brand-red'

  const readinessBg =
    readinessScore >= 70 ? 'bg-brand-green/20 border-brand-green/40' :
    readinessScore >= 40 ? 'bg-brand-yellow/20 border-brand-yellow/40' :
    'bg-brand-red/20 border-brand-red/40'

  // AI suggestion based on readiness
  const aiSuggestion =
    readinessScore >= 70
      ? 'Your body is ready. Today is a great day to train hard.'
      : readinessScore >= 40
      ? 'Moderate fatigue detected. Consider a lighter session today.'
      : 'High fatigue. Rest or do mobility work today to recover.'

  return (
    <div className="relative flex flex-col flex-1 min-h-full bg-dark-800">

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-6 pb-2">
        <div>
          <p className="text-dark-300 text-sm">Hello,</p>
          <h1 className="text-white text-2xl font-bold">
            {user?.profile?.name ?? 'Athlete'}
          </h1>
        </div>

        {/* Readiness badge */}
        <div className="relative">
          <div className={`border rounded-2xl px-3 py-2 text-center ${readinessBg}`}>
            <p className="text-dark-300 text-[10px] uppercase tracking-wide">
              Readiness
            </p>
            {isLoading
              ? <div className="w-8 h-5 bg-dark-600 rounded animate-pulse mx-auto mt-0.5" />
              : <p className={`text-lg font-bold ${readinessColor}`}>
                  {readinessScore}%
                </p>
            }
          </div>

          {/* Explained first, against the user's own number — it is the one
              figure the rest of the app is built around. */}
          <CoachMark
            hintKey={HINTS.readiness}
            priority={0}
            enabled={!isLoading}
            placement="bottom"
            className="right-0"
            title="Your readiness"
            body="How recovered you are right now, from muscle fatigue, whole-body load and last night's sleep. It climbs back on its own as you rest."
          />
        </div>
      </div>

      {/* Progress and history.
          Two slim pills rather than a card: the bottom of this screen is
          already the setup prompt and the AI strip, and a third block down
          there squeezes the body map on a short phone. They sit under the
          header because that is where they read as navigation — which is all
          they are. The bottom nav has no free slot and Calendar answers a
          different question, so without these the app's only charts would be
          reachable from one row inside Profile. */}
      <div className="flex gap-2 px-5 pb-1">
        <Link
          to="/progress"
          className="flex-1 bg-dark-800 border border-dark-600 rounded-btn
                     px-3 py-2 flex items-center gap-2 active:scale-[0.98]
                     transition-transform"
        >
          <span className="text-sm">📈</span>
          <span className="text-white text-xs font-semibold flex-1">Progress</span>
          <span className="text-dark-400 text-sm leading-none">›</span>
        </Link>
        <Link
          to="/history"
          className="flex-1 bg-dark-800 border border-dark-600 rounded-btn
                     px-3 py-2 flex items-center gap-2 active:scale-[0.98]
                     transition-transform"
        >
          <span className="text-sm">📋</span>
          <span className="text-white text-xs font-semibold flex-1">History</span>
          <span className="text-dark-400 text-sm leading-none">›</span>
        </Link>
      </div>

      {/* Body map container */}
      <div className="relative flex-1 flex flex-col items-center justify-center px-8">

        {/* Front/Back toggle */}
        <div className="absolute top-1 left-1/2 -translate-x-1/2 z-10
                        flex bg-dark-800 rounded-full p-0.5 border border-dark-600">
          <button
            onClick={() => setSide('front')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors
                       ${side === 'front'
                         ? 'bg-brand-teal text-black'
                         : 'text-dark-300'}`}
          >
            Front
          </button>
          <button
            onClick={() => setSide('back')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors
                       ${side === 'back'
                         ? 'bg-brand-teal text-black'
                         : 'text-dark-300'}`}
          >
            Back
          </button>
        </div>

        {/* The SVG map.
            On a phone it counter-rotates a few degrees against how the device
            is held, so it reads as hanging level with the ground rather than
            being painted on the screen. Transform only — no layout is affected,
            so nothing below it moves. */}
        {/* Height flexes instead of sitting at a fixed 360px: on a short phone
            (or in landscape) a rigid map outgrew this container, and the
            legend — anchored to the container's bottom — landed on top of it.
            The floor lets the page scroll rather than squashing the body. */}
        <div className="w-full max-w-[220px] flex-1 min-h-[240px] max-h-[360px] mt-12 mb-9">
          {isLoading
            ? <div className="w-full h-full bg-dark-800 rounded-2xl animate-pulse" />
            : (
              <div
                className="w-full h-full"
                style={{
                  transform: `rotate(${tilt}deg) translateX(${tilt * 0.9}px)`,
                  transformOrigin: '50% 22%',   // pivots near the shoulders, like it hangs from there
                  willChange: tilt === 0 ? undefined : 'transform',
                }}
              >
                <MuscleMap side={side} />
              </div>
            )
          }
        </div>

        {/* Anchored to the map's own container so it sits under the body
            rather than floating over the middle of the screen. */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2">
          <CoachMark
            hintKey={HINTS.bodyMap}
            priority={1}
            enabled={!isLoading}
            placement="bottom"
            className="-left-24"
            title="Your body map"
            body="Each muscle is coloured by how much load it's still carrying. Tap one to see what hit it and when it'll be recovered."
          />
        </div>

        {/* Muscle popup */}
        {selectedMuscle && <MuscleFatiguePopup />}

        {/* Legend */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2
                        flex gap-4 bg-dark-800/80 rounded-full px-4 py-2
                        border border-dark-600">
          {[
            { color: 'bg-brand-green', label: 'Recovered' },
            { color: 'bg-brand-yellow', label: 'Moderate' },
            { color: 'bg-brand-red', label: 'Fatigue' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
              <span className="text-dark-300 text-[10px]">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Finish-your-setup prompt. Sits above the AI strip because it is the
          one thing on this screen that still needs the user to do something. */}
      {showSetupPrompt && (
        <Link
          to="/training-setup"
          className="mx-1 mt-auto mb-1 bg-dark-800 border border-brand-yellow/30
                     rounded-card px-3 py-3 flex items-center gap-3 active:scale-[0.99]
                     transition-transform"
        >
          <span className="text-lg">🏋️</span>
          <div className="flex-1">
            <p className="text-white text-sm font-semibold">Finish your setup</p>
            <p className="text-dark-300 text-xs mt-0.5 leading-relaxed">
              Tell us your equipment and any injuries so we only suggest sessions
              you can actually do.
            </p>
          </div>
          <span className="text-dark-400 text-lg leading-none">›</span>
        </Link>
      )}

      {/* AI suggestion strip */}
      {aiVisible && (
        <div className={`relative mx-1 mb-1 bg-dark-800 border border-brand-teal/30
                        rounded-card px-2 py-3 flex items-start gap-3
                        ${showSetupPrompt ? '' : 'mt-auto'}`}>
          <span className="text-lg mt-0.5">🤖</span>
          <div className="flex-1">
            <p className="text-dark-200 text-sm leading-relaxed">
              {aiSuggestion}
            </p>
            {/* What sleep did to the score above. Shown when it did nothing
                too: a readiness figure that silently ignores a variable the
                app asks you to log is the bug this feature exists to fix, and
                an unlogged night must not look like a neutral one. */}
            {sleep && (
              <p className={`text-xs mt-1.5 leading-relaxed ${
                sleep.applied ? 'text-dark-300' : 'text-dark-400'
              }`}>
                {sleep.note}
                {!sleep.applied && (
                  <Link to="/profile" className="text-brand-teal ml-1">Log it →</Link>
                )}
              </p>
            )}
          </div>
          <button
            onClick={() => setAiVisible(false)}
            className="text-dark-400 text-lg leading-none flex-shrink-0"
          >
            ×
          </button>

          <CoachMark
            hintKey={HINTS.aiStrip}
            priority={2}
            enabled={!isLoading}
            placement="top"
            className="left-0"
            title="Today's call"
            body="A read on what your body can take today. Tap the AI tab for a full session built around it."
          />
        </div>
      )}
    </div>
  )
}