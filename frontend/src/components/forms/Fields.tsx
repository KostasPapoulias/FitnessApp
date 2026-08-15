import React from 'react'

// Shared form primitives for anywhere the user types a measurement.
//
// Extracted from Onboarding so the Edit Profile modal cannot drift from it:
// the two screens write the SAME columns, and having one of them accept a
// birth date while the other accepted a plain age is exactly how a profile
// ends up disagreeing with itself.
//
// Every field here holds a STRING. Storing numbers meant clearing a field ran
// Number('') === 0, which stamped a hard 0 into the input the moment the last
// digit was deleted. Parsing happens at the edges — validate and submit — and
// nowhere in between.

export const num = (raw: string): number | null => {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

export const within = (v: number | null, { min, max }: { min: number; max: number }) =>
  v !== null && v >= min && v <= max

export const MIN_AGE = 13
export const MAX_AGE = 100

// Bounds in the unit the field is displayed in, so the hint under a field
// matches what is being typed rather than a converted equivalent.
export const LIMITS = {
  cm:     { min: 100, max: 260 },
  kg:     { min: 25,  max: 400 },
  lb:     { min: 55,  max: 880 },
  feet:   { min: 3,   max: 8 },
  inches: { min: 0,   max: 11 },
  years:  { min: 0,   max: 80 },
}

// Native number spinners are unusable at thumb size and steal horizontal room
// from the value, so they are suppressed in one place here.
export const INPUT_BASE =
  'w-full bg-dark-700 border rounded-btn px-4 py-3 text-white ' +
  'placeholder-dark-500 focus:outline-none transition-colors ' +
  '[appearance:textfield] ' +
  '[&::-webkit-outer-spin-button]:appearance-none ' +
  '[&::-webkit-inner-spin-button]:appearance-none'

export function NumberField({
  value, onChange, unit, placeholder, limits, decimal = false, label,
}: {
  value: string
  onChange: (v: string) => void
  unit?: string
  placeholder: string
  limits: { min: number; max: number }
  decimal?: boolean
  label?: string
}) {
  const parsed = num(value)
  // Only complain about a value the user has finished typing. Flagging "1" as
  // out of range while they are on their way to "175" is noise.
  const invalid = parsed !== null && !within(parsed, limits)

  return (
    <div className="flex-1 min-w-0">
      {label && <label className="text-dark-300 text-xs mb-1.5 block">{label}</label>}
      <div className="relative">
        <input
          type="text"
          inputMode={decimal ? 'decimal' : 'numeric'}
          value={value}
          placeholder={placeholder}
          onChange={e => {
            // Digits, and one separator when decimals are allowed. Filtering on
            // input rather than validating after keeps a stray letter from ever
            // reaching state — type="number" silently blanks the whole field
            // instead, losing what was already typed.
            const cleaned = decimal
              ? e.target.value.replace(/[^\d.,]/g, '').replace(',', '.')
              : e.target.value.replace(/\D/g, '')
            onChange(cleaned)
          }}
          className={`${INPUT_BASE} ${unit ? 'pr-12' : ''} ${
            invalid ? 'border-brand-red' : 'border-dark-600 focus:border-brand-teal'
          }`}
        />
        {unit && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-dark-400 text-sm">
            {unit}
          </span>
        )}
      </div>
      {invalid && (
        <p className="text-brand-red text-xs mt-1.5">
          Must be between {limits.min} and {limits.max}{unit ? ` ${unit}` : ''}
        </p>
      )}
    </div>
  )
}

function DatePart({
  value, onChange, placeholder, maxLength, flex, inputRef, onFilled,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  maxLength: number
  flex: string
  inputRef?: React.RefObject<HTMLInputElement>
  onFilled?: () => void
}) {
  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      onChange={e => {
        const digits = e.target.value.replace(/\D/g, '').slice(0, maxLength)
        onChange(digits)
        // Hop to the next box once this one is full, so the whole date can be
        // typed without reaching for the screen between parts.
        if (digits.length === maxLength) onFilled?.()
      }}
      className={`${flex} ${INPUT_BASE} text-center tracking-widest
                  border-dark-600 focus:border-brand-teal`}
    />
  )
}

export interface DateParts { day: string; month: string; year: string }

/**
 * Resolves three text fields into a real date, or explains why they aren't one.
 *
 * Deliberately not <input type="date">: that renders in whatever order the
 * browser locale dictates — mm/dd/yyyy on a US-locale Chrome regardless of
 * where the user is — and its calendar opens on the current month, which is a
 * miserable way to reach a birth year thirty years back.
 */
export const resolveBirthDate = ({ day, month, year }: DateParts): {
  date: Date | null; error: string
} => {
  const d = num(day), m = num(month), y = num(year)
  if (d === null || m === null || y === null) return { date: null, error: '' }
  if (m < 1 || m > 12) return { date: null, error: 'Month must be between 1 and 12' }
  if (d < 1 || d > 31) return { date: null, error: 'Day must be between 1 and 31' }
  if (year.length < 4) return { date: null, error: '' }

  const date = new Date(y, m - 1, d)
  // Rejects 31 February and friends: the Date constructor rolls those over
  // into the next month rather than failing, so the only way to catch one is
  // to check the parts survived the trip.
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return { date: null, error: 'That date does not exist' }
  }

  const age = (Date.now() - date.getTime()) / (365.2425 * 24 * 60 * 60 * 1000)
  if (age < MIN_AGE) return { date: null, error: `You need to be at least ${MIN_AGE} to use SomaTrack` }
  if (age > MAX_AGE) return { date: null, error: 'Please check the year' }

  return { date, error: '' }
}

/** Splits a stored ISO date back into the three edit fields. */
export const toDateParts = (iso: string | null | undefined): DateParts => {
  if (!iso) return { day: '', month: '', year: '' }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { day: '', month: '', year: '' }
  return {
    day: String(d.getDate()).padStart(2, '0'),
    month: String(d.getMonth() + 1).padStart(2, '0'),
    year: String(d.getFullYear()),
  }
}

export function BirthDateField({ value, onChange, error }: {
  value: DateParts
  onChange: (v: DateParts) => void
  error?: string
}) {
  const monthRef = React.useRef<HTMLInputElement>(null)
  const yearRef = React.useRef<HTMLInputElement>(null)

  return (
    <div>
      <label className="text-dark-300 text-xs mb-1.5 block">Date of birth</label>
      <div className="flex gap-2.5">
        <DatePart value={value.day} placeholder="DD" maxLength={2} flex="flex-1"
                  onChange={day => onChange({ ...value, day })}
                  onFilled={() => monthRef.current?.focus()} />
        <DatePart value={value.month} placeholder="MM" maxLength={2} flex="flex-1"
                  inputRef={monthRef}
                  onChange={month => onChange({ ...value, month })}
                  onFilled={() => yearRef.current?.focus()} />
        <DatePart value={value.year} placeholder="YYYY" maxLength={4} flex="flex-[1.4]"
                  inputRef={yearRef}
                  onChange={year => onChange({ ...value, year })} />
      </div>
      {error && <p className="text-brand-red text-xs mt-1.5">{error}</p>}
    </div>
  )
}

/** Shared selectable chip, so the two screens style choices identically. */
export function ChipRow<T extends string>({ options, value, onChange, layout = 'row' }: {
  options: { value: T; label: string }[]
  value: T | null
  onChange: (v: T) => void
  layout?: 'row' | 'grid2'
}) {
  // Spelled out rather than interpolated: Tailwind scans source text for class
  // names, so a template like `grid-cols-${n}` is never emitted and the grid
  // silently collapses to one column.
  const container = layout === 'grid2' ? 'grid grid-cols-2 gap-2' : 'flex gap-2'

  return (
    <div className={container}>
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={`py-2.5 px-3 rounded-btn text-xs font-medium border transition-colors
                      ${layout === 'row' ? 'flex-1' : ''}
                      ${value === o.value
                        ? 'bg-brand-teal text-black border-brand-teal'
                        : 'bg-dark-700 text-dark-300 border-dark-600'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
