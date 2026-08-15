import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import {
  onboardingService, OnboardingAnswers, lbToKg, feetInchesToCm,
} from '../services/onboarding.service'
import {
  BirthDateField, DateParts, LIMITS, MIN_AGE, NumberField,
  num, resolveBirthDate, within,
} from '../components/forms/Fields'

// The gated stage of onboarding.
//
// One question per screen on purpose. A single long form is faster to build and
// measurably worse to finish on a phone — the numeric fields here each need a
// different keyboard, and stacking them means every mistake is a scroll away
// from the error that explains it.
//
// Nothing is submitted until the last step, so a user can move backwards freely
// and change an answer without a half-written profile existing server-side.
//
// EVERY numeric field holds a STRING, not a number. Storing them as numbers
// meant clearing a field ran Number('') === 0, which stamped a hard 0 into the
// input the moment you deleted the last digit. Parsing happens at the edges —
// on validate and on submit — and nowhere in between.

type Sex = OnboardingAnswers['sex']
type Level = OnboardingAnswers['fitnessLevel']
type Goal = OnboardingAnswers['goal']

const SEXES: { value: Sex; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
]

const LEVELS: { value: Level; label: string; blurb: string }[] = [
  { value: 'beginner',     label: 'Beginner',     blurb: 'New to training, or back after a long break' },
  { value: 'intermediate', label: 'Intermediate', blurb: 'Training consistently for a while' },
  { value: 'advanced',     label: 'Advanced',     blurb: 'Years of structured training behind you' },
]

const GOALS: { value: Goal; label: string; blurb: string }[] = [
  { value: 'hypertrophy', label: 'Build muscle', blurb: 'Size and volume first' },
  { value: 'strength',    label: 'Get stronger', blurb: 'Heavier lifts, lower reps' },
  { value: 'endurance',   label: 'Endurance',    blurb: 'Go longer, recover faster' },
  { value: 'weight_loss', label: 'Lose weight',  blurb: 'Higher output, tighter recovery' },
]

const TOTAL_STEPS = 5

export default function Onboarding() {
  const navigate = useNavigate()
  const { user, fetchMe } = useAuthStore()

  const imperial = user?.settings?.preferredUnit === 'imperial'

  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [sex, setSex] = useState<Sex | null>(null)

  const [birthParts, setBirthParts] = useState<DateParts>({ day: '', month: '', year: '' })

  // Metric fields
  const [cm, setCm] = useState('')
  const [kg, setKg] = useState('')
  // Imperial fields. Held separately rather than derived from cm/kg: deriving
  // them meant every keystroke round-tripped through a conversion, so typing
  // "5" then "10" inches made the feet box twitch as the value re-split.
  const [feet, setFeet] = useState('')
  const [inches, setInches] = useState('')
  const [lb, setLb] = useState('')

  const [level, setLevel] = useState<Level | null>(null)
  const [goal, setGoal] = useState<Goal | null>(null)
  const [daysPerWeek, setDaysPerWeek] = useState<number | null>(null)
  const [experienceYears, setExperienceYears] = useState('')

  const exampleYear = useMemo(() => new Date().getFullYear() - MIN_AGE - 12, [])

  const birth = useMemo(() => resolveBirthDate(birthParts), [birthParts])

  // Height and weight resolved to metric, whatever was typed.
  const measurements = useMemo(() => {
    if (imperial) {
      const f = num(feet), i = num(inches), l = num(lb)
      const heightOk = within(f, LIMITS.feet) && within(i, LIMITS.inches)
      const weightOk = within(l, LIMITS.lb)
      return {
        heightCm: heightOk ? feetInchesToCm(f!, i!) : null,
        weightKg: weightOk ? lbToKg(l!) : null,
      }
    }
    const c = num(cm), k = num(kg)
    return {
      heightCm: within(c, LIMITS.cm) ? c : null,
      weightKg: within(k, LIMITS.kg) ? k : null,
    }
  }, [imperial, cm, kg, feet, inches, lb])

  const canAdvance = (): boolean => {
    switch (step) {
      case 0: return true
      case 1: return sex !== null && birth.date !== null
      case 2: return measurements.heightCm !== null && measurements.weightKg !== null
      case 3: return level !== null
      case 4: return goal !== null
      default: return false
    }
  }

  const submit = async () => {
    setSaving(true)
    setError('')
    try {
      const years = num(experienceYears)
      await onboardingService.complete({
        sex: sex!,
        birthDate: birth.date!.toISOString(),
        heightCm: Math.round(measurements.heightCm! * 10) / 10,
        weightKg: Math.round(measurements.weightKg! * 10) / 10,
        fitnessLevel: level!,
        goal: goal!,
        ...(daysPerWeek != null ? { trainingDaysPerWeek: daysPerWeek } : {}),
        ...(years != null ? { experienceYears: years } : {}),
      })
      // Refresh the cached user so the route guard sees onboardingCompletedAt
      // and stops redirecting back here.
      await fetchMe()
      navigate('/', { replace: true })
    } catch (err: any) {
      setError(
        err?.response?.data?.error ||
        (err?.response
          ? 'Could not save your profile. Please try again.'
          : 'Could not reach the server. Check your connection and try again.')
      )
    } finally {
      setSaving(false)
    }
  }

  const next = () => (step === TOTAL_STEPS - 1 ? submit() : setStep(s => s + 1))
  const back = () => setStep(s => Math.max(0, s - 1))

  return (
    <div className="min-h-dvh bg-dark-900 flex flex-col px-6
                    pt-[calc(1.5rem+var(--safe-top))] pb-[calc(1.5rem+var(--safe-bottom))]">

      {/* Progress. The intro step is included so the bar is never empty. */}
      <div className="flex gap-1.5 mb-8">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <div key={i}
            className={`h-1 flex-1 rounded-full transition-colors
                        ${i <= step ? 'bg-brand-teal' : 'bg-dark-700'}`} />
        ))}
      </div>

      <div className="flex-1 flex flex-col">
        {step === 0 && <IntroStep name={user?.profile?.name} />}

        {step === 1 && (
          <Step title="About you"
                subtitle="Age and sex change how fast you recover and how we read your effort.">
            <div className="flex flex-col gap-2">
              {SEXES.map(o => (
                <Choice key={o.value} selected={sex === o.value}
                        onClick={() => setSex(o.value)} label={o.label} />
              ))}
            </div>

            <div className="mt-7">
              <BirthDateField value={birthParts} onChange={setBirthParts}
                              error={birth.error} />
              {!birth.error && (
                <p className="text-dark-400 text-xs mt-1.5">
                  Day, month, year — e.g. 04 09 {exampleYear}
                </p>
              )}
            </div>
          </Step>
        )}

        {step === 2 && (
          <Step title="Height and weight"
                subtitle="Bodyweight is the one we genuinely need — every pull-up, dip and push-up is scored against it.">
            {imperial ? (
              <>
                <label className="text-dark-300 text-sm mb-2 block">Height</label>
                <div className="flex gap-3 mb-6">
                  <NumberField value={feet} onChange={setFeet} unit="ft"
                               placeholder="5" limits={LIMITS.feet} />
                  <NumberField value={inches} onChange={setInches} unit="in"
                               placeholder="10" limits={LIMITS.inches} />
                </div>
                <label className="text-dark-300 text-sm mb-2 block">Weight</label>
                <NumberField value={lb} onChange={setLb} unit="lb"
                             placeholder="165" limits={LIMITS.lb} decimal />
              </>
            ) : (
              <>
                <label className="text-dark-300 text-sm mb-2 block">Height</label>
                <div className="mb-6">
                  <NumberField value={cm} onChange={setCm} unit="cm"
                               placeholder="175" limits={LIMITS.cm} />
                </div>
                <label className="text-dark-300 text-sm mb-2 block">Weight</label>
                <NumberField value={kg} onChange={setKg} unit="kg"
                             placeholder="75" limits={LIMITS.kg} decimal />
              </>
            )}
          </Step>
        )}

        {step === 3 && (
          <Step title="Your experience"
                subtitle="This sets how quickly we assume you bounce back between sessions.">
            <div className="flex flex-col gap-2">
              {LEVELS.map(o => (
                <Choice key={o.value} selected={level === o.value}
                        onClick={() => setLevel(o.value)} label={o.label} blurb={o.blurb} />
              ))}
            </div>

            <label className="text-dark-300 text-sm mt-7 mb-2 block">
              Days per week you train <span className="text-dark-400">(optional)</span>
            </label>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7].map(d => (
                <button key={d}
                  onClick={() => setDaysPerWeek(daysPerWeek === d ? null : d)}
                  className={`flex-1 py-3 rounded-btn font-semibold transition-colors
                              ${daysPerWeek === d
                                ? 'bg-brand-teal text-black'
                                : 'bg-dark-800 text-dark-300 border border-dark-600'}`}>
                  {d}
                </button>
              ))}
            </div>

            <label className="text-dark-300 text-sm mt-6 mb-2 block">
              Years training <span className="text-dark-400">(optional)</span>
            </label>
            <NumberField value={experienceYears} onChange={setExperienceYears}
                         unit="yrs" placeholder="2.5" limits={{ min: 0, max: 80 }} decimal />
          </Step>
        )}

        {step === 4 && (
          <Step title="What are you training for?"
                subtitle="Your plans and AI suggestions get built around this. You can change it any time.">
            <div className="flex flex-col gap-2">
              {GOALS.map(o => (
                <Choice key={o.value} selected={goal === o.value}
                        onClick={() => setGoal(o.value)} label={o.label} blurb={o.blurb} />
              ))}
            </div>
          </Step>
        )}
      </div>

      {error && <p className="text-brand-red text-sm mb-3">{error}</p>}

      <div className="flex gap-3 mt-8">
        {step > 0 && (
          <button onClick={back} disabled={saving}
            className="px-6 py-4 rounded-btn font-semibold text-dark-300
                       bg-dark-800 border border-dark-600 active:scale-95
                       transition-transform disabled:opacity-50">
            Back
          </button>
        )}
        <button onClick={next} disabled={!canAdvance() || saving}
          className="flex-1 bg-brand-teal text-black font-bold py-4 rounded-btn
                     active:scale-95 transition-transform disabled:opacity-40">
          {saving ? 'Saving…' : step === TOTAL_STEPS - 1 ? 'Finish' : 'Continue'}
        </button>
      </div>
    </div>
  )
}

//  Step scaffolding

function Step({ title, subtitle, children }: {
  title: string; subtitle?: string; children: React.ReactNode
}) {
  return (
    <div>
      <h1 className="text-3xl font-bold text-white">{title}</h1>
      {subtitle && <p className="text-dark-300 mt-2 mb-8 leading-relaxed">{subtitle}</p>}
      {children}
    </div>
  )
}

function Choice({ selected, onClick, label, blurb }: {
  selected: boolean; onClick: () => void; label: string; blurb?: string
}) {
  return (
    <button onClick={onClick}
      className={`w-full text-left px-4 py-4 rounded-btn border transition-colors
                  ${selected
                    ? 'bg-brand-teal/10 border-brand-teal'
                    : 'bg-dark-800 border-dark-600'}`}>
      <span className={`font-semibold ${selected ? 'text-brand-teal' : 'text-white'}`}>
        {label}
      </span>
      {blurb && <span className="block text-dark-300 text-sm mt-0.5">{blurb}</span>}
    </button>
  )
}

function IntroStep({ name }: { name?: string }) {
  return (
    <div className="flex-1 flex flex-col justify-center">
      <h1 className="text-4xl font-bold text-white leading-tight">
        {name ? `Welcome, ${name}.` : 'Welcome to SomaTrack.'}
      </h1>
      <p className="text-dark-300 mt-4 leading-relaxed">
        SomaTrack tracks how much load each muscle is carrying and how recovered
        you are — then builds sessions around what your body can actually take
        today.
      </p>
      <p className="text-dark-300 mt-4 leading-relaxed">
        To do that it needs a few things about you. It takes about a minute, and
        you can change any of it later.
      </p>

      <ul className="mt-8 flex flex-col gap-3">
        <IntroPoint icon="⚖️" text="Your bodyweight, so bodyweight exercises are scored against the right number" />
        <IntroPoint icon="🎂" text="Your age, which sets how fast we assume you recover" />
        <IntroPoint icon="🎯" text="What you're training for, so plans match the goal" />
      </ul>
    </div>
  )
}

function IntroPoint({ icon, text }: { icon: string; text: string }) {
  return (
    <li className="flex gap-3 items-start">
      <span className="text-xl leading-none mt-0.5">{icon}</span>
      <span className="text-dark-300 text-sm leading-relaxed">{text}</span>
    </li>
  )
}
