import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/useAuthStore'
import { useFatigueStore } from '../store/useFatigueStore'
import MuscleMap from '../components/muscle/MuscleMap'
import MuscleFatiguePopup from '../components/muscle/MuscleFatiguePopup'

export default function Home() {
  const { user } = useAuthStore()
  const { fetchFatigue, readinessScore, isLoading, selectedMuscle } = useFatigueStore()
  const [side, setSide] = useState<'front' | 'back'>('front')
  const [aiVisible, setAiVisible] = useState(true)

  useEffect(() => {
    fetchFatigue()
  }, [])

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
    <div className="relative flex flex-col h-full bg-dark-800">

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-6 pb-2">
        <div>
          <p className="text-dark-300 text-sm">Hello,</p>
          <h1 className="text-white text-2xl font-bold">
            {user?.profile?.name ?? 'Athlete'}
          </h1>
        </div>

        {/* Readiness badge */}
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
      </div>

      {/* Body map container */}
      <div className="relative flex-1 flex items-center justify-center px-8">

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

        {/* The SVG map */}
        <div className="w-full max-w-[220px] h-[360px] mt-12">
          {isLoading
            ? <div className="w-full h-full bg-dark-800 rounded-2xl animate-pulse" />
            : <MuscleMap side={side} />
          }
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

      {/* AI suggestion strip */}
      {aiVisible && (
        <div className="mx-1 mt-7 mb-1 bg-dark-800 border border-brand-teal/30
                        rounded-card px-2 py-3 flex items-start gap-3">
          <span className="text-lg mt-0.5">🤖</span>
          <p className="text-dark-200 text-sm flex-1 leading-relaxed">
            {aiSuggestion}
          </p>
          <button
            onClick={() => setAiVisible(false)}
            className="text-dark-400 text-lg leading-none flex-shrink-0"
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}