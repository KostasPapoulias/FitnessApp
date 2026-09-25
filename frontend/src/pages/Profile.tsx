import { useEffect, useState } from 'react'
import BottomSheet from '../components/BottomSheet'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import { useFatigueStore } from '../store/useFatigueStore'
import { useOnboardingStore } from '../store/useOnboardingStore'
import { profileService } from '../services/profile.service'
import { exportService } from '../services/export.service'
import {
  cmToFeetInches, feetInchesToCm, kgToLb, lbToKg,
} from '../services/onboarding.service'
import {
  BirthDateField, ChipRow, DateParts, INPUT_BASE, LIMITS, NumberField,
  num, resolveBirthDate, toDateParts, within,
} from '../components/forms/Fields'
import { useNotifications } from '../hooks/useNotifcations'
import { settingsService, SettingsPatch } from '../services/settings.service'
import { BiometricPoint } from '../services/profile.service'
import BodyweightCard from '../components/profile/BodyweightCard'
import { FormState, LoadTrend, Settings, TrainingLoad } from '../types'
import {
  NotificationPreferences,
  notificationService,
} from '../services/notification.service'
import { LANGUAGE_NAMES, LOCALES, useT } from '../i18n'
import CoachAvatar from '../components/chat/CoachAvatar'
import {
  BellIcon, DownloadIcon, DumbbellIcon, GlobeIcon, HistoryListIcon, LockIcon,
  MoonIcon, NutritionIcon, RulerIcon, TrashIcon, TrendingUpIcon, UserIcon,
} from '../components/icons'
import { useLocaleStore } from '../store/useLocaleStore'

//   Reusable row components 
function StatCard({ value, label, color = 'text-white' }: {
  value: string; label: string; color?: string
}) {
  return (
    <div className="flex-1 bg-dark-700 rounded-xl p-3 text-center">
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-dark-400 text-[10px] mt-1">{label}</p>
    </div>
  )
}

//   Training load
// Muscle fatigue says how sore you are today. This says whether the last six
// weeks are building you up or burying you — the acute:chronic ratio is the
// best-evidenced early warning for overuse injury, so it gets called out.
function TrainingLoadCard({ load, systemicFatigue }: {
  load: TrainingLoad | null
  systemicFatigue: number
}) {
  const { t, tn } = useT()
  if (!load) return null

  const trendCopy: Record<LoadTrend, { label: string; color: string; note: string }> = {
    ramping:     { label: t('load.ramping'),     color: 'text-brand-red',    note: t('load.rampingNote') },
    building:    { label: t('load.building'),    color: 'text-brand-green',  note: t('load.buildingNote') },
    maintaining: { label: t('load.maintaining'), color: 'text-brand-teal',   note: t('load.maintainingNote') },
    detraining:  { label: t('load.detraining'),  color: 'text-brand-yellow', note: t('load.detrainingNote') },
  }

  const formCopy: Record<FormState, string> = {
    fresh: t('load.formFresh'),
    neutral: t('load.formNeutral'),
    tired: t('load.formTired'),
    overreaching: t('load.formOverreaching'),
  }

  const trend = trendCopy[load.trend]

  return (
    <div className="bg-dark-800 rounded-card border border-dark-600 p-2">
      <div className="flex justify-between items-center mb-1">
        <p className="text-dark-300 text-xs uppercase tracking-wider">{t('load.title')}</p>
        {load.established && (
          <span className={`text-xs font-semibold ${trend.color}`}>{trend.label}</span>
        )}
      </div>

      {!load.established ? (
        <p className="text-dark-400 text-xs px-1 py-2 leading-relaxed">
          {load.sessionCount === 0 ? t('load.none') : tn('load.few', load.sessionCount)}
        </p>
      ) : (
        <>
          <div className="flex gap-2">
            <StatCard value={String(Math.round(load.fitness))} label={t('load.fitness')} color="text-brand-teal" />
            <StatCard value={String(Math.round(load.fatigue))} label={t('load.fatigue')} color="text-brand-orange" />
            <StatCard
              value={load.form > 0 ? `+${Math.round(load.form)}` : String(Math.round(load.form))}
              label={formCopy[load.formState]}
              color={load.form >= 0 ? 'text-brand-green' : 'text-brand-yellow'}
            />
            <StatCard
              value={`${systemicFatigue}%`}
              label={t('load.wholeBody')}
              color={
                systemicFatigue >= 70 ? 'text-brand-red' :
                systemicFatigue >= 35 ? 'text-brand-yellow' : 'text-brand-green'
              }
            />
          </div>
          <p className="text-dark-400 text-[11px] mt-2 px-1 leading-relaxed">
            {trend.note}
            {load.previousWeeklyLoad > 0 && (
              <> {t('load.weekCompare', { week: load.weeklyLoad, previous: load.previousWeeklyLoad })}</>
            )}
          </p>
        </>
      )}
    </div>
  )
}

function SettingsRow({ icon, label, sublabel, color = 'text-white', right, onClick }: {
  // A node, not a string: most rows are an emoji, but the AI row shows the
  // coach's actual avatar.
  icon: React.ReactNode; label: string; sublabel?: string
  color?: string; right?: React.ReactNode; onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-1.5
                 active:bg-dark-700 transition-colors text-left"
    >
      <span className="w-5 flex items-center justify-center text-dark-300">{icon}</span>
      <div className="flex-1">
        <p className={`text-sm font-medium ${color}`}>{label}</p>
        {sublabel && <p className="text-dark-400 text-xs mt-0.5">{sublabel}</p>}
      </div>
      {right ?? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="#555" strokeWidth="2">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      )}
    </button>
  )
}

//   Toggle component 
// A span rather than a button: it lives inside SettingsRow, which is itself a
// button, and a button nested in a button is invalid HTML — the click landed on
// whichever one the browser felt like. Harmless while the toggle did nothing
// locally; not harmless now that it writes to the server.
function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <span
      role="switch"
      aria-checked={value}
      tabIndex={0}
      onClick={e => { e.stopPropagation(); onChange(!value) }}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          e.stopPropagation()
          onChange(!value)
        }
      }}
      className={`w-10 h-6 rounded-full flex items-center px-0.5 shrink-0
                 transition-all duration-200
                 ${value ? 'bg-brand-teal justify-end' : 'bg-dark-600 justify-start'}`}
    >
      <span className="w-5 h-5 bg-white rounded-full shadow" />
    </span>
  )
}

/**
 * Two-way segmented control, for settings where both options deserve to be
 * visible. A toggle would work for units, but "on/off" says nothing about which
 * state is which — the labels are the whole point here.
 *
 * Rendered as spans inside the parent SettingsRow button rather than nested
 * buttons, which is invalid HTML and swallows the outer row's own clicks.
 */
function SegmentedControl<T extends string>({ value, options, onChange }: {
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <span className="flex bg-dark-700 rounded-btn p-0.5 gap-0.5">
      {options.map(option => (
        <span
          key={option.value}
          role="button"
          tabIndex={0}
          onClick={e => { e.stopPropagation(); onChange(option.value) }}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              e.stopPropagation()
              onChange(option.value)
            }
          }}
          className={`px-2.5 py-1 rounded-btn text-xs font-medium transition-colors
                     ${value === option.value
                       ? 'bg-brand-teal text-white'
                       : 'text-dark-300'}`}
        >
          {option.label}
        </span>
      ))}
    </span>
  )
}

const UNIT_OPTIONS = [
  { value: 'metric',   label: 'kg/cm' },
  { value: 'imperial', label: 'lb/ft' },
] as const

//   Edit Profile Modal
//
// Writes the same columns onboarding does, through the same field components,
// so the two cannot drift. It previously asked for a plain `age`, which the
// recovery model no longer reads — it prefers `birthDate` — so editing it
// changed nothing the athlete could observe.
//
// Values only. Each label is a dictionary key built from its value, so the
// typecheck refuses a value with no label in one of the languages.
const SEXES = ['male', 'female', 'other', 'prefer_not_to_say'] as const
const LEVELS = ['beginner', 'intermediate', 'advanced'] as const
const GOALS = ['hypertrophy', 'strength', 'endurance', 'weight_loss'] as const

const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (list as readonly string[]).includes(value)

function EditProfileModal({ profile, imperial, onSave, onClose }: {
  profile: any
  imperial: boolean
  onSave: (data: any) => void
  onClose: () => void
}) {
  const { t } = useT()
  const [name, setName] = useState<string>(profile?.name ?? '')
  const [birth, setBirth] = useState<DateParts>(toDateParts(profile?.birthDate))
  const [sex, setSex] = useState<string | null>(profile?.gender ?? null)
  const [level, setLevel] = useState<string | null>(profile?.fitnessLevel ?? null)
  const [goal, setGoal] = useState<string | null>(profile?.goal ?? null)
  const [days, setDays] = useState<number | null>(profile?.trainingDaysPerWeek ?? null)
  const [years, setYears] = useState<string>(
    profile?.experienceYears != null ? String(profile.experienceYears) : ''
  )

  // Seeded in whichever unit the athlete reads, converted back on save. The
  // stored value is always metric.
  const [cm, setCm] = useState(profile?.height != null ? String(Math.round(profile.height)) : '')
  const [kg, setKg] = useState(profile?.weight != null ? String(profile.weight) : '')
  const [feet, setFeet] = useState(
    profile?.height != null ? String(cmToFeetInches(profile.height).feet) : ''
  )
  const [inches, setInches] = useState(
    profile?.height != null ? String(cmToFeetInches(profile.height).inches) : ''
  )
  const [lb, setLb] = useState(
    profile?.weight != null ? String(Math.round(kgToLb(profile.weight) * 10) / 10) : ''
  )

  const birthResolved = resolveBirthDate(birth)

  const heightCm = imperial
    ? (within(num(feet), LIMITS.feet) && within(num(inches), LIMITS.inches)
        ? feetInchesToCm(num(feet)!, num(inches)!) : null)
    : (within(num(cm), LIMITS.cm) ? num(cm) : null)

  const weightKg = imperial
    ? (within(num(lb), LIMITS.lb) ? lbToKg(num(lb)!) : null)
    : (within(num(kg), LIMITS.kg) ? num(kg) : null)

  // Bodyweight is load-bearing for calisthenics scoring, so it may not be
  // cleared to nothing once set. Everything else may be left blank.
  const valid =
    name.trim() !== '' &&
    weightKg !== null &&
    heightCm !== null &&
    (birth.day === '' && birth.month === '' && birth.year === '' ? true : birthResolved.date !== null)

  const save = () => {
    const y = num(years)
    onSave({
      name: name.trim(),
      gender: sex ?? undefined,
      fitnessLevel: level ?? undefined,
      goal: goal ?? undefined,
      height: Math.round(heightCm! * 10) / 10,
      weight: Math.round(weightKg! * 10) / 10,
      ...(birthResolved.date ? { birthDate: birthResolved.date.toISOString() } : {}),
      ...(days != null ? { trainingDaysPerWeek: days } : {}),
      ...(y != null ? { experienceYears: y } : {}),
    })
  }

  return (
    // The shared sheet, so this rises, drags shut and sits over the nav the
    // same way every other sheet in the app does.
    <BottomSheet
      title={t('profile.editTitle')}
      onClose={onClose}
      footer={
        <button onClick={save} disabled={!valid}
          className="w-full bg-brand-teal text-black font-bold py-3.5
                     rounded-btn active:scale-95 transition-transform
                     disabled:opacity-40">
          {t('profile.editSave')}
        </button>
      }
    >
        <div className="flex flex-col gap-5">

          <div>
            <label className="text-dark-300 text-xs mb-1.5 block">{t('field.name')}</label>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder={t('field.namePlaceholder')}
              className={`${INPUT_BASE} border-dark-600 focus:border-brand-teal`}
            />
          </div>

          <BirthDateField value={birth} onChange={setBirth} error={birthResolved.error} />

          {/* Height + weight, in whichever unit they read */}
          {imperial ? (
            <>
              <div>
                <label className="text-dark-300 text-xs mb-1.5 block">{t('field.height')}</label>
                <div className="flex gap-2.5">
                  <NumberField value={feet} onChange={setFeet} unit="ft"
                               placeholder="5" limits={LIMITS.feet} />
                  <NumberField value={inches} onChange={setInches} unit="in"
                               placeholder="10" limits={LIMITS.inches} />
                </div>
              </div>
              <NumberField label={t('field.weight')} value={lb} onChange={setLb} unit="lb"
                           placeholder="165" limits={LIMITS.lb} decimal />
            </>
          ) : (
            <>
              <NumberField label={t('field.height')} value={cm} onChange={setCm} unit="cm"
                           placeholder="175" limits={LIMITS.cm} />
              <NumberField label={t('field.weight')} value={kg} onChange={setKg} unit="kg"
                           placeholder="75" limits={LIMITS.kg} decimal />
            </>
          )}

          <div>
            <label className="text-dark-300 text-xs mb-1.5 block">{t('field.sex')}</label>
            <ChipRow options={SEXES.map(v => ({ value: v, label: t(`sex.${v}`) }))}
                     value={sex as any} onChange={setSex} layout="grid2" />
          </div>

          <div>
            <label className="text-dark-300 text-xs mb-1.5 block">{t('field.fitnessLevel')}</label>
            <ChipRow options={LEVELS.map(v => ({ value: v, label: t(`level.${v}`) }))}
                     value={level as any} onChange={setLevel} />
          </div>

          <div>
            <label className="text-dark-300 text-xs mb-1.5 block">{t('field.goal')}</label>
            <ChipRow options={GOALS.map(v => ({ value: v, label: t(`goal.${v}`) }))}
                     value={goal as any} onChange={setGoal} layout="grid2" />
          </div>

          <div>
            <label className="text-dark-300 text-xs mb-1.5 block">
              {t('field.daysPerWeek')} <span className="text-dark-400">{t('common.optional')}</span>
            </label>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7].map(d => (
                <button key={d} onClick={() => setDays(days === d ? null : d)}
                  className={`flex-1 py-2.5 rounded-btn text-sm font-semibold border transition-colors
                              ${days === d
                                ? 'bg-brand-teal text-black border-brand-teal'
                                : 'bg-dark-700 text-dark-300 border-dark-600'}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>

          <NumberField label={`${t('field.yearsTraining')} ${t('common.optional')}`}
                       value={years} onChange={setYears}
                       unit={t('unit.years')} placeholder="2.5" limits={LIMITS.years} decimal />
        </div>

    </BottomSheet>
  )
}

//   Log Sleep Modal 
function LogSleepModal({ onSave, onClose }: {
  onSave: (data: any) => void; onClose: () => void
}) {
  const [hours, setHours]   = useState(7)
  const [score, setScore]   = useState(75)
  const { t } = useT()

  return (
    <BottomSheet
      title={t('sleep.title')}
      onClose={onClose}
      footer={
        <button
          onClick={() => onSave({
            sleepDate:   new Date().toISOString().split('T')[0],
            durationMin: hours * 60,
            sleepScore:  score
          })}
          className="w-full bg-brand-teal text-black font-bold py-4
                     rounded-btn active:scale-95 transition-transform">
          {t('sleep.save')}
        </button>
      }
    >
        <div className="flex flex-col gap-5">
          {/* Hours */}
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-dark-300 text-sm">{t('sleep.duration')}</label>
              <span className="text-white font-bold">{t('unit.hours', { n: hours })}</span>
            </div>
            <input type="range" data-no-page-swipe min="1" max="12" value={hours}
              onChange={e => setHours(Number(e.target.value))}
              className="w-full accent-brand-teal" />
            <div className="flex justify-between text-dark-500 text-xs mt-1">
              <span>{t('unit.hours', { n: 1 })}</span><span>{t('unit.hours', { n: 12 })}</span>
            </div>
          </div>

          {/* Quality */}
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-dark-300 text-sm">{t('sleep.quality')}</label>
              <span className="text-white font-bold">{score}%</span>
            </div>
            <input type="range" data-no-page-swipe min="0" max="100" value={score}
              onChange={e => setScore(Number(e.target.value))}
              className="w-full accent-brand-teal" />
            <div className="flex justify-between text-dark-500 text-xs mt-1">
              <span>{t('sleep.poor')}</span><span>{t('sleep.excellent')}</span>
            </div>
          </div>
        </div>
    </BottomSheet>
  )
}

//   Log Nutrition Modal 
function LogNutritionModal({ onSave, onClose }: {
  onSave: (data: any) => void; onClose: () => void
}) {
  const [protein,  setProtein]  = useState(150)
  const [calories, setCalories] = useState(2500)
  const { t } = useT()

  return (
    <BottomSheet
      title={t('nutrition.title')}
      onClose={onClose}
      footer={
        <button
          onClick={() => onSave({
            logDate:  new Date().toISOString().split('T')[0],
            proteinG: protein,
            calories
          })}
          className="w-full bg-brand-teal text-black font-bold py-4
                     rounded-btn active:scale-95 transition-transform">
          {t('nutrition.save')}
        </button>
      }
    >
        <div className="flex flex-col gap-5">
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-dark-300 text-sm">{t('nutrition.protein')}</label>
              <span className="text-white font-bold">{protein}g</span>
            </div>
            <input type="range" data-no-page-swipe min="0" max="300" value={protein}
              onChange={e => setProtein(Number(e.target.value))}
              className="w-full accent-brand-teal" />
          </div>

          <div>
            <div className="flex justify-between mb-2">
              <label className="text-dark-300 text-sm">{t('nutrition.calories')}</label>
              <span className="text-white font-bold">{calories} kcal</span>
            </div>
            <input type="range" data-no-page-swipe min="500" max="5000" step="50"
              value={calories}
              onChange={e => setCalories(Number(e.target.value))}
              className="w-full accent-brand-teal" />
          </div>

        </div>
    </BottomSheet>
  )
}

//   Main Profile Page 
export default function Profile() {
  const navigate = useNavigate()
  const { user, logout, fetchMe } = useAuthStore()
  const {
    readinessScore, systemicFatigue, sleep, trainingLoad, fetchFatigue, fetchTrainingLoad,
  } = useFatigueStore()
  // Only needs to READ the state here — enabling, testing and per-type choices
  // all live on the Notifications screen now.
  const { isPushSubscribed } = useNotifications()
  const { equipmentIds, injuries } = useOnboardingStore()
  const { t, tn, num, locale } = useT()
  const setLocale = useLocaleStore(s => s.setLocale)

  const [profileData, setProfileData]       = useState<any>(null)
  const [isLoading, setIsLoading]           = useState(true)
  const [showEditModal, setShowEditModal]   = useState(false)
  const [showSleepModal, setShowSleepModal] = useState(false)
  const [showNutritionModal, setShowNutritionModal] = useState(false)
  const [settings, setSettings]             = useState<Settings | null>(null)
  const [settingsError, setSettingsError]   = useState<string | null>(null)
  const [weightSeries, setWeightSeries]     = useState<BiometricPoint[]>([])
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  // 'done' carries the filename, so the row can say where the export went
  const [exportState, setExportState] =
    useState<{ status: 'idle' | 'busy' | 'error' } | { status: 'done'; file: string }>({ status: 'idle' })
  const [pushEnabled, setPushEnabled]       = useState(false)
  const [prefs, setPrefs]                   = useState<NotificationPreferences | null>(null)

  useEffect(() => {
    profileService.getProfile()
      .then(data => {
        setProfileData(data)
        setSettings(data.settings ?? null)
      })
      .finally(() => setIsLoading(false))
  }, [])

  // Its own request rather than folded into getProfile: the series is the only
  // unbounded thing on this screen, and every other card should render without
  // waiting on a year of measurements. A failure leaves the card in its empty
  // state instead of taking the profile down with it.
  useEffect(() => {
    profileService.getBiometrics('WEIGHT')
      .then(series => setWeightSeries(series.points))
      .catch(() => setWeightSeries([]))
  }, [])

  // On requires BOTH: this device holds a subscription, and the server has the
  // user opted in. Reading only the browser meant anyone who subscribed before
  // the opt-in model existed saw "On" while the server would never send them
  // anything — the migration deliberately does not backfill consent.
  useEffect(() => {
    Promise.all([
      isPushSubscribed(),
      notificationService.getPreferences().catch(() => null),
    ]).then(([subscribed, serverPrefs]) => {
      if (serverPrefs) setPrefs(serverPrefs)
      setPushEnabled(subscribed && Boolean(serverPrefs?.pushEnabled))
    })
  }, [])

  useEffect(() => {
    fetchTrainingLoad()
    // Readiness too, rather than trusting whatever Home last left in the store:
    // this screen prints the score and now also explains it, and a deep link
    // straight to /profile arrives with an empty store and would show 0%.
    fetchFatigue()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // The modal already validated and converted to metric, so this forwards its
  // payload as-is rather than re-parsing it. Re-deriving numbers here is how
  // the old `age` field ended up silently disagreeing with `birthDate`.
  const handleSaveProfile = async (form: any) => {
    const saved = await profileService.updateProfile(form)
    setProfileData((prev: any) => ({ ...prev, profile: saved }))
    // Keeps the cached auth user in step — Home reads the name from there, so
    // renaming yourself otherwise left the old name on the greeting until the
    // next launch.
    await fetchMe()
    // A saved weight change writes a new Biometric row, so the chart is stale
    // the moment the modal closes. Refetched rather than appended locally:
    // updateProfile only records a point when the value actually moved, and
    // guessing that rule here would drift from it.
    profileService.getBiometrics('WEIGHT')
      .then(series => setWeightSeries(series.points))
      .catch(() => {})
    setShowEditModal(false)
  }

  const handleSaveSleep = async (data: any) => {
    await profileService.logSleep(data)
    setShowSleepModal(false)
    // Sleep moves the readiness score, and the score is on screen directly
    // above the button that opened this modal. Without the refetch the athlete
    // logs four hours' sleep and watches nothing happen.
    await Promise.all([
      fetchFatigue(),
      profileService.getProfile().then(setProfileData).catch(() => {}),
    ])
  }

  const handleSaveNutrition = async (data: any) => {
    await profileService.logNutrition(data)
    setShowNutritionModal(false)
  }

  /**
   * Optimistic, then reverted on failure.
   *
   * These controls used to be `onChange={setAiConsent}` and nothing else — the
   * switch moved, the server never heard about it, and the old value came back
   * on the next launch. Showing the new state immediately is right for a
   * toggle; showing it when the save failed is how that bug looked from the
   * outside, so the revert and the message are the part that matters.
   */
  const saveSettings = async (patch: SettingsPatch) => {
    if (!settings) return
    const previous = settings
    const previousLocale = locale

    setSettings({ ...settings, ...patch })
    setSettingsError(null)
    // The screen switches language before the server answers, like every
    // other toggle here, and switches back with the rest if the save fails.
    if (patch.language) setLocale(patch.language)

    try {
      const saved = await settingsService.updateSettings(patch)
      setSettings(saved)
      // profileData carries its own copy, and EditProfileModal reads the unit
      // from it — left stale, changing units would not reach the form.
      setProfileData((prev: any) => (prev ? { ...prev, settings: saved } : prev))
    } catch {
      setSettings(previous)
      if (patch.language) setLocale(previousLocale)
      setSettingsError(t('profile.saveFailed'))
    }
  }

  /**
   * Fetch everything, render the report, save it.
   *
   * The report builder is loaded on demand: it carries the body artwork and
   * a page of markup that nobody needs until they ask for an export.
   */
  const handleExport = async () => {
    if (exportState.status === 'busy') return
    setExportState({ status: 'busy' })
    try {
      const [data, report] = await Promise.all([
        exportService.getAll(),
        import('../lib/exportReport'),
      ])
      const html = report.buildExportHtml(data, { locale, gender: data.profile?.gender ?? null })
      const file = report.exportFileName(data)
      await report.saveExportFile(file, html)
      setExportState({ status: 'done', file })
    } catch {
      setExportState({ status: 'error' })
    }
  }

  const handleDeleteAccount = async () => {
    await profileService.deleteAccount()
    logout()
    navigate('/login')
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  // Readiness color
  const readinessColor =
    readinessScore >= 70 ? 'text-brand-green' :
    readinessScore >= 40 ? 'text-brand-yellow' : 'text-brand-red'

  // Initial letter for avatar
  const initial = (profileData?.profile?.name ?? user?.email ?? 'U')[0].toUpperCase()

  // Format total volume
  const formatVolume = (kg: number) => {
    if (kg >= 1000) return `${num(kg / 1000)}t`
    return `${Math.round(kg)}kg`
  }

  // Stored answers are enum values ('prefer_not_to_say', 'weight_loss'). Shown
  // through the dictionary when recognised, and as stored otherwise — an old
  // row holding something this build does not know is still worth showing.
  const profile = profileData?.profile
  const level: unknown = profile?.fitnessLevel
  const goal: unknown = profile?.goal
  const sex: unknown = profile?.gender
  const levelLabel = isOneOf(LEVELS, level) ? t(`level.${level}`) : profile?.fitnessLevel
  const goalLabel = isOneOf(GOALS, goal) ? t(`goal.${goal}`) : profile?.goal?.replace('_', ' ')
  const sexLabel = isOneOf(SEXES, sex) ? t(`sex.${sex}`) : profile?.gender
  const sleepHours = (minutes: number) => t('unit.hours', { n: num(minutes / 60) })

  if (isLoading) return (
    <div className="flex-1 bg-dark-900 flex items-center justify-center">
      <div className="text-dark-300 text-sm">{t('profile.loading')}</div>
    </div>
  )

  return (
    <div className="flex-1 bg-dark-900">

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-2 pb-0">
        <h1 className="text-white text-2xl font-bold">{t('profile.title')}</h1>
        <button
          onClick={handleLogout}
          className="bg-dark-800 border border-dark-600 rounded-full
                     px-3 py-1.5 text-dark-300 text-xs"
        >
          {t('profile.signOut')}
        </button>
      </div>

      {/* Avatar + name strip */}
      <div className="px-5 mb-1 flex items-center gap-4">
        {/* Avatar */}
        <div className="relative">
          <div className="w-16 h-16 rounded-full flex items-center justify-center
                          text-2xl font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #f97316, #ef4444)' }}>
            {initial}
          </div>
          <button
            onClick={() => setShowEditModal(true)}
            className="absolute -bottom-1 -right-1 w-6 h-6 bg-brand-teal
                       rounded-full flex items-center justify-center
                       text-black text-xs font-bold">
            +
          </button>
        </div>

        <div>
          <h2 className="text-white text-xl font-bold">
            {profile?.name ?? t('common.athlete')}
          </h2>
          <p className="text-dark-400 text-sm capitalize">
            {levelLabel ?? t('common.athlete')}
            {goalLabel ? ` · ${goalLabel}` : ''}
          </p>
          <p className="text-brand-teal text-xs mt-1">
            {t('profile.goalLine', { goal: goalLabel ?? t('common.notSet') })}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 px-3">

        {/* Readiness strip */}
        <div className="bg-dark-800 rounded-card border border-dark-600 p-2">
          <p className="text-dark-300 text-xs uppercase tracking-wider mb-1">
            {t('profile.todaysReadiness')}
          </p>
          <div className="flex gap-2">
            <StatCard
              value={`${readinessScore}%`}
              label={t('profile.statReadiness')}
              color={readinessColor}
            />
            <StatCard
              value={profileData?.today?.hrv
                ? `${Math.round(profileData.today.hrv)}`
                : '—'}
              label={t('profile.statHrv')}
              color="text-brand-orange"
            />
            <StatCard
              value={profileData?.today?.sleepDuration
                ? sleepHours(profileData.today.sleepDuration)
                : '—'}
              label={t('profile.statSleep')}
              color="text-brand-yellow"
            />
            <StatCard
              value={profileData?.today?.protein
                ? `${Math.round(profileData.today.protein)}g`
                : '—'}
              label={t('profile.statProtein')}
              color="text-brand-green"
            />
          </div>

          {/* Why the number is what it is. Sleep now moves readiness, so the
              screen has to say when it did — and equally when it did not, or an
              unlogged night looks like a night that scored neutral. Wording
              comes from the server so every surface says the same thing. */}
          {sleep && (
            <p className={`text-[11px] mt-2 leading-relaxed ${
              sleep.applied ? 'text-dark-300' : 'text-dark-400'
            }`}>
              {sleep.note}
              {!sleep.applied && (
                <button
                  onClick={() => setShowSleepModal(true)}
                  className="text-brand-teal ml-1"
                >
                  {t('common.logIt')}
                </button>
              )}
            </p>
          )}
        </div>

        {/* Where the history lives. Its own group rather than rows in the
            Settings list below — these are views, not preferences, and burying
            the app's only charts under "Settings" is how they stay unfound. */}
        <div className="bg-dark-800 rounded-card border border-dark-600 overflow-hidden">
          <p className="text-dark-300 text-xs uppercase tracking-wider
                        px-2 py-0.5 border-b border-dark-700">
            {t('profile.yourTraining')}
          </p>

          <SettingsRow
            icon={<TrendingUpIcon />}
            label={t('profile.progress')}
            sublabel={t('profile.progressSub')}
            onClick={() => navigate('/progress')}
          />

          <div className="h-px bg-dark-700 mx-4" />

          <SettingsRow
            icon={<HistoryListIcon />}
            label={t('profile.history')}
            sublabel={t('profile.historySub')}
            onClick={() => navigate('/history')}
          />
        </div>

        {/* Training load — the weeks-long trend, not today's soreness */}
        <TrainingLoadCard load={trainingLoad} systemicFatigue={systemicFatigue} />

        {/* Bodyweight trend + BMI. Sits above Body Stats because it answers the
            same question with history behind it — the static row below is the
            editable record, this is what it has been doing. */}
        <BodyweightCard
          points={weightSeries}
          heightCm={profileData?.profile?.height ?? null}
          imperial={settings?.preferredUnit === 'imperial'}
        />

        {/* Body stats */}
        <div className="bg-dark-800 rounded-card border border-dark-600 p-2">
          <div className="flex justify-between items-center mb-3">
            <p className="text-dark-300 text-xs uppercase tracking-wider">
              {t('profile.bodyStats')}
            </p>
            <button
              onClick={() => setShowEditModal(true)}
              className="text-brand-teal text-xs">
              {t('profile.edit')}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-y-3">
            {[
              { label: t('profile.height'), value: profile?.height ? `${profile.height} cm` : '—' },
              { label: t('profile.weight'), value: profile?.weight ? `${profile.weight} kg` : '—' },
              { label: t('profile.age'),    value: profile?.age    ? `${profile.age} ${t('unit.years')}` : '—' },
              { label: t('profile.gender'), value: sexLabel ?? '—' },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between items-center pr-4">
                <span className="text-dark-400 text-sm">{label}</span>
                <span className="text-white text-sm font-medium capitalize">
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Training summary */}
        <div className="bg-dark-800 rounded-card border border-dark-600 p-2">
          <p className="text-dark-300 text-xs uppercase tracking-wider mb-1">
            {t('profile.summary')}
          </p>
          <div className="flex gap-3 items-center">
            <div className="flex-1 text-center">
              <p className="text-white text-2xl font-bold">
                {profileData?.stats?.totalWorkouts ?? 0}
              </p>
              <p className="text-dark-400 text-xs mt-1">{t('profile.workouts')}</p>
            </div>
            <div className="w-px h-10 bg-dark-600" />
            <div className="flex-1 text-center">
              <p className="text-white text-2xl font-bold">
                {formatVolume(profileData?.stats?.totalVolume ?? 0)}
              </p>
              <p className="text-dark-400 text-xs mt-1">{t('profile.totalVolume')}</p>
            </div>
            <div className="w-px h-10 bg-dark-600" />
            <div className="flex-1 text-center">
              <p className="text-white text-2xl font-bold">
                {profileData?.stats?.avgRpe
                  ? num(profileData.stats.avgRpe)
                  : '—'}
              </p>
              <p className="text-dark-400 text-xs mt-1">{t('profile.avgRpe')}</p>
            </div>
          </div>
        </div>

        {/* Settings list */}
        <div className="bg-dark-800 rounded-card border border-dark-600 overflow-hidden">
          <p className="text-dark-300 text-xs uppercase tracking-wider
                        px-2 py-0.5 border-b border-dark-700">
            {t('profile.settings')}
          </p>

          <SettingsRow
            icon={<UserIcon />}
            label={t('profile.editProfile')}
            sublabel={t('profile.editProfileSub')}
            onClick={() => setShowEditModal(true)}
          />

          <div className="h-px bg-dark-700 mx-4" />

          <SettingsRow
            icon={<DumbbellIcon />}
            label={t('profile.trainingSetup')}
            sublabel={equipmentIds.length > 0 || injuries.length > 0
              ? `${tn('profile.trainingSetupEquipment', equipmentIds.length)} · ${tn('profile.trainingSetupInjuries', injuries.length)}`
              : t('profile.trainingSetupNone')}
            onClick={() => navigate('/training-setup')}
          />


          <div className="h-px bg-dark-700 mx-4" />

          <SettingsRow
            icon={<MoonIcon />}
            label={t('profile.logSleep')}
            sublabel={profileData?.today?.sleepDuration
              ? t('profile.logSleepLast', { hours: sleepHours(profileData.today.sleepDuration) })
              : t('profile.logSleepNone')}
            onClick={() => setShowSleepModal(true)}
          />

          <div className="h-px bg-dark-700 mx-4" />

          <SettingsRow
            icon={<NutritionIcon />}
            label={t('profile.logNutrition')}
            sublabel={profileData?.today?.protein
              ? t('profile.logNutritionToday', { grams: Math.round(profileData.today.protein) })
              : t('profile.logNutritionNone')}
            onClick={() => setShowNutritionModal(true)}
          />

          <div className="h-px bg-dark-700 mx-4" />

          <SettingsRow
            icon={<RulerIcon />}
            label={t('profile.units')}
            sublabel={settings?.preferredUnit === 'imperial'
              ? t('profile.unitsImperial')
              : t('profile.unitsMetric')}
            right={
              <SegmentedControl
                value={settings?.preferredUnit === 'imperial' ? 'imperial' : 'metric'}
                options={UNIT_OPTIONS}
                onChange={preferredUnit => saveSettings({ preferredUnit })}
              />
            }
          />

          <div className="h-px bg-dark-700 mx-4" />

          {/* Shows the device's language, not the settings row's: they agree
              once signed in, and the device's is what is on screen. Each name
              is written in its own language, so it can be found by someone
              who cannot read the one currently showing. */}
          <SettingsRow
            icon={<GlobeIcon />}
            label={t('common.language')}
            right={
              <SegmentedControl
                value={locale}
                options={LOCALES.map(l => ({ value: l, label: LANGUAGE_NAMES[l].name }))}
                onChange={language => saveSettings({ language })}
              />
            }
          />

          <div className="h-px bg-dark-700 mx-4" />

          <SettingsRow
            icon={<CoachAvatar className="w-5 h-5" />}
            label={t('profile.aiConsent')}
            sublabel={settings?.aiConsentEnabled === false
              // Says what actually changes. "Allow AI to use your fitness data"
              // gives no hint that the chat survives and the coach nudges do
              // not, and the difference is the whole reason to leave it on.
              ? t('profile.aiConsentOff')
              : t('profile.aiConsentOn')}
            right={
              <Toggle
                value={settings?.aiConsentEnabled ?? true}
                onChange={aiConsentEnabled => saveSettings({ aiConsentEnabled })}
              />
            }
          />

          {settingsError && (
            <p className="text-brand-red text-xs px-4 pb-2">{settingsError}</p>
          )}

          <div className="h-px bg-dark-700 mx-4" />

          {/* One entry point rather than three scattered toggles — what to be
              notified about, how often and quiet hours all live together now. */}
          <SettingsRow
            icon={<BellIcon />}
            label={t('profile.notifications')}
            sublabel={
              !pushEnabled ? t('profile.notificationsOff') :
              prefs?.coachSuspendedAt ? t('profile.notificationsPaused') :
              prefs?.coachEnabled ? t('profile.notificationsCoach', { cap: prefs.dailyCap }) :
              t('profile.notificationsOn', { cap: prefs?.dailyCap ?? 3 })
            }
            right={<span className="text-dark-400 text-lg">›</span>}
            onClick={() => navigate('/profile/notifications')}
          />

          <div className="h-px bg-dark-700 mx-4" />

          <SettingsRow
            icon={<LockIcon />}
            label={t('profile.security')}
            sublabel={t('profile.securitySub')}
            right={<span className="text-dark-400 text-lg">›</span>}
            onClick={() => navigate('/profile/security')}
          />

          <div className="h-px bg-dark-700 mx-4" />

          <SettingsRow
            icon={<DownloadIcon />}
            label={t('profile.export')}
            sublabel={
              exportState.status === 'busy' ? t('profile.exporting')
              : exportState.status === 'error' ? t('profile.exportFailed')
              : exportState.status === 'done' ? t('profile.exportDone', { file: exportState.file })
              : t('profile.exportSub')
            }
            onClick={handleExport}
          />
        </div>

        {/* Danger zone */}
        <div className="bg-dark-800 rounded-card border border-dark-600 overflow-hidden">
          {!showDeleteConfirm ? (
            <SettingsRow
              icon={<TrashIcon className="w-5 h-5 text-brand-red" />}
              label={t('profile.delete')}
              sublabel={t('profile.deleteSub')}
              color="text-brand-red"
              onClick={() => setShowDeleteConfirm(true)}
            />
          ) : (
            <div className="p-4">
              <p className="text-white text-sm font-semibold mb-1">
                {t('profile.deleteConfirmTitle')}
              </p>
              <p className="text-dark-400 text-xs mb-4">
                {t('profile.deleteConfirmBody')}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 bg-dark-700 text-dark-300 border border-dark-600
                             py-3 rounded-btn text-sm">
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleDeleteAccount}
                  className="flex-1 bg-brand-red text-white font-bold
                             py-3 rounded-btn text-sm active:scale-95">
                  {t('profile.deleteConfirm')}
                </button>
              </div>
            </div>
          )}
        </div>

        

      </div>

      {/* Modals */}
      {showEditModal && (
        <EditProfileModal
          profile={profileData?.profile}
          imperial={settings?.preferredUnit === 'imperial'}
          onSave={handleSaveProfile}
          onClose={() => setShowEditModal(false)}
        />
      )}
      {showSleepModal && (
        <LogSleepModal
          onSave={handleSaveSleep}
          onClose={() => setShowSleepModal(false)}
        />
      )}
      {showNutritionModal && (
        <LogNutritionModal
          onSave={handleSaveNutrition}
          onClose={() => setShowNutritionModal(false)}
        />
      )}
    </div>
  )
}