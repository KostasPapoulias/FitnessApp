import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import { useFatigueStore } from '../store/useFatigueStore'
import { useOnboardingStore } from '../store/useOnboardingStore'
import MuscleMap from '../components/muscle/MuscleMap'
import { useDeviceTilt } from '../hooks/useDeviceTilt'
import MuscleFatiguePopup from '../components/muscle/MuscleFatiguePopup'
import { useT } from '../i18n'
import { DumbbellIcon, HistoryListIcon, TrendingUpIcon } from '../components/icons'

export default function Home() {
  const { user } = useAuthStore()
  const { fetchFatigue, readinessScore, sleep, isLoading, selectedMuscle } = useFatigueStore()
  // Fetched by AppLayout; Home only reads it
  const { loaded, optionalStageDoneAt } = useOnboardingStore()
  const [side, setSide] = useState<'front' | 'back'>('front')
  // Counter-rotation from the phone's tilt; 0 on desktop or without the sensor
  const tilt = useDeviceTilt()
  const { t } = useT()

  useEffect(() => {
    fetchFatigue()
  }, [])

  // Optional setup never answered: show a prompt card
  const showSetupPrompt = loaded && !optionalStageDoneAt

  const readinessColor =
    readinessScore >= 70 ? 'text-brand-green' :
    readinessScore >= 40 ? 'text-brand-yellow' :
    'text-brand-red'

  const readinessBg =
    readinessScore >= 70 ? 'bg-brand-green/20 border-brand-green/40' :
    readinessScore >= 40 ? 'bg-brand-yellow/20 border-brand-yellow/40' :
    'bg-brand-red/20 border-brand-red/40'

  return (
    <div className="relative flex flex-col flex-1 min-h-full bg-dark-800">

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-6 pb-2">
        <div>
          <p className="text-dark-300 text-sm">{t('home.hello')}</p>
          <h1 className="text-white text-2xl font-bold">
            {user?.profile?.name ?? t('common.athlete')}
          </h1>
        </div>

        {/* Readiness badge */}
        <div className={`border rounded-2xl px-3 py-2 text-center ${readinessBg}`}>
          <p className="text-dark-300 text-[10px] uppercase tracking-wide">
            {t('home.readiness')}
          </p>
          {isLoading
            ? <div className="w-8 h-5 bg-dark-600 rounded animate-pulse mx-auto mt-0.5" />
            : <p className={`text-lg font-bold ${readinessColor}`}>
                {readinessScore}%
              </p>
          }
        </div>
      </div>

      {/* Progress and history links */}
      <div className="flex gap-2 px-5 pb-1">
        <Link
          to="/progress"
          className="flex-1 bg-dark-800 border border-dark-600 rounded-btn
                     px-3 py-2 flex items-center gap-2 active:scale-[0.98]
                     transition-transform"
        >
          <TrendingUpIcon className="w-4 h-4 text-brand-teal" />
          <span className="text-white text-xs font-semibold flex-1">{t('home.progress')}</span>
          <span className="text-dark-400 text-sm leading-none">›</span>
        </Link>
        <Link
          to="/history"
          className="flex-1 bg-dark-800 border border-dark-600 rounded-btn
                     px-3 py-2 flex items-center gap-2 active:scale-[0.98]
                     transition-transform"
        >
          <HistoryListIcon className="w-4 h-4 text-brand-teal" />
          <span className="text-white text-xs font-semibold flex-1">{t('home.history')}</span>
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
            {t('home.front')}
          </button>
          <button
            onClick={() => setSide('back')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors
                       ${side === 'back'
                         ? 'bg-brand-teal text-black'
                         : 'text-dark-300'}`}
          >
            {t('home.back')}
          </button>
        </div>

        {/* The body map. On a phone it counter-rotates against the device tilt
            (transform only). Height flexes so the legend never overlaps it. */}
        <div className="w-full max-w-[220px] flex-1 min-h-[240px] max-h-[360px] mt-12 mb-9">
          {isLoading
            ? <div className="w-full h-full bg-dark-800 rounded-2xl animate-pulse" />
            : (
              <div
                className="w-full h-full"
                style={{
                  transform: `rotate(${tilt}deg) translateX(${tilt * 0.9}px)`,
                  transformOrigin: '50% 22%',   // pivots near the shoulders
                  willChange: tilt === 0 ? undefined : 'transform',
                }}
              >
                <MuscleMap side={side} />
              </div>
            )
          }
        </div>

        {/* Muscle popup */}
        {selectedMuscle && <MuscleFatiguePopup />}

        {/* Legend */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2
                        flex gap-4 bg-dark-800/80 rounded-full px-4 py-2
                        border border-dark-600">
          {[
            { color: 'bg-brand-green', label: t('home.legendRecovered') },
            { color: 'bg-brand-yellow', label: t('home.legendModerate') },
            { color: 'bg-brand-red', label: t('home.legendFatigue') },
          ].map(({ color, label }) => (
            <div key={color} className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
              <span className="text-dark-300 text-[10px]">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Finish-your-setup prompt */}
      {showSetupPrompt && (
        <Link
          to="/training-setup"
          className="mx-1 mt-auto mb-1 bg-dark-800 border border-brand-yellow/30
                     rounded-card px-3 py-3 flex items-center gap-3 active:scale-[0.99]
                     transition-transform"
        >
          <DumbbellIcon className="w-5 h-5 text-brand-yellow" />
          <div className="flex-1">
            <p className="text-white text-sm font-semibold">{t('home.setupTitle')}</p>
            <p className="text-dark-300 text-xs mt-0.5 leading-relaxed">
              {t('home.setupBody')}
            </p>
          </div>
          <span className="text-dark-400 text-lg leading-none">›</span>
        </Link>
      )}

      {/* What sleep did to the readiness score — shown even when it did nothing */}
      {sleep && (
        <div className={`mx-1 mb-1 bg-dark-800 border border-dark-600
                        rounded-card px-3 py-2.5
                        ${showSetupPrompt ? '' : 'mt-auto'}`}>
          <p className={`text-xs leading-relaxed ${
            sleep.applied ? 'text-dark-300' : 'text-dark-400'
          }`}>
            {sleep.note}
            {!sleep.applied && (
              <Link to="/profile" className="text-brand-teal ml-1">{t('common.logIt')}</Link>
            )}
          </p>
        </div>
      )}
    </div>
  )
}