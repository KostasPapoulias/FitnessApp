import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFatigueStore } from '../../store/useFatigueStore'
import { useWorkoutStore } from '../../store/useWorkoutStore'

const MOODS = [
  { emoji: '💀', label: 'Dead' },
  { emoji: '😴', label: 'Tired' },
  { emoji: '😐', label: 'Okay' },
  { emoji: '💪', label: 'Ready' },
  { emoji: '🔥', label: 'Beast' },
]

const MODALITIES = ['Strength', 'Calisthenics', 'WOD', 'Cardio', 'Mobility']

export default function StartWorkout() {
  const navigate = useNavigate()
  const { muscles, readinessScore } = useFatigueStore()
  const { clearExercises } = useWorkoutStore()

  const [selectedMood, setSelectedMood] = useState(2)
  const [selectedModality, setSelectedModality] = useState('Strength')
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [hapticEnabled, setHapticEnabled] = useState(true)
  const [audioEnabled, setAudioEnabled] = useState(false)

  // Find most recovered muscle groups for AI suggestion
  const recoveredMuscles = muscles
    .filter(m => m.status === 'recovered')
    .slice(0, 2)
    .map(m => m.muscleName)

  const highFatigueMuscles = muscles
    .filter(m => m.status === 'high')
    .map(m => m.muscleName)

  const aiSuggestion = recoveredMuscles.length > 0
    ? `Your ${highFatigueMuscles.slice(0,2).join(' & ')} are still recovering. Your ${recoveredMuscles.join(' & ')} are recovered — perfect day for a ${recoveredMuscles[0]} session.`
    : 'All muscles recovered — great day for a full body session!'

  const handleBrowse = () => {
    clearExercises()
    navigate('/workout/browse', { state: { modality: selectedModality } })
  }

  return (
    <div className="min-h-853 bg-dark-900 flex flex-col">

      {/* Header */}
      <div className="px-5 pt-4 pb-4">
        <h1 className="text-white text-2xl font-bold">Start Workout</h1>
      </div>

      <div className="flex-2 overflow-y-auto px-5 pb-4 flex flex-col gap-5">

        {/* AI Suggestion */}
        <div className="bg-[#0a2a22] border border-brand-teal/30 rounded-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 bg-brand-teal/20 rounded-lg flex items-center
                            justify-center text-sm">🤖</div>
            <span className="text-brand-teal text-sm font-semibold">AI Coach Suggestion</span>
          </div>
          <p className="text-dark-200 text-sm leading-relaxed mb-3">{aiSuggestion}</p>
          <div className="flex gap-2 flex-wrap">
            {recoveredMuscles.map(m => (
              <span key={m}
                className="bg-brand-teal/20 border border-brand-teal/40
                           text-brand-teal text-xs px-2 py-1 rounded-full">
                {m} · Recovered ✓
              </span>
            ))}
          </div>
        </div>

        {/* Mood selector */}
        <div>
          <p className="text-dark-300 text-xs uppercase tracking-wider mb-3">
            How are you feeling?
          </p>
          <div className="flex gap-2">
            {MOODS.map((mood, i) => (
              <button
                key={i}
                onClick={() => setSelectedMood(i)}
                className={`flex-1 py-3 rounded-btn flex flex-col items-center gap-1
                           border transition-all
                           ${selectedMood === i
                             ? 'bg-dark-700 border-brand-teal'
                             : 'bg-dark-800 border-dark-600'
                           }`}
              >
                <span className="text-xl">{mood.emoji}</span>
                <span className={`text-[10px] ${selectedMood === i
                  ? 'text-brand-teal' : 'text-dark-400'}`}>
                  {mood.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Modality */}
        <div>
          <p className="text-dark-300 text-xs uppercase tracking-wider mb-3">
            Modality
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {MODALITIES.map(mod => (
              <button
                key={mod}
                onClick={() => setSelectedModality(mod)}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium
                           border transition-all
                           ${selectedModality === mod
                             ? 'bg-brand-teal text-black border-brand-teal'
                             : 'bg-dark-800 text-dark-300 border-dark-600'
                           }`}
              >
                {mod}
              </button>
            ))}
          </div>
        </div>

        {/* Smart Features */}
        <div>
          <p className="text-dark-300 text-xs uppercase tracking-wider mb-3">
            Smart Features
          </p>
          <div className="bg-dark-800 rounded-card overflow-hidden border border-dark-600">
            {[
              { label: 'Voice Commands', sub: '"Set done", "Next exercise"', icon: '🎤',
                val: voiceEnabled, set: setVoiceEnabled },
              { label: 'Haptic Rest Alerts', sub: 'Vibrate when rest ends', icon: '📳',
                val: hapticEnabled, set: setHapticEnabled },
              { label: 'Audio Cues', sub: 'Announce next exercise', icon: '🔊',
                val: audioEnabled, set: setAudioEnabled },
            ].map((item, i) => (
              <div key={i}>
                {i > 0 && <div className="h-px bg-dark-600 mx-4" />}
                <div className="flex items-center justify-between px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <span className="text-base">{item.icon}</span>
                    <div>
                      <p className="text-white text-sm">{item.label}</p>
                      <p className="text-dark-400 text-xs">{item.sub}</p>
                    </div>
                  </div>
                  {/* Toggle */}
                  <button
                    onClick={() => item.set(!item.val)}
                    className={`w-10 h-6 rounded-full flex items-center px-0.5
                               transition-all duration-200
                               ${item.val ? 'bg-brand-teal justify-end' : 'bg-dark-600 justify-start'}`}
                  >
                    <div className="w-5 h-5 bg-white rounded-full shadow" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="px-5 pb-0 pt-1 border-t border-dark-700">
        <button
          onClick={handleBrowse}
          className="w-full bg-brand-teal text-black font-bold py-4 rounded-btn
                     text-base active:scale-95 transition-transform"
        >
          Browse Exercises →
        </button>
      </div>
    </div>
  )
}