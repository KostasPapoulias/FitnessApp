import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { exerciseService } from '../../services/exercise.service'
import { useWorkoutStore } from '../../store/useWorkoutStore'
import { ExerciseCategory, FatigueStatus } from '../../types'
import { exerciseEmoji } from './helpers'
import coreImg from '../../assets/core.png'
import armsImg from '../../assets/arms.png'
import backImg from '../../assets/back.png'
import chestImg from '../../assets/Chest.png'
import quadsImg from '../../assets/quads.png'
import shouldersImg from '../../assets/Shoulders.png'

const CATEGORY_IMAGES: Record<string, string> = {
  Legs: quadsImg, Chest: chestImg, Back: backImg,
  Shoulders: shouldersImg, Arms: armsImg, Core: coreImg,
}

// fatigue status → dot colour + label (matches the prototype's muscle-map palette)
const FAT: Record<FatigueStatus, { dot: string; label: string }> = {
  recovered: { dot: '#4ADE80', label: 'Recovered' },
  moderate:  { dot: '#FACC15', label: 'Moderate' },
  high:      { dot: '#EF4444', label: 'High fatigue' },
}

const BackIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
)
const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
)
const SparkIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /></svg>
)

export default function BrowseCategories() {
  const navigate = useNavigate()
  const location = useLocation()
  const modality: string = location.state?.modality ?? 'Strength'

  const { selectedExercises } = useWorkoutStore()

  const [categories, setCategories] = useState<ExerciseCategory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [toast, setToast] = useState('')

  useEffect(() => {
    exerciseService.getCategories()
      .then(setCategories)
      .finally(() => setIsLoading(false))
  }, [])

  const ping = (msg: string) => {
    setToast(msg)
    window.clearTimeout((ping as any)._t)
    ;(ping as any)._t = window.setTimeout(() => setToast(''), 1600)
  }

  const openCategory = (category: ExerciseCategory) =>
    navigate('/workout/exercises', { state: { category: category.name, modality } })

  const recovered = categories.filter(c => c.fatigueStatus === 'recovered')
  const aiHint = recovered.length
    ? `AI suggests ${recovered[0].name} today — recovered and due for volume.`
    : 'Everything is a little fatigued — keep intensity moderate today.'

  const selectedCount = selectedExercises.length

  return (
    <div className="min-h-dvh bg-dark-900 text-white px-5 pt-6 pb-28 overflow-y-auto relative">

      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate('/workout/start')}
          className="w-[38px] h-[38px] rounded-full bg-dark-800 border border-dark-600
                     flex items-center justify-center flex-shrink-0 active:scale-90 transition-transform">
          <BackIcon />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[21px] font-extrabold tracking-tight">{modality}</p>
          <p className="text-xs text-dark-300">Select a muscle group</p>
        </div>
        <button onClick={() => ping('Search coming soon')}
          className="w-[38px] h-[38px] rounded-full bg-dark-800 border border-dark-600
                     text-dark-300 flex items-center justify-center active:scale-90 transition-transform">
          <SearchIcon />
        </button>
      </div>

      {/* AI recommend strip */}
      <div className="bg-[#0a2a22] border border-brand-teal/30 rounded-btn px-3.5 py-3 mb-6
                      flex items-center gap-2.5">
        <span className="text-brand-teal flex-shrink-0"><SparkIcon /></span>
        <span className="text-[13px] text-dark-200 leading-snug">{aiHint}</span>
      </div>

      {/* Muscle groups */}
      <p className="text-[11px] font-bold tracking-[1.4px] text-dark-300 mb-3">MUSCLE GROUPS</p>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-[168px] bg-dark-800 rounded-card animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {categories.map(category => {
            const f = FAT[category.fatigueStatus]
            const selectedFromThis = selectedExercises.filter(se =>
              se.exercise.categories.includes(category.name)).length
            const img = CATEGORY_IMAGES[category.name]
            return (
              <button key={category.id} onClick={() => openCategory(category)}
                className="relative text-left bg-dark-800 border border-dark-600 rounded-card
                           overflow-hidden active:scale-95 transition-transform">
                {/* image banner */}
                <div className="h-[96px] bg-dark-700 flex items-center justify-center">
                  {img
                    ? <img src={img} alt={category.name} className="h-[84px] w-[84px] object-contain" />
                    : <span className="text-3xl">{exerciseEmoji({ modality })}</span>}
                </div>
                {category.fatigueStatus === 'recovered' && (
                  <span className="absolute top-2 right-2 bg-brand-teal text-black text-[9px]
                                   font-bold px-2 py-0.5 rounded-full">AI ✦</span>
                )}
                {selectedFromThis > 0 && (
                  <span className="absolute top-2 left-2 bg-brand-teal text-black w-5 h-5 rounded-full
                                   flex items-center justify-center text-[10px] font-bold">
                    {selectedFromThis}
                  </span>
                )}
                <div className="px-3.5 pt-3 pb-3.5">
                  <p className="text-[15px] font-bold">{category.name}</p>
                  <div className="flex items-center gap-1.5 mt-1.5 mb-1">
                    <span className="w-[7px] h-[7px] rounded-full" style={{ background: f.dot }} />
                    <span className="text-xs font-semibold" style={{ color: f.dot }}>{f.label}</span>
                  </div>
                  <p className="text-xs text-dark-300">{category.exerciseCount} exercises</p>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Selected tray → Plan Sets */}
      {selectedCount > 0 && (
        <div className="fixed bottom-[calc(var(--bottom-nav-h)+1rem)] left-1/2 -translate-x-1/2 w-[calc(100%-2.5rem)]
                        max-w-[390px] bg-dark-800 border border-brand-teal/50 rounded-card
                        p-3 flex items-center gap-3 shadow-2xl z-40">
          <div className="flex gap-1">
            {selectedExercises.slice(0, 3).map(se => (
              <div key={se.exercise.id}
                className="w-8 h-8 bg-brand-teal/20 rounded-lg flex items-center justify-center
                           text-sm border border-brand-teal/30">
                {exerciseEmoji(se.exercise)}
              </div>
            ))}
            {selectedCount > 3 && (
              <div className="w-8 h-8 bg-dark-700 rounded-lg flex items-center justify-center
                              text-xs text-dark-300 border border-dark-600">+{selectedCount - 3}</div>
            )}
          </div>
          <p className="flex-1 text-sm font-semibold">
            {selectedCount} exercise{selectedCount > 1 ? 's' : ''} selected
          </p>
          <button onClick={() => navigate('/workout/plan')}
            className="bg-brand-teal text-black text-sm font-bold px-4 py-2 rounded-btn
                       active:scale-95 transition-transform flex-shrink-0">
            Plan Sets →
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-[calc(var(--bottom-nav-h)+0.75rem)] left-1/2 -translate-x-1/2 bg-dark-700 border border-dark-500
                        text-white text-[13px] font-semibold px-4 py-2.5 rounded-full shadow-2xl z-50
                        whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  )
}
