import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { exerciseService } from '../../services/exercise.service'
import { useWorkoutStore } from '../../store/useWorkoutStore'
import { ExerciseCategory } from '../../types'
import coreImg from '../../assets/core.png'
import armsImg from '../../assets/arms.png'
import backImg from '../../assets/back.png'
import chestImg from '../../assets/Chest.png'
import quadsImg from '../../assets/quads.png'
import shouldersImg from '../../assets/Shoulders.png'

const CATEGORY_IMAGES: Record<string, string> = {
  Legs: quadsImg,
  Chest: chestImg,
  Back: backImg,
  Shoulders: shouldersImg,
  Arms: armsImg,
  Core: coreImg
}

export default function BrowseCategories() {
  const navigate = useNavigate()
  const location = useLocation()
  const modality = location.state?.modality ?? 'Strength'

  const { selectedExercises } = useWorkoutStore()

  const [categories, setCategories] = useState<ExerciseCategory[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    exerciseService.getCategories()
      .then(setCategories)
      .finally(() => setIsLoading(false))
  }, [])

  const statusColors = {
    recovered: 'border-brand-green/50 bg-[#0d2218]',
    moderate:  'border-brand-yellow/50 bg-[#2a2000]',
    high:      'border-brand-red/50 bg-[#2a0d0d]',
  }

  const statusText = {
    recovered: { color: 'text-brand-green', label: '● Recovered' },
    moderate:  { color: 'text-brand-yellow', label: '● Moderate' },
    high:      { color: 'text-brand-red', label: '● High Fatigue' },
  }

  const handleCategoryPress = (category: ExerciseCategory) => {
    navigate('/workout/exercises', {
      state: { category: category.name, modality }
    })
  }

  // Count selected exercises per category
  const selectedCount = selectedExercises.length

  return (
    <div className="min-h-853 bg-dark-900 flex flex-col">

      {/* Header */}
      <div className="px-5 pt-6 pb-2 flex items-center gap-3">
        <button onClick={() => navigate('/workout/start')}
          className="w-9 h-9 bg-dark-800 rounded-full flex items-center
                     justify-center text-white border border-dark-600">
          ←
        </button>
        <div className="flex-1">
          <h1 className="text-white text-xl font-bold">Browse Exercises</h1>
          <p className="text-dark-300 text-xs">{modality} · Select muscle group</p>
        </div>
        {selectedCount > 0 && (
          <div className="bg-brand-teal/20 border border-brand-teal/40
                          rounded-full px-3 py-1">
            <span className="text-brand-teal text-sm font-semibold">
              {selectedCount} added
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-4">

        {/* AI recommendations strip */}
        <div className="mt-3 mb-4 bg-[#0a2a22] border border-brand-teal/30
                        rounded-card p-3">
          <p className="text-brand-teal text-xs font-semibold mb-2">
            🤖 AI recommends today
          </p>
          <div className="flex gap-2 flex-wrap">
            {categories
              .filter(c => c.fatigueStatus === 'recovered')
              .slice(0, 3)
              .map(c => (
                <button
                  key={c.id}
                  onClick={() => handleCategoryPress(c)}
                  className="bg-brand-teal text-black text-xs font-bold
                             px-3 py-1.5 rounded-full flex items-center gap-1"
                >
                  {CATEGORY_IMAGES[c.name] ? (
                    <img
                      src={CATEGORY_IMAGES[c.name]}
                      alt={c.name}
                      className="h-[18px] w-[18px] object-contain"
                    />
                  ) : (
                    <span className="h-[18px] w-[18px] rounded-full bg-black/20" />
                  )}
                  {c.name}
                  <span className="bg-black/20 rounded-full px-1.5 ml-1 text-[10px]">
                    Recovered ✓
                  </span>
                </button>
              ))}
          </div>
        </div>

        {/* Muscle group grid */}
        <p className="text-dark-300 text-xs uppercase tracking-wider mb-3">
          Muscle Groups
        </p>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i}
                className="h-32 bg-dark-800 rounded-card animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {categories.map(category => {
              const status = category.fatigueStatus
              const text = statusText[status]
              const border = statusColors[status]
              // Count selected from this category
              const selectedFromThis = selectedExercises.filter(se =>
                se.exercise.categories.includes(category.name)
              ).length

              return (
                <button
                  key={category.id}
                  onClick={() => handleCategoryPress(category)}
                  className={`relative p-4 rounded-card border text-left
                             active:scale-95 transition-all ${border}`}
                >
                  {/* AI badge */}
                  {status === 'recovered' && (
                    <div className="absolute top-2 right-2 bg-brand-teal text-black
                                    text-[9px] font-bold px-2 py-0.5 rounded-full">
                      AI ✦
                    </div>
                  )}
                  {/* Fatigue badge */}
                  {status === 'high' && (
                    <div className="absolute top-2 right-2 bg-brand-red text-white
                                    text-[9px] font-bold px-2 py-0.5 rounded-full">
                      🔴 Fatigue
                    </div>
                  )}
                  {/* Selected count badge */}
                  {selectedFromThis > 0 && (
                    <div className="absolute top-2 left-2 bg-brand-teal text-black
                                    w-5 h-5 rounded-full flex items-center justify-center
                                    text-[10px] font-bold">
                      {selectedFromThis}
                    </div>
                  )}

                  <div className="mb-2">
                    {CATEGORY_IMAGES[category.name] ? (
                      <img
                        src={CATEGORY_IMAGES[category.name]}
                        alt={category.name}
                        className="h-[73px] w-[73px] object-contain"
                      />
                    ) : (
                      <div className="h-[73px] w-[73px] rounded-full bg-dark-700" />
                    )}
                  </div>
                  <p className="text-white text-sm font-semibold">{category.name}</p>
                  <p className={`text-xs mt-1 ${text.color}`}>{text.label}</p>
                  <p className="text-dark-400 text-xs mt-0.5">
                    {category.exerciseCount} exercises
                  </p>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Floating tray — shows when exercises selected */}
      {selectedCount > 0 && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)]
                        max-w-[398px] bg-dark-800 border border-brand-teal/50
                        rounded-card p-3 flex items-center gap-3 shadow-2xl z-40">
          <div className="flex gap-1">
            {selectedExercises.slice(0, 3).map(se => (
              <div key={se.exercise.id}
                className="w-8 h-8 bg-brand-teal/20 rounded-lg flex items-center
                           justify-center text-sm border border-brand-teal/30">
                💪
              </div>
            ))}
            {selectedCount > 3 && (
              <div className="w-8 h-8 bg-dark-700 rounded-lg flex items-center
                             justify-center text-xs text-dark-300 border border-dark-600">
                +{selectedCount - 3}
              </div>
            )}
          </div>
          <div className="flex-1">
            <p className="text-white text-sm font-semibold">
              {selectedCount} exercise{selectedCount > 1 ? 's' : ''} selected
            </p>
          </div>
          <button
            onClick={() => navigate('/workout/plan')}
            className="bg-brand-teal text-black text-sm font-bold
                       px-4 py-2 rounded-btn active:scale-95 transition-transform"
          >
            Plan Sets →
          </button>
        </div>
      )}
    </div>
  )
}