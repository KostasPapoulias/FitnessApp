import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import { useFatigueStore } from '../store/useFatigueStore'
import { useOnboardingStore } from '../store/useOnboardingStore'
import { profileService } from '../services/profile.service'
import {
  cmToFeetInches, feetInchesToCm, kgToLb, lbToKg,
} from '../services/onboarding.service'
import {
  BirthDateField, ChipRow, DateParts, INPUT_BASE, LIMITS, NumberField,
  num, resolveBirthDate, toDateParts, within,
} from '../components/forms/Fields'
import { useNotifications } from '../hooks/useNotifcations'
import { FormState, LoadTrend, TrainingLoad } from '../types'
import {
  NotificationPreferences,
  notificationService,
} from '../services/notification.service'

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
  if (!load) return null

  const trendCopy: Record<LoadTrend, { label: string; color: string; note: string }> = {
    ramping: {
      label: 'Ramping fast', color: 'text-brand-red',
      note: 'This week is well above what you are conditioned for. Ease off before something gives.',
    },
    building: {
      label: 'Building', color: 'text-brand-green',
      note: 'Load is climbing at a sustainable rate. Keep it steady.',
    },
    maintaining: {
      label: 'Maintaining', color: 'text-brand-teal',
      note: 'Holding your current level. Add a little volume when you feel fresh.',
    },
    detraining: {
      label: 'Tailing off', color: 'text-brand-yellow',
      note: 'Training has dropped below your usual level — consistency beats intensity here.',
    },
  }

  const formCopy: Record<FormState, string> = {
    fresh: 'Fresh',
    neutral: 'Neutral',
    tired: 'Carrying load',
    overreaching: 'Overreaching',
  }

  const trend = trendCopy[load.trend]

  return (
    <div className="bg-dark-800 rounded-card border border-dark-600 p-2">
      <div className="flex justify-between items-center mb-1">
        <p className="text-dark-300 text-xs uppercase tracking-wider">Training Load</p>
        {load.established && (
          <span className={`text-xs font-semibold ${trend.color}`}>{trend.label}</span>
        )}
      </div>

      {!load.established ? (
        <p className="text-dark-400 text-xs px-1 py-2 leading-relaxed">
          {load.sessionCount === 0
            ? 'No finished sessions yet. Log a couple of weeks of training and this will show whether you are building or overreaching.'
            : `Only ${load.sessionCount} session${load.sessionCount === 1 ? '' : 's'} logged so far — a couple more weeks and this becomes meaningful.`}
        </p>
      ) : (
        <>
          <div className="flex gap-2">
            <StatCard value={String(Math.round(load.fitness))} label="Fitness (6wk)" color="text-brand-teal" />
            <StatCard value={String(Math.round(load.fatigue))} label="Fatigue (1wk)" color="text-brand-orange" />
            <StatCard
              value={load.form > 0 ? `+${Math.round(load.form)}` : String(Math.round(load.form))}
              label={formCopy[load.formState]}
              color={load.form >= 0 ? 'text-brand-green' : 'text-brand-yellow'}
            />
            <StatCard
              value={`${systemicFatigue}%`}
              label="Whole-body"
              color={
                systemicFatigue >= 70 ? 'text-brand-red' :
                systemicFatigue >= 35 ? 'text-brand-yellow' : 'text-brand-green'
              }
            />
          </div>
          <p className="text-dark-400 text-[11px] mt-2 px-1 leading-relaxed">
            {trend.note}
            {load.previousWeeklyLoad > 0 && (
              <> This week {load.weeklyLoad} vs {load.previousWeeklyLoad} last week.</>
            )}
          </p>
        </>
      )}
    </div>
  )
}

function SettingsRow({ icon, label, sublabel, color = 'text-white', right, onClick }: {
  icon: string; label: string; sublabel?: string
  color?: string; right?: React.ReactNode; onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-1.5
                 active:bg-dark-700 transition-colors text-left"
    >
      <span className="text-lg">{icon}</span>
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
function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`w-10 h-6 rounded-full flex items-center px-0.5
                 transition-all duration-200
                 ${value ? 'bg-brand-teal justify-end' : 'bg-dark-600 justify-start'}`}
    >
      <div className="w-5 h-5 bg-white rounded-full shadow" />
    </button>
  )
}

//   Edit Profile Modal
//
// Writes the same columns onboarding does, through the same field components,
// so the two cannot drift. It previously asked for a plain `age`, which the
// recovery model no longer reads — it prefers `birthDate` — so editing it
// changed nothing the athlete could observe.
const SEX_OPTIONS = [
  { value: 'male',              label: 'Male' },
  { value: 'female',            label: 'Female' },
  { value: 'other',             label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
] as const

const LEVEL_OPTIONS = [
  { value: 'beginner',     label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced',     label: 'Advanced' },
] as const

const GOAL_OPTIONS = [
  { value: 'hypertrophy', label: 'Build muscle' },
  { value: 'strength',    label: 'Get stronger' },
  { value: 'endurance',   label: 'Endurance' },
  { value: 'weight_loss', label: 'Lose weight' },
] as const

function EditProfileModal({ profile, imperial, onSave, onClose }: {
  profile: any
  imperial: boolean
  onSave: (data: any) => void
  onClose: () => void
}) {
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
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-[430px] mx-auto bg-dark-800
                      rounded-t-2xl border-t border-dark-600
                      max-h-[92dvh] flex flex-col">

        {/* Sticky so the title and close stay reachable on a long scroll. */}
        <div className="flex justify-between items-center px-5 pt-4 pb-3
                        border-b border-dark-700 flex-shrink-0">
          <h2 className="text-white text-lg font-bold">Edit Profile</h2>
          <button onClick={onClose}
                  className="text-dark-400 text-2xl leading-none w-8 h-8
                             flex items-center justify-center -mr-2">×</button>
        </div>

        <div className="overflow-y-auto px-5 py-5 flex flex-col gap-5">

          <div>
            <label className="text-dark-300 text-xs mb-1.5 block">Name</label>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="Your name"
              className={`${INPUT_BASE} border-dark-600 focus:border-brand-teal`}
            />
          </div>

          <BirthDateField value={birth} onChange={setBirth} error={birthResolved.error} />

          {/* Height + weight, in whichever unit they read */}
          {imperial ? (
            <>
              <div>
                <label className="text-dark-300 text-xs mb-1.5 block">Height</label>
                <div className="flex gap-2.5">
                  <NumberField value={feet} onChange={setFeet} unit="ft"
                               placeholder="5" limits={LIMITS.feet} />
                  <NumberField value={inches} onChange={setInches} unit="in"
                               placeholder="10" limits={LIMITS.inches} />
                </div>
              </div>
              <NumberField label="Weight" value={lb} onChange={setLb} unit="lb"
                           placeholder="165" limits={LIMITS.lb} decimal />
            </>
          ) : (
            <>
              <NumberField label="Height" value={cm} onChange={setCm} unit="cm"
                           placeholder="175" limits={LIMITS.cm} />
              <NumberField label="Weight" value={kg} onChange={setKg} unit="kg"
                           placeholder="75" limits={LIMITS.kg} decimal />
            </>
          )}

          <div>
            <label className="text-dark-300 text-xs mb-1.5 block">Sex</label>
            <ChipRow options={SEX_OPTIONS as any} value={sex as any}
                     onChange={setSex} layout="grid2" />
          </div>

          <div>
            <label className="text-dark-300 text-xs mb-1.5 block">Fitness level</label>
            <ChipRow options={LEVEL_OPTIONS as any} value={level as any} onChange={setLevel} />
          </div>

          <div>
            <label className="text-dark-300 text-xs mb-1.5 block">Goal</label>
            <ChipRow options={GOAL_OPTIONS as any} value={goal as any}
                     onChange={setGoal} layout="grid2" />
          </div>

          <div>
            <label className="text-dark-300 text-xs mb-1.5 block">
              Days per week you train <span className="text-dark-400">(optional)</span>
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

          <NumberField label="Years training (optional)" value={years} onChange={setYears}
                       unit="yrs" placeholder="2.5" limits={LIMITS.years} decimal />
        </div>

        {/* Outside the scroll area so Save is always reachable. */}
        <div className="px-5 pt-3 pb-[calc(1.25rem+var(--safe-bottom))]
                        border-t border-dark-700 flex-shrink-0">
          <button onClick={save} disabled={!valid}
            className="w-full bg-brand-teal text-black font-bold py-3.5
                       rounded-btn active:scale-95 transition-transform
                       disabled:opacity-40">
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}

//   Log Sleep Modal 
function LogSleepModal({ onSave, onClose }: {
  onSave: (data: any) => void; onClose: () => void
}) {
  const [hours, setHours]   = useState(7)
  const [score, setScore]   = useState(75)

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-[430px] mx-auto bg-dark-800
                      rounded-t-2xl border-t border-dark-600 p-5 pb-20">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-white text-lg font-bold">Log Sleep</h2>
          <button onClick={onClose} className="text-dark-400 text-2xl leading-none">×</button>
        </div>

        <div className="flex flex-col gap-5">
          {/* Hours */}
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-dark-300 text-sm">Duration</label>
              <span className="text-white font-bold">{hours}h</span>
            </div>
            <input type="range" min="1" max="12" value={hours}
              onChange={e => setHours(Number(e.target.value))}
              className="w-full accent-brand-teal" />
            <div className="flex justify-between text-dark-500 text-xs mt-1">
              <span>1h</span><span>12h</span>
            </div>
          </div>

          {/* Quality */}
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-dark-300 text-sm">Sleep Quality</label>
              <span className="text-white font-bold">{score}%</span>
            </div>
            <input type="range" min="0" max="100" value={score}
              onChange={e => setScore(Number(e.target.value))}
              className="w-full accent-brand-teal" />
            <div className="flex justify-between text-dark-500 text-xs mt-1">
              <span>Poor</span><span>Excellent</span>
            </div>
          </div>

          <button
            onClick={() => onSave({
              sleepDate:   new Date().toISOString().split('T')[0],
              durationMin: hours * 60,
              sleepScore:  score
            })}
            className="w-full bg-brand-teal text-black font-bold py-4
                       rounded-btn active:scale-95 transition-transform">
            Save Sleep Log
          </button>
        </div>
      </div>
    </div>
  )
}

//   Log Nutrition Modal 
function LogNutritionModal({ onSave, onClose }: {
  onSave: (data: any) => void; onClose: () => void
}) {
  const [protein,  setProtein]  = useState(150)
  const [calories, setCalories] = useState(2500)

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-[430px] mx-auto bg-dark-800
                      rounded-t-2xl border-t border-dark-600 p-5 pb-20">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-white text-lg font-bold">Log Nutrition</h2>
          <button onClick={onClose} className="text-dark-400 text-2xl leading-none">×</button>
        </div>

        <div className="flex flex-col gap-5">
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-dark-300 text-sm">Protein</label>
              <span className="text-white font-bold">{protein}g</span>
            </div>
            <input type="range" min="0" max="300" value={protein}
              onChange={e => setProtein(Number(e.target.value))}
              className="w-full accent-brand-teal" />
          </div>

          <div>
            <div className="flex justify-between mb-2">
              <label className="text-dark-300 text-sm">Calories</label>
              <span className="text-white font-bold">{calories} kcal</span>
            </div>
            <input type="range" min="500" max="5000" step="50"
              value={calories}
              onChange={e => setCalories(Number(e.target.value))}
              className="w-full accent-brand-teal" />
          </div>

          <button
            onClick={() => onSave({
              logDate:  new Date().toISOString().split('T')[0],
              proteinG: protein,
              calories
            })}
            className="w-full bg-brand-teal text-black font-bold py-4
                       rounded-btn active:scale-95 transition-transform">
            Save Nutrition Log
          </button>
        </div>
      </div>
    </div>
  )
}

//   Main Profile Page 
export default function Profile() {
  const navigate = useNavigate()
  const { user, logout, fetchMe } = useAuthStore()
  const { readinessScore, systemicFatigue, trainingLoad, fetchTrainingLoad } = useFatigueStore()
  // Only needs to READ the state here — enabling, testing and per-type choices
  // all live on the Notifications screen now.
  const { isPushSubscribed } = useNotifications()
  const { equipmentIds, injuries, resetHints } = useOnboardingStore()

  const [profileData, setProfileData]       = useState<any>(null)
  const [isLoading, setIsLoading]           = useState(true)
  const [showEditModal, setShowEditModal]   = useState(false)
  const [showSleepModal, setShowSleepModal] = useState(false)
  const [showNutritionModal, setShowNutritionModal] = useState(false)
  const [aiConsent, setAiConsent]           = useState(true)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [pushEnabled, setPushEnabled]       = useState(false)
  const [prefs, setPrefs]                   = useState<NotificationPreferences | null>(null)

  useEffect(() => {
    profileService.getProfile()
      .then(data => {
        setProfileData(data)
        setAiConsent(data.settings?.aiConsentEnabled ?? true)
      })
      .finally(() => setIsLoading(false))
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
    setShowEditModal(false)
  }

  const handleSaveSleep = async (data: any) => {
    await profileService.logSleep(data)
    setShowSleepModal(false)
  }

  const handleSaveNutrition = async (data: any) => {
    await profileService.logNutrition(data)
    setShowNutritionModal(false)
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
    if (kg >= 1000) return `${(kg / 1000).toFixed(1)}t`
    return `${Math.round(kg)}kg`
  }

  if (isLoading) return (
    <div className="min-h-853 bg-dark-900 flex items-center justify-center">
      <div className="text-dark-300 text-sm">Loading profile...</div>
    </div>
  )

  return (
    <div className="min-h-853 bg-dark-900">

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-2 pb-0">
        <h1 className="text-white text-2xl font-bold">Profile</h1>
        <button
          onClick={handleLogout}
          className="bg-dark-800 border border-dark-600 rounded-full
                     px-3 py-1.5 text-dark-300 text-xs"
        >
          Sign Out
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
            {profileData?.profile?.name ?? 'Athlete'}
          </h2>
          <p className="text-dark-400 text-sm capitalize">
            {profileData?.profile?.fitnessLevel ?? 'Athlete'}
            {profileData?.profile?.goal
              ? ` · ${profileData.profile.goal.replace('_', ' ')}`
              : ''}
          </p>
          <p className="text-brand-teal text-xs mt-1">
            ✓ Goal: {profileData?.profile?.goal?.replace('_', ' ') ?? 'Not set'}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 px-3">

        {/* Readiness strip */}
        <div className="bg-dark-800 rounded-card border border-dark-600 p-2">
          <p className="text-dark-300 text-xs uppercase tracking-wider mb-1">
            Today's Readiness
          </p>
          <div className="flex gap-2">
            <StatCard
              value={`${readinessScore}%`}
              label="Readiness"
              color={readinessColor}
            />
            <StatCard
              value={profileData?.today?.hrv
                ? `${Math.round(profileData.today.hrv)}`
                : '—'}
              label="HRV (ms)"
              color="text-brand-orange"
            />
            <StatCard
              value={profileData?.today?.sleepDuration
                ? `${(profileData.today.sleepDuration / 60).toFixed(1)}h`
                : '—'}
              label="Sleep"
              color="text-brand-yellow"
            />
            <StatCard
              value={profileData?.today?.protein
                ? `${Math.round(profileData.today.protein)}g`
                : '—'}
              label="Protein"
              color="text-brand-green"
            />
          </div>
        </div>

        {/* Training load — the weeks-long trend, not today's soreness */}
        <TrainingLoadCard load={trainingLoad} systemicFatigue={systemicFatigue} />

        {/* Body stats */}
        <div className="bg-dark-800 rounded-card border border-dark-600 p-2">
          <div className="flex justify-between items-center mb-3">
            <p className="text-dark-300 text-xs uppercase tracking-wider">
              Body Stats
            </p>
            <button
              onClick={() => setShowEditModal(true)}
              className="text-brand-teal text-xs">
              Edit →
            </button>
          </div>
          <div className="grid grid-cols-2 gap-y-3">
            {[
              { label: 'Height', value: profileData?.profile?.height ? `${profileData.profile.height} cm` : '—' },
              { label: 'Weight', value: profileData?.profile?.weight ? `${profileData.profile.weight} kg` : '—' },
              { label: 'Age',    value: profileData?.profile?.age    ? `${profileData.profile.age} yrs`   : '—' },
              { label: 'Gender', value: profileData?.profile?.gender ? profileData.profile.gender : '—' },
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
            Training Summary
          </p>
          <div className="flex gap-3 items-center">
            <div className="flex-1 text-center">
              <p className="text-white text-2xl font-bold">
                {profileData?.stats?.totalWorkouts ?? 0}
              </p>
              <p className="text-dark-400 text-xs mt-1">Workouts</p>
            </div>
            <div className="w-px h-10 bg-dark-600" />
            <div className="flex-1 text-center">
              <p className="text-white text-2xl font-bold">
                {formatVolume(profileData?.stats?.totalVolume ?? 0)}
              </p>
              <p className="text-dark-400 text-xs mt-1">Total Volume</p>
            </div>
            <div className="w-px h-10 bg-dark-600" />
            <div className="flex-1 text-center">
              <p className="text-white text-2xl font-bold">
                {profileData?.stats?.avgRpe
                  ? profileData.stats.avgRpe.toFixed(1)
                  : '—'}
              </p>
              <p className="text-dark-400 text-xs mt-1">Avg RPE</p>
            </div>
          </div>
        </div>

        {/* Settings list */}
        <div className="bg-dark-800 rounded-card border border-dark-600 overflow-hidden">
          <p className="text-dark-300 text-xs uppercase tracking-wider
                        px-2 py-0.5 border-b border-dark-700">
            Settings
          </p>

          <SettingsRow
            icon="👤"
            label="Edit Profile"
            sublabel="Name, age, height, weight, goal"
            onClick={() => setShowEditModal(true)}
          />

          <div className="h-px bg-dark-700 mx-4" />

          <SettingsRow
            icon="🏋️"
            label="Training Setup"
            sublabel={equipmentIds.length > 0 || injuries.length > 0
              ? `${equipmentIds.length} equipment · ${injuries.length} injur${injuries.length === 1 ? 'y' : 'ies'}`
              : 'Equipment and injuries — not set'}
            onClick={() => navigate('/training-setup')}
          />

          <div className="h-px bg-dark-700 mx-4" />

          <SettingsRow
            icon="💡"
            label="Show Tips Again"
            sublabel="Replay the in-app hints"
            // Navigate only once the reset has landed, or Home renders before
            // the store clears and the tips do not reappear. The catch keeps a
            // failed reset from surfacing as an unhandled rejection.
            onClick={() => { resetHints().then(() => navigate('/')).catch(() => {}) }}
          />

          <div className="h-px bg-dark-700 mx-4" />

          <SettingsRow
            icon="😴"
            label="Log Sleep"
            sublabel={profileData?.today?.sleepDuration
              ? `Last: ${(profileData.today.sleepDuration / 60).toFixed(1)}h`
              : 'No sleep logged today'}
            onClick={() => setShowSleepModal(true)}
          />

          <div className="h-px bg-dark-700 mx-4" />

          <SettingsRow
            icon="🥗"
            label="Log Nutrition"
            sublabel={profileData?.today?.protein
              ? `Today: ${Math.round(profileData.today.protein)}g protein`
              : 'No nutrition logged today'}
            onClick={() => setShowNutritionModal(true)}
          />

          <div className="h-px bg-dark-700 mx-4" />

          <SettingsRow
            icon="🤖"
            label="AI Data Consent"
            sublabel="Allow AI to use your fitness data"
            right={
              <Toggle value={aiConsent} onChange={setAiConsent} />
            }
          />

          <div className="h-px bg-dark-700 mx-4" />

          {/* One entry point rather than three scattered toggles — what to be
              notified about, how often and quiet hours all live together now. */}
          <SettingsRow
            icon="🔔"
            label="Notifications"
            sublabel={
              !pushEnabled ? 'Off — choose what to be notified about' :
              prefs?.coachSuspendedAt ? 'On · AI coaching paused' :
              prefs?.coachEnabled ? `On · AI coaching, up to ${prefs.dailyCap}/day` :
              `On · up to ${prefs?.dailyCap ?? 3}/day`
            }
            right={<span className="text-dark-400 text-lg">›</span>}
            onClick={() => navigate('/profile/notifications')}
          />

          <div className="h-px bg-dark-700 mx-4" />

          <SettingsRow
            icon="🔒"
            label="Security"
            sublabel="PIN lock, password, sessions"
            right={<span className="text-dark-400 text-lg">›</span>}
            onClick={() => navigate('/profile/security')}
          />

          <div className="h-px bg-dark-700 mx-4" />

          <SettingsRow
            icon="📊"
            label="Export Data"
            sublabel="Download your workout history"
            onClick={() => alert('Export coming soon')}
          />
        </div>

        {/* Danger zone */}
        <div className="bg-dark-800 rounded-card border border-dark-600 overflow-hidden">
          {!showDeleteConfirm ? (
            <SettingsRow
              icon="🗑️"
              label="Delete Account"
              sublabel="Permanently remove all your data (GDPR)"
              color="text-brand-red"
              onClick={() => setShowDeleteConfirm(true)}
            />
          ) : (
            <div className="p-4">
              <p className="text-white text-sm font-semibold mb-1">
                Are you sure?
              </p>
              <p className="text-dark-400 text-xs mb-4">
                This will permanently delete your account and all workout history.
                This cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 bg-dark-700 text-dark-300 border border-dark-600
                             py-3 rounded-btn text-sm">
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  className="flex-1 bg-brand-red text-white font-bold
                             py-3 rounded-btn text-sm active:scale-95">
                  Delete Everything
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
          imperial={profileData?.settings?.preferredUnit === 'imperial'}
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