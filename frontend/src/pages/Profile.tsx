import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import { useFatigueStore } from '../store/useFatigueStore'
import { profileService } from '../services/profile.service'
import { useNotifications } from '../hooks/useNotifcations'

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
function EditProfileModal({ profile, onSave, onClose }: {
  profile: any; onSave: (data: any) => void; onClose: () => void
}) {
  const [form, setForm] = useState({
    name:        profile?.name        ?? '',
    age:         profile?.age         ?? '',
    weight:      profile?.weight      ?? '',
    height:      profile?.height      ?? '',
    gender:      profile?.gender      ?? '',
    fitnessLevel: profile?.fitnessLevel ?? 'intermediate',
    goal:        profile?.goal        ?? 'hypertrophy',
  })

  const set = (key: string, val: string) =>
    setForm(f => ({ ...f, [key]: val }))

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-[430px] mx-auto bg-dark-800
                      rounded-t-2xl border-t border-dark-600 p-3 pt-1 pb-20
                      max-h-[90dvh] overflow-y-auto">

        <div className="flex justify-between items-center mb-1">
          <h2 className="text-white text-lg font-bold">Edit Profile</h2>
          <button onClick={onClose} className="text-dark-400 text-2xl leading-none">×</button>
        </div>

        <div className="flex flex-col gap-2">
          {[
            { key: 'name',   label: 'Name',       type: 'text',   placeholder: 'Your name' },
            { key: 'age',    label: 'Age',         type: 'number', placeholder: '25' },
            { key: 'weight', label: 'Weight (kg)', type: 'number', placeholder: '80' },
            { key: 'height', label: 'Height (cm)', type: 'number', placeholder: '180' },
          ].map(field => (
            <div key={field.key}>
              <label className="text-dark-300 text-xs mb-1 block">{field.label}</label>
              <input
                type={field.type}
                value={(form as any)[field.key]}
                onChange={e => set(field.key, e.target.value)}
                placeholder={field.placeholder}
                className="w-full bg-dark-700 border border-dark-600 rounded-btn
                           px-4 py-3 text-white text-sm placeholder-dark-500
                           focus:outline-none focus:border-brand-teal"
              />
            </div>
          ))}

          {/* Gender */}
          <div>
            <label className="text-dark-300 text-xs mb-1.5 block">Gender</label>
            <div className="flex gap-2">
              {['Male', 'Female', 'Other'].map(g => (
                <button key={g}
                  onClick={() => set('gender', g.toLowerCase())}
                  className={`flex-1 py-2.5 rounded-btn text-sm border transition-all
                             ${form.gender === g.toLowerCase()
                               ? 'bg-brand-teal text-black border-brand-teal'
                               : 'bg-dark-700 text-dark-300 border-dark-600'}`}>
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Fitness level */}
          <div>
            <label className="text-dark-300 text-xs mb-1.5 block">Fitness Level</label>
            <div className="flex gap-2">
              {['beginner', 'intermediate', 'advanced'].map(level => (
                <button key={level}
                  onClick={() => set('fitnessLevel', level)}
                  className={`flex-1 py-2.5 rounded-btn text-xs border capitalize
                             transition-all
                             ${form.fitnessLevel === level
                               ? 'bg-brand-teal text-black border-brand-teal'
                               : 'bg-dark-700 text-dark-300 border-dark-600'}`}>
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* Goal */}
          <div>
            <label className="text-dark-300 text-xs mb-1.5 block">Goal</label>
            <div className="grid grid-cols-2 gap-2">
              {['hypertrophy', 'strength', 'endurance', 'weight_loss'].map(goal => (
                <button key={goal}
                  onClick={() => set('goal', goal)}
                  className={`py-2.5 rounded-btn text-xs border capitalize
                             transition-all
                             ${form.goal === goal
                               ? 'bg-brand-teal text-black border-brand-teal'
                               : 'bg-dark-700 text-dark-300 border-dark-600'}`}>
                  {goal.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => onSave(form)}
            className="w-full bg-brand-teal text-black font-bold py-4
                       rounded-btn active:scale-95 transition-transform mt-2">
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
  const { user, logout } = useAuthStore()
  const { readinessScore } = useFatigueStore()
  const { testNotificationNow, subscribeToPush } = useNotifications()

  const [profileData, setProfileData]       = useState<any>(null)
  const [isLoading, setIsLoading]           = useState(true)
  const [showEditModal, setShowEditModal]   = useState(false)
  const [showSleepModal, setShowSleepModal] = useState(false)
  const [showNutritionModal, setShowNutritionModal] = useState(false)
  const [aiConsent, setAiConsent]           = useState(true)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    profileService.getProfile()
      .then(data => {
        setProfileData(data)
        setAiConsent(data.settings?.aiConsentEnabled ?? true)
      })
      .finally(() => setIsLoading(false))
  }, [])

  const handleSaveProfile = async (form: any) => {
    const saved = await profileService.updateProfile({
      name:         form.name,
      age:          form.age    ? Number(form.age)    : undefined,
      weight:       form.weight ? Number(form.weight) : undefined,
      height:       form.height ? Number(form.height) : undefined,
      gender:       form.gender,
      fitnessLevel: form.fitnessLevel,
      goal:         form.goal,
    })
    setProfileData((prev: any) => ({ ...prev, profile: saved }))
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

  const handleTestNotifications = async () => {
    const ok = await testNotificationNow()
    if (!ok) {
      alert('Notification permission was denied or unsupported on this browser/device.')
      return
    }
    alert('Test notification triggered. If nothing appeared, check OS/browser notification settings.')
  }

  const handleEnablePush = async () => {
    const ok = await subscribeToPush()
    alert(ok
      ? 'Push notifications enabled. You should get one every minute for testing.'
      : 'Could not enable push notifications. On iPhone, make sure you opened this from the home screen icon (not Safari), and use iOS 16.4+.')
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

          <SettingsRow
            icon="🔔"
            label="Test Notifications"
            sublabel="Send a test notification now"
            onClick={handleTestNotifications}
          />

          <div className="h-px bg-dark-700 mx-4" />

          <SettingsRow
            icon="📲"
            label="Enable Push Notifications"
            sublabel="Get a reminder every minute, even on lock screen"
            onClick={handleEnablePush}
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