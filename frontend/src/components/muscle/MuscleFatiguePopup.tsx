import { useFatigueStore } from '../../store/useFatigueStore'

export default function MuscleFatiguePopup() {
  const { selectedMuscle, selectMuscle, overrideMuscle } = useFatigueStore()

  if (!selectedMuscle) return null

  const { muscleName, fatigueLevel, status, recoveryTargetAt } = selectedMuscle

  // Calculate hours until recovery
  const hoursLeft = recoveryTargetAt
    ? Math.max(0, Math.round(
        (new Date(recoveryTargetAt).getTime() - Date.now()) / 3600000
      ))
    : 0

  const statusConfig = {
    recovered: { label: 'Recovered', color: 'text-brand-green', bg: 'bg-brand-green' },
    moderate:  { label: 'Moderate Fatigue', color: 'text-brand-yellow', bg: 'bg-brand-yellow' },
    high:      { label: 'High Fatigue', color: 'text-brand-red', bg: 'bg-brand-red' }
  }

  const config = statusConfig[status]

  return (
    <>
      {/* Backdrop */}
      <div
        className="absolute inset-0 z-40"
        onClick={() => selectMuscle(null)}
      />

      {/* Popup card */}
      <div className="absolute top-24 left-1/2 -translate-x-1/2 z-50
                      w-64 bg-dark-800 border border-dark-600 rounded-card
                      p-4 shadow-2xl">

        {/* Header */}
        <div className="flex justify-between items-start mb-3">
          <div>
            <h3 className="text-white font-bold text-base">{muscleName}</h3>
            <p className={`text-sm font-medium ${config.color}`}>
              {config.label}
            </p>
          </div>
          <button
            onClick={() => selectMuscle(null)}
            className="text-dark-300 hover:text-white text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Fatigue bar */}
        <div className="mb-3">
          <div className="flex justify-between text-xs text-dark-300 mb-1">
            <span>Fatigue</span>
            <span className={config.color}>{fatigueLevel}%</span>
          </div>
          <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
            <div
              className={`h-full ${config.bg} rounded-full transition-all duration-500`}
              style={{ width: `${fatigueLevel}%` }}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-dark-700 rounded-lg p-2 text-center">
            <p className="text-dark-300 text-xs">Recovery</p>
            <p className="text-white text-sm font-semibold">
              {hoursLeft > 0 ? `~${hoursLeft}h` : 'Ready'}
            </p>
          </div>
          <div className="bg-dark-700 rounded-lg p-2 text-center">
            <p className="text-dark-300 text-xs">Status</p>
            <p className={`text-sm font-semibold ${config.color}`}>
              {status === 'recovered' ? '✓ Go' :
               status === 'moderate'  ? '~ Easy' : '✕ Rest'}
            </p>
          </div>
        </div>

        {/* Manual override */}
        <div className="border-t border-dark-600 pt-3">
          <p className="text-dark-300 text-xs mb-2">Manual override</p>
          <div className="flex gap-2">
            {[0, 35, 70, 100].map(level => (
              <button
                key={level}
                onClick={() => overrideMuscle(selectedMuscle.muscleId, level)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold
                           border transition-colors
                           ${fatigueLevel === level
                             ? 'bg-brand-teal text-black border-brand-teal'
                             : 'bg-dark-700 text-dark-300 border-dark-600'
                           }`}
              >
                {level === 0 ? '🟢' : level === 35 ? '🟡' : level === 70 ? '🟠' : '🔴'}
                <br />{level}%
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}