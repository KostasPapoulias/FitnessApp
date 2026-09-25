import { CSSProperties, useEffect, useRef, useState } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { nextLoad } from '../../pages/Workout/helpers'
import { useSessionPrefsStore } from '../../store/useSessionPrefsStore'
import {
  hapticSelectionEnd, hapticSelectionStart, hapticSelectionTick,
} from '../../lib/haptics'

/**
 * A set's weight, reps or RPE: tap to type, or long-press to open a picker.
 *
 * The picker is a column anchored on the field — current value on the field,
 * higher values above, lower below. It stays still; the finger slides onto a
 * value and releasing writes it. Holding past either end keeps scrolling
 * values. The overlay ignores pointer events; moves reach the field through
 * pointer capture. Weight steps on the `nextLoad` plate grid.
 */

export type NumberKind = 'weight' | 'reps' | 'rpe'

interface Props {
  value: number
  onChange: (value: number) => void
  kind: NumberKind
  /** Names the field for screen readers and titles the picker. */
  label: string
  /** Calisthenics load — negative is assistance, so it may go below zero. */
  signed?: boolean
  /** Text styling of the number (sizing too). */
  className?: string
  style?: CSSProperties
}

/** Long enough that a tap or scroll never triggers it. */
const HOLD_MS = 380
/** Movement before the hold fires that means scrolling. */
const SLOP_PX = 8
/** Row height in the column. */
const ROW_PX = 40
/** Most rows either side of the field. */
const MAX_ROWS = 5
/** Header space above the top row. */
const HEADER_PX = 26
/** Step interval while held past an end. */
const SCROLL_MS = 110
const EDGE_PX = 8

const BOUNDS: Record<NumberKind, { min: number; max: number }> = {
  // Physical bounds, like the server's schema scalars
  weight: { min: 0, max: 1000 },
  reps: { min: 1, max: 999 },
  rpe: { min: 1, max: 10 },
}

/** Where the column sits, fixed while open. */
interface Geometry {
  /** The field's centre, in viewport pixels; row 0 is drawn on it. */
  cx: number
  cy: number
  width: number
  /** Rows that fit above and below without leaving the screen. */
  rowsAbove: number
  rowsBelow: number
}

interface PickerState {
  start: number
  /** Steps scrolled past the column's ends. */
  offset: number
  /** The row under the finger: 0 is the field, positive is above. */
  row: number
  geometry: Geometry
}

export default function NumberField({
  value, onChange, kind, label, signed, className = '', style,
}: Props) {
  const min = kind === 'weight' && signed ? -200 : BOUNDS[kind].min
  const max = BOUNDS[kind].max
  const clamp = (n: number) => Math.min(max, Math.max(min, n))

  /** The value `steps` notches away from `from`, stopping at the bounds. */
  const stepFrom = (from: number, steps: number) => {
    let v = from
    const dir = steps > 0 ? 1 : -1
    for (let i = 0; i < Math.abs(steps); i++) {
      const next = clamp(kind === 'weight' ? nextLoad(v, dir) : v + dir)
      if (next === v) break
      v = next
    }
    return v
  }

  /** Pull `k` back past rows hidden at a bound (they repeat the bound's value). */
  const liveStep = (start: number, k: number) => {
    while (k !== 0 && stepFrom(start, k) === stepFrom(start, k - Math.sign(k))) {
      k -= Math.sign(k)
    }
    return k
  }

  const selectedValue = (s: Pick<PickerState, 'start' | 'offset' | 'row'>) =>
    stepFrom(s.start, liveStep(s.start, s.offset + s.row))

  // ── typing ──────────────────────────────────────────────────────────────
  // A string while editing (Number('') is 0); empty or junk reverts.
  const [draft, setDraft] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const startTyping = () => {
    // flushSync so the input exists within this tap — iOS only opens the keyboard then
    flushSync(() => setDraft(String(value)))
    inputRef.current?.focus()
    inputRef.current?.select()
  }

  const commitTyping = () => {
    if (draft === null) return
    const n = Number(draft.replace(',', '.').trim())
    if (draft.trim() !== '' && Number.isFinite(n)) {
      // Weight keeps what was typed (22 kg dumbbells exist); reps and RPE are whole numbers
      const clean = clamp(kind === 'weight' ? Math.round(n * 100) / 100 : Math.round(n))
      if (clean !== value) onChange(clean)
    }
    setDraft(null)
  }

  // ── picking ─────────────────────────────────────────────────────────────
  const [picker, setPicker] = useState<PickerState | null>(null)
  /** The live gesture, in a ref: pointer events and the scroll timer update it between renders. */
  const press = useRef<{
    id: number
    downX: number
    downY: number
    holdTimer: ReturnType<typeof setTimeout>
    scrollTimer: ReturnType<typeof setInterval> | null
    /** -1, 0 or 1: held below, inside or above the column. */
    scrollDir: number
    open: boolean
    state: PickerState | null
    current: number
  } | null>(null)
  /** Swallows the click that follows a pick. */
  const swallowClick = useRef(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const tick = () => {
    if (useSessionPrefsStore.getState().haptic) hapticSelectionTick()
  }

  /** Push gesture state to the screen, ticking when the value changes. */
  const publish = () => {
    const p = press.current
    if (!p?.state) return
    const next = selectedValue(p.state)
    if (next !== p.current) {
      p.current = next
      tick()
    }
    setPicker({ ...p.state })
  }

  const endPress = (commit: boolean) => {
    const p = press.current
    if (!p) return
    clearTimeout(p.holdTimer)
    if (p.scrollTimer) clearInterval(p.scrollTimer)
    press.current = null
    if (!p.open) return
    swallowClick.current = true
    setPicker(null)
    hapticSelectionEnd()
    if (commit && p.current !== value) onChange(p.current)
  }

  // Block scrolling with a non-passive touchmove listener, only while picking
  // (React's listeners are passive; touch-action is fixed at touchstart)
  useEffect(() => {
    const el = buttonRef.current
    if (!el) return
    const block = (e: TouchEvent) => { if (press.current?.open) e.preventDefault() }
    el.addEventListener('touchmove', block, { passive: false })
    return () => el.removeEventListener('touchmove', block)
  }, [draft])

  // Clear timers on unmount mid-press
  useEffect(() => () => {
    const p = press.current
    if (!p) return
    clearTimeout(p.holdTimer)
    if (p.scrollTimer) clearInterval(p.scrollTimer)
  }, [])

  const openPicker = () => {
    const p = press.current
    const el = buttonRef.current
    if (!p || !el) return

    const rect = el.getBoundingClientRect()
    const cy = rect.top + rect.height / 2
    const fit = (space: number) =>
      Math.max(0, Math.min(MAX_ROWS, Math.floor(space / ROW_PX)))
    const geometry: Geometry = {
      cx: rect.left + rect.width / 2,
      cy,
      width: Math.max(rect.width, 88),
      rowsAbove: fit(cy - ROW_PX / 2 - HEADER_PX - EDGE_PX),
      rowsBelow: fit(window.innerHeight - cy - ROW_PX / 2 - EDGE_PX),
    }

    p.open = true
    p.current = value
    p.state = { start: value, offset: 0, row: 0, geometry }
    setPicker({ ...p.state })

    // Scroll while held past an end; stops at a bound
    p.scrollTimer = setInterval(() => {
      const q = press.current
      if (!q?.state || q.scrollDir === 0) return
      const moved = { ...q.state, offset: q.state.offset + q.scrollDir }
      if (selectedValue(moved) === q.current) return
      q.state = moved
      publish()
    }, SCROLL_MS)

    if (useSessionPrefsStore.getState().haptic) {
      hapticSelectionStart()
      tick()
    }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    // Prevent text selection during a mouse drag
    if (e.pointerType === 'mouse') e.preventDefault()
    // Reset here: a touch pick often fires no click, which would leave the flag set
    swallowClick.current = false
    endPress(false)
    // Capture, so moves and release come back here wherever the finger goes
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* already gone */ }
    press.current = {
      id: e.pointerId,
      downX: e.clientX,
      downY: e.clientY,
      holdTimer: setTimeout(openPicker, HOLD_MS),
      scrollTimer: null,
      scrollDir: 0,
      open: false,
      state: null,
      current: value,
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const p = press.current
    if (!p || p.id !== e.pointerId) return
    if (!p.open || !p.state) {
      // Moved before the hold landed: a scroll, so let it go
      if (Math.hypot(e.clientX - p.downX, e.clientY - p.downY) > SLOP_PX) endPress(false)
      return
    }

    // The row under the finger (vertical position only)
    const { cy, rowsAbove, rowsBelow } = p.state.geometry
    const under = Math.round((cy - e.clientY) / ROW_PX)
    const row = Math.max(-rowsBelow, Math.min(rowsAbove, under))
    p.scrollDir = under > rowsAbove ? 1 : under < -rowsBelow ? -1 : 0
    if (row !== p.state.row) {
      p.state = { ...p.state, row }
      publish()
    }
  }

  const onClick = () => {
    if (swallowClick.current) { swallowClick.current = false; return }
    startTyping()
  }

  if (draft !== null) {
    return (
      <input
        ref={inputRef}
        value={draft}
        aria-label={label}
        // Signed loads need the full keyboard (iOS decimal pad has no minus)
        inputMode={kind === 'weight' ? (signed ? 'text' : 'decimal') : 'numeric'}
        enterKeyHint="done"
        onChange={e => setDraft(e.target.value)}
        onBlur={commitTyping}
        onKeyDown={e => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') setDraft(null)
        }}
        // Never under 16px: iOS zooms smaller inputs
        className={`w-full min-w-0 bg-dark-900 rounded-md text-center outline-none
                    ring-1 ring-brand-teal tabular-nums ${className}`}
        style={{ ...style, fontSize: 'max(16px, 1em)' }}
      />
    )
  }

  // The column's rows, derived from the gesture state
  const rows = picker
    ? (() => {
        const { start, offset, geometry } = picker
        const selectedK = liveStep(start, offset + picker.row)
        const out: { key: number; value: number; hidden: boolean; selected: boolean; start: boolean }[] = []
        for (let r = geometry.rowsAbove; r >= -geometry.rowsBelow; r--) {
          const k = offset + r
          const v = stepFrom(start, k)
          out.push({
            key: r,
            value: v,
            // Hidden past a bound, where steps repeat the same value
            hidden: k !== 0 && v === stepFrom(start, k - Math.sign(k)),
            selected: k === selectedK,
            start: k === 0,
          })
        }
        return out
      })()
    : null

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`${label}: ${value}. Tap to type, hold and slide to pick.`}
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => endPress(true)}
        // A cancel is the system taking the touch — keep the old value
        onPointerCancel={() => endPress(false)}
        // Suppress the long-press context menu
        onContextMenu={e => e.preventDefault()}
        className={`w-full min-w-0 text-center tabular-nums select-none
                    [-webkit-touch-callout:none] rounded-md
                    underline decoration-dotted decoration-dark-500 underline-offset-4
                    ${className}`}
        style={style}
      >
        {value}
      </button>

      {/* Portalled to <body> (transformed ancestors would misplace a fixed overlay); z-[60] covers BottomNav */}
      {picker && rows && createPortal(
        <PickerColumn
          label={label}
          geometry={picker.geometry}
          rows={rows}
          delta={Math.round((selectedValue(picker) - picker.start) * 100) / 100}
          canScrollUp={stepFrom(picker.start, picker.offset + picker.geometry.rowsAbove + 1)
            !== stepFrom(picker.start, picker.offset + picker.geometry.rowsAbove)}
          canScrollDown={stepFrom(picker.start, picker.offset - picker.geometry.rowsBelow - 1)
            !== stepFrom(picker.start, picker.offset - picker.geometry.rowsBelow)}
        />,
        document.body,
      )}
    </>
  )
}

function PickerColumn({ label, geometry, rows, delta, canScrollUp, canScrollDown }: {
  label: string
  geometry: Geometry
  rows: { key: number; value: number; hidden: boolean; selected: boolean; start: boolean }[]
  delta: number
  canScrollUp: boolean
  canScrollDown: boolean
}) {
  const { cx, cy, width, rowsAbove } = geometry
  const vw = window.innerWidth
  // Row 0 is centred on the field; horizontal position is clamped to the screen
  const top = cy - ROW_PX / 2 - rowsAbove * ROW_PX - HEADER_PX
  const left = Math.min(Math.max(cx - width / 2, EDGE_PX), vw - width - EDGE_PX)

  return (
    // Light dim, no blur
    <div aria-hidden="true" className="fixed inset-0 z-[60] pointer-events-none bg-black/20">
      <div
        className="absolute rounded-card bg-dark-900/85 border border-dark-600 shadow-lg overflow-hidden"
        style={{ left, top, width }}
      >
        <div className="flex items-center justify-between gap-1 px-2" style={{ height: HEADER_PX }}>
          <span className="text-[9.5px] tracking-widest text-dark-300 uppercase truncate">
            {label}
          </span>
          <span className="text-[10.5px] font-bold text-brand-teal tabular-nums flex-shrink-0">
            {delta === 0 ? '' : `${delta > 0 ? '+' : ''}${delta}`}
          </span>
        </div>

        {rows.map((r, i) => (
          <div key={r.key}
            className="relative flex items-center justify-center tabular-nums"
            style={{ height: ROW_PX }}>
            {!r.hidden && (
              <span
                className={`px-3 rounded-btn leading-[34px] font-extrabold transition-colors ${
                  r.selected
                    ? 'bg-brand-teal text-black text-[22px]'
                    : r.start
                    // The starting value keeps an outline
                    ? 'text-white text-lg ring-1 ring-dark-400'
                    : 'text-dark-200 text-base'
                }`}
              >
                {r.value}
              </span>
            )}
            {/* Arrows where the column can scroll further */}
            {i === 0 && canScrollUp && (
              <span className="absolute right-1.5 text-dark-400 text-[10px]">▲</span>
            )}
            {i === rows.length - 1 && canScrollDown && (
              <span className="absolute right-1.5 text-dark-400 text-[10px]">▼</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
