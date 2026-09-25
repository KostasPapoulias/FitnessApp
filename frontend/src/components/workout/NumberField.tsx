import { CSSProperties, useEffect, useRef, useState } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { nextLoad } from '../../pages/Workout/helpers'
import { useSessionPrefsStore } from '../../store/useSessionPrefsStore'
import {
  hapticSelectionEnd, hapticSelectionStart, hapticSelectionTick,
} from '../../lib/haptics'

/**
 * A set's weight, reps or RPE, three ways: the −/+ buttons around it (the
 * caller's), a tap to type it, and a long press to pick it.
 *
 * Typing exists because steppers do not scale: getting from a 20 kg estimate
 * to a real 100 kg working weight is thirty-two taps.
 *
 * The picker exists because typing needs two hands and a keyboard over the
 * screen. Hold the number and a column opens ON the field — the current value
 * sits exactly where the field is, higher values stacked above it, lower ones
 * below. The column does not move. The finger, still down, slides onto the
 * value it wants, and letting go writes it.
 *
 * It is anchored to the field rather than to the finger on purpose. A panel
 * that followed the finger was chasing the thing trying to read it, and it
 * floated free of the number being edited, so it never read as "this field,
 * opened up". Holding still is also what makes it a picker rather than a
 * gesture to learn: every value on offer is visible, and the one under the
 * fingertip is the one you get.
 *
 * Past the last row the column keeps counting — hold the finger beyond the
 * top or bottom and the values scroll on, one step per tick — so the range is
 * not limited to what fits on screen. 20 kg to 100 kg is one slide and a
 * short wait, not a page of rows.
 *
 * The overlay is `pointer-events: none`; the finger never actually touches it.
 * Every move keeps arriving at the element that was pressed, through pointer
 * capture, so the column can open under the finger without stealing the
 * gesture. Weight steps along the same plate grid as the −/+ buttons
 * (`nextLoad`), so no gesture can produce a weight the steppers could not.
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
  /** Text styling of the number. Sizing belongs here, not on a wrapper. */
  className?: string
  style?: CSSProperties
}

/** Long enough that a tap or the start of a scroll never trips it. */
const HOLD_MS = 380
/** Movement before the hold fires that means "scrolling", not "holding". */
const SLOP_PX = 8
/** Height of one value in the column — a comfortable thumb target. */
const ROW_PX = 40
/** Most rows either side of the field, when the screen has room for them. */
const MAX_ROWS = 5
/** Space the label and difference take above the top row. */
const HEADER_PX = 26
/** How often the column steps on while the finger is held past its end. */
const SCROLL_MS = 110
const EDGE_PX = 8

const BOUNDS: Record<NumberKind, { min: number; max: number }> = {
  // Physical rather than defensive, like the server's own schema scalars
  weight: { min: 0, max: 1000 },
  reps: { min: 1, max: 999 },
  rpe: { min: 1, max: 10 },
}

/** Where the column sits, fixed for as long as it is open. */
interface Geometry {
  /** Centre of the field, in viewport pixels. Row 0 is drawn on it. */
  cx: number
  cy: number
  width: number
  /** Rows that fit above and below the field without leaving the screen. */
  rowsAbove: number
  rowsBelow: number
}

interface PickerState {
  start: number
  /** How far the column has scrolled past its ends, in steps. */
  offset: number
  /** The visible row under the finger: 0 is the field, positive is above. */
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

  /**
   * Pull `k` back until it names a value the one before it did not — past a
   * bound every further step clamps to the same number, and those rows are
   * not shown, so the selection must not land on one.
   */
  const liveStep = (start: number, k: number) => {
    while (k !== 0 && stepFrom(start, k) === stepFrom(start, k - Math.sign(k))) {
      k -= Math.sign(k)
    }
    return k
  }

  const selectedValue = (s: Pick<PickerState, 'start' | 'offset' | 'row'>) =>
    stepFrom(s.start, liveStep(s.start, s.offset + s.row))

  // ── typing ──────────────────────────────────────────────────────────────
  // A string while focused, not a number: `Number('')` is 0, and a cleared
  // field would otherwise log a set at nothing. Empty or junk reverts.
  const [draft, setDraft] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const startTyping = () => {
    // flushSync so the input exists before this tap's handler returns — iOS
    // only raises the keyboard for a focus() inside the gesture itself.
    flushSync(() => setDraft(String(value)))
    inputRef.current?.focus()
    inputRef.current?.select()
  }

  const commitTyping = () => {
    if (draft === null) return
    const n = Number(draft.replace(',', '.').trim())
    if (draft.trim() !== '' && Number.isFinite(n)) {
      // Weight keeps what was typed — a 22 kg dumbbell is real even though
      // it is off the stepper grid. Reps and RPE are whole numbers.
      const clean = clamp(kind === 'weight' ? Math.round(n * 100) / 100 : Math.round(n))
      if (clean !== value) onChange(clean)
    }
    setDraft(null)
  }

  // ── picking ─────────────────────────────────────────────────────────────
  const [picker, setPicker] = useState<PickerState | null>(null)
  /**
   * The live gesture. A ref, not state: pointer events and the scroll timer
   * both read and write it between renders, and a stale closure over state
   * would drop a step or scroll one row too far.
   */
  const press = useRef<{
    id: number
    downX: number
    downY: number
    holdTimer: ReturnType<typeof setTimeout>
    scrollTimer: ReturnType<typeof setInterval> | null
    /** -1, 0 or 1: the finger is held past the bottom, inside, or past the top. */
    scrollDir: number
    open: boolean
    state: PickerState | null
    current: number
  } | null>(null)
  /** Set by a pick so the click that follows the release does not type. */
  const swallowClick = useRef(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const tick = () => {
    if (useSessionPrefsStore.getState().haptic) hapticSelectionTick()
  }

  /** Push the gesture's state to the screen, ticking if the value moved. */
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

  // Scrolling has to be refused by a NON-passive touchmove listener — React's
  // are passive, and `touch-action` is decided at touchstart, before anyone
  // knows whether this touch will be a hold. Refused only while picking, so a
  // scroll that starts on the number still scrolls the page.
  useEffect(() => {
    const el = buttonRef.current
    if (!el) return
    const block = (e: TouchEvent) => { if (press.current?.open) e.preventDefault() }
    el.addEventListener('touchmove', block, { passive: false })
    return () => el.removeEventListener('touchmove', block)
  }, [draft])

  // Unmounting mid-press (the set was logged by voice, the exercise changed)
  // must not leave timers that open or scroll a picker for a field that is gone.
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

    // Scrolls on while the finger is held past either end. Stops by itself at
    // a bound: an offset that no longer changes the value is not applied,
    // or holding past the top of RPE 10 would wind up rows to unwind.
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
    // A mouse drag would otherwise select text across the page while
    // picking. Mouse only: on touch this would do nothing useful.
    if (e.pointerType === 'mouse') e.preventDefault()
    // Reset here rather than in onClick: a touch pick whose moves were
    // refused often fires no click at all, and a flag left standing would
    // eat the next honest tap.
    swallowClick.current = false
    endPress(false)
    // Captured so every move and the release come back here, wherever the
    // finger goes — including over the column.
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
      // Moved before the hold landed: this is a scroll or a swipe. Let it go.
      if (Math.hypot(e.clientX - p.downX, e.clientY - p.downY) > SLOP_PX) endPress(false)
      return
    }

    // Which row is under the finger. Only vertical position counts — a thumb
    // drifts sideways as it slides, and that is not a choice.
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
        // iOS's decimal pad has no minus key, so a signed load needs the
        // full keyboard to be typeable at all.
        inputMode={kind === 'weight' ? (signed ? 'text' : 'decimal') : 'numeric'}
        enterKeyHint="done"
        onChange={e => setDraft(e.target.value)}
        onBlur={commitTyping}
        onKeyDown={e => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') setDraft(null)
        }}
        // Never under 16px: iOS zooms the whole page into a smaller input.
        className={`w-full min-w-0 bg-dark-900 rounded-md text-center outline-none
                    ring-1 ring-brand-teal tabular-nums ${className}`}
        style={{ ...style, fontSize: 'max(16px, 1em)' }}
      />
    )
  }

  // Everything the column draws, derived from the gesture's state
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
            // Past a bound every step clamps to the same number: show it once
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
        // A cancel is the system taking the touch (a notification, the OS
        // back gesture). The athlete did not choose the number showing.
        onPointerCancel={() => endPress(false)}
        // Android and desktop both raise a context menu on a long press
        onContextMenu={e => e.preventDefault()}
        className={`w-full min-w-0 text-center tabular-nums select-none
                    [-webkit-touch-callout:none] rounded-md
                    underline decoration-dotted decoration-dark-500 underline-offset-4
                    ${className}`}
        style={style}
      >
        {value}
      </button>

      {/* Portalled to <body>: a fixed overlay inside any transformed ancestor
          (a sheet mid-animation, an active:scale card) is positioned against
          that ancestor instead of the screen. z-[60] so it covers BottomNav —
          see CLAUDE.md. */}
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
  // Row 0's centre lands exactly on the field's centre; everything else is
  // measured from there. Horizontal is clamped to the screen, vertical never
  // needs to be — the row counts were chosen to fit.
  const top = cy - ROW_PX / 2 - rowsAbove * ROW_PX - HEADER_PX
  const left = Math.min(Math.max(cx - width / 2, EDGE_PX), vw - width - EDGE_PX)

  return (
    // A light dim and no blur: the set being edited has to stay readable
    // around the column.
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
                    // Where the value was before the hold, so it is always
                    // clear how to put it back.
                    ? 'text-white text-lg ring-1 ring-dark-400'
                    : 'text-dark-200 text-base'
                }`}
              >
                {r.value}
              </span>
            )}
            {/* The column carries on past its ends — say so where it does. */}
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
