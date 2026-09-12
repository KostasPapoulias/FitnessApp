import { useEffect, useRef } from 'react'
import { hapticCountdownTick } from '../lib/haptics'

// Scroll picker: middle row is selected. Native scroll + CSS snap, so momentum
// and feel come from the browser. The padding rows let the ends reach centre.

const ITEM_H = 40
/** Rows visible either side of the selected one. */
const WINGS = 2
const HEIGHT = ITEM_H * (WINGS * 2 + 1)

interface Props<T> {
  options: T[]
  value: T
  onChange: (value: T) => void
  /** How each option reads. The selected one is drawn larger and in brand. */
  label: (value: T) => string
  /** Second line under an option, e.g. what it means. Optional. */
  sub?: (value: T) => string | null
  ariaLabel: string
}

export default function PaceWheel<T extends string | number>({
  options, value, onChange, label, sub, ariaLabel,
}: Props<T>) {
  const scroller = useRef<HTMLDivElement | null>(null)
  const settle = useRef<number | null>(null)
  /** Last reported value — stops momentum re-reporting and re-buzzing. */
  const reported = useRef<T>(value)

  const index = Math.max(0, options.indexOf(value))

  // Follow the value when it changes from outside — the parent clamping it, or
  // a second wheel rewriting what this one is allowed to show. Skipped while
  // the user is mid-scroll, which is the one case where the DOM is ahead of
  // React and must be left alone.
  useEffect(() => {
    const element = scroller.current
    if (!element || reported.current === value) return
    reported.current = value
    element.scrollTo({ top: index * ITEM_H, behavior: 'smooth' })
  }, [value, index])

  // Position without animation on first paint: a wheel that visibly scrolls
  // itself into place on open reads as a glitch rather than as an animation.
  useEffect(() => {
    const element = scroller.current
    if (element) element.scrollTop = index * ITEM_H
    // Mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onScroll = () => {
    const element = scroller.current
    if (!element) return
    if (settle.current !== null) window.clearTimeout(settle.current)

    // 90ms after the last scroll event. Long enough that momentum has stopped,
    // short enough that the value under your thumb feels live.
    settle.current = window.setTimeout(() => {
      settle.current = null
      const next = options[Math.round(element.scrollTop / ITEM_H)]
      if (next === undefined || next === reported.current) return
      reported.current = next
      void hapticCountdownTick()
      onChange(next)
    }, 90)
  }

  useEffect(() => () => { if (settle.current !== null) window.clearTimeout(settle.current) }, [])

  return (
    <div className="relative" style={{ height: HEIGHT }} role="listbox" aria-label={ariaLabel}>
      {/* The selection band, behind the numbers and ignoring taps so it can
          never eat a scroll that was meant for the list. */}
      <div
        className="absolute left-0 right-0 rounded-btn border border-brand-teal/40 bg-brand-teal/5
                   pointer-events-none"
        style={{ top: ITEM_H * WINGS, height: ITEM_H }}
      />

      <div
        ref={scroller}
        onScroll={onScroll}
        className="h-full overflow-y-auto snap-y snap-mandatory no-scrollbar"
        style={{ scrollbarWidth: 'none' }}
      >
        <div style={{ height: ITEM_H * WINGS }} />
        {options.map(option => {
          const on = option === value
          const text = sub?.(option) ?? null
          return (
            <div
              key={String(option)}
              className="snap-center flex flex-col items-center justify-center"
              style={{ height: ITEM_H }}
              role="option"
              aria-selected={on}
            >
              <span
                className={`tabular-nums leading-none transition-colors ${
                  on ? 'text-brand-teal text-[19px] font-extrabold' : 'text-dark-300 text-[16px] font-bold'
                }`}
              >
                {label(option)}
              </span>
              {text && (
                <span className={`text-[10px] mt-0.5 ${on ? 'text-brand-teal/70' : 'text-dark-500'}`}>
                  {text}
                </span>
              )}
            </div>
          )
        })}
        <div style={{ height: ITEM_H * WINGS }} />
      </div>
    </div>
  )
}
