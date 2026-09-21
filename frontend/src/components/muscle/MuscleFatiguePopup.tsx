import { useFatigueStore } from '../../store/useFatigueStore'
import { useT } from '../../i18n'

export default function MuscleFatiguePopup() {
  const { selectedMuscle, selectMuscle, overrideMuscle } = useFatigueStore()
  const { t, num } = useT()

  if (!selectedMuscle) return null

  const { muscleName, fatigueLevel, status, recoveryTargetAt } = selectedMuscle

  // Time until fully recovered. Recovery is exponential, so the tail of a hard
  // session runs into days — render those as days rather than "~61h".
  const hoursLeft = recoveryTargetAt
    ? Math.max(0, (new Date(recoveryTargetAt).getTime() - Date.now()) / 3600000)
    : 0
  const days = Math.round(hoursLeft / 24 * 10) / 10
  const recoveryLabel =
    hoursLeft <= 0 ? t('muscle.ready') :
    hoursLeft < 1 ? t('muscle.underHour') :
    hoursLeft < 24 ? t('muscle.hoursLeft', { n: Math.round(hoursLeft) }) :
    t('muscle.daysLeft', { n: Number.isInteger(days) ? days : num(days) })

  const statusConfig = {
    recovered: { label: t('muscle.statusRecovered'), color: 'text-brand-green', bg: 'bg-brand-green' },
    moderate:  { label: t('muscle.statusModerate'), color: 'text-brand-yellow', bg: 'bg-brand-yellow' },
    high:      { label: t('muscle.statusHigh'), color: 'text-brand-red', bg: 'bg-brand-red' }
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
            <span>{t('muscle.fatigue')}</span>
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
            <p className="text-dark-300 text-xs">{t('muscle.recovery')}</p>
            <p className="text-white text-sm font-semibold">
              {recoveryLabel}
            </p>
          </div>
          <div className="bg-dark-700 rounded-lg p-2 text-center">
            <p className="text-dark-300 text-xs">{t('muscle.status')}</p>
            <p className={`text-sm font-semibold ${config.color}`}>
              {status === 'recovered' ? t('muscle.go') :
               status === 'moderate'  ? t('muscle.easy') : t('muscle.rest')}
            </p>
          </div>
        </div>

        {/* Manual override */}
        <div className="border-t border-dark-600 pt-3">
          <p className="text-dark-300 text-xs mb-2">{t('muscle.override')}</p>
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
                {/* A coloured dot, not a coloured emoji: these are the same
                    four bands the body map and the Home legend paint, and they
                    have to be the same four colours. */}
                <span className={`block w-2.5 h-2.5 rounded-full mx-auto mb-1 ${
                  level === 0 ? 'bg-brand-green' :
                  level === 35 ? 'bg-brand-yellow' :
                  level === 70 ? 'bg-brand-orange' : 'bg-brand-red'
                }`} />
                {level}%
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}