import { useEffect, useRef, useState } from 'react'

/**
 * The athlete's own note against one exercise, during the live workout.
 *
 * Collapsed to a single line until it is wanted. The live screen is the one
 * place in the app where the athlete is mid-set and looking at a phone on a
 * bench, so a permanently open textarea would push the current-set card — the
 * only thing that screen exists for — down the page for a feature most sets
 * never use.
 *
 * Saves on blur rather than behind a Save button. A note is worth nothing
 * unsaved, and the reliable moment someone stops typing on a phone is when the
 * field loses focus; a button is one more tap to forget between sets.
 *
 * `saving` / `failed` are shown rather than swallowed, because the store keeps
 * the text locally whatever the network does — without a marker, a note that
 * never reached the server looks exactly like one that did.
 */

interface Props {
  /** What is stored for this exercise right now. */
  value: string
  /** Resolves false if the write failed; the text is kept locally regardless. */
  onSave: (notes: string) => Promise<boolean>
}

export default function ExerciseNotes({ value, onSave }: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const [status, setStatus] = useState<'idle' | 'saving' | 'failed'>('idle')
  const areaRef = useRef<HTMLTextAreaElement>(null)

  // Follow the store while the field is closed. Not while it is open: the
  // athlete is typing, and overwriting their draft with a value that arrived
  // from somewhere else is the bug this guard exists for.
  useEffect(() => {
    if (!open) setDraft(value)
  }, [value, open])

  const openEditor = () => {
    setOpen(true)
    // Focus after the textarea exists. Without the frame delay this runs
    // against the collapsed markup and does nothing.
    requestAnimationFrame(() => {
      const el = areaRef.current
      if (!el) return
      el.focus()
      // Caret at the end, not at the start — this is almost always an edit of
      // an existing note rather than a rewrite of it.
      el.setSelectionRange(el.value.length, el.value.length)
    })
  }

  const commit = async () => {
    setOpen(false)
    const next = draft.trim()
    if (next === value.trim()) {
      setStatus('idle')
      return
    }
    setStatus('saving')
    setStatus(await onSave(next) ? 'idle' : 'failed')
  }

  if (!open) {
    const has = value.trim().length > 0
    return (
      <button
        onClick={openEditor}
        className="mt-3 w-full flex items-start gap-2 text-left px-3 py-2.5 rounded-btn
                   border border-dashed border-dark-600 active:scale-[0.99] transition-transform"
      >
        <span className="text-dark-400 text-[13px] leading-5 flex-shrink-0">🗒</span>
        <span className={`flex-1 min-w-0 text-[13px] leading-5 ${has ? 'text-dark-200' : 'text-dark-400'}`}>
          {has ? value : 'Add a note'}
        </span>
        {status === 'saving' && (
          <span className="text-dark-400 text-[11px] flex-shrink-0 leading-5">Saving…</span>
        )}
        {status === 'failed' && (
          // Deliberately not an error colour on the note itself: nothing was
          // lost, it is still on the phone and will be sent with the next edit.
          <span className="text-brand-yellow text-[11px] flex-shrink-0 leading-5">Not synced</span>
        )}
      </button>
    )
  }

  return (
    <div className="mt-3 rounded-btn border border-dark-600 bg-dark-800 overflow-hidden">
      <textarea
        ref={areaRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        rows={3}
        // Matches the server's `notes` scalar. Enforced here too so the limit
        // is something the field simply stops at, rather than a 400 after the
        // athlete has already written the paragraph.
        maxLength={2000}
        placeholder="Felt heavy, dropped to 60 on the last set…"
        className="w-full bg-transparent text-white text-[13px] leading-5 p-3
                   placeholder-dark-400 outline-none resize-none"
      />
      <div className="flex justify-end px-3 pb-2.5">
        {/* onMouseDown, not onClick: the textarea's blur fires first and would
            commit and unmount this button before a click ever landed. */}
        <button
          onMouseDown={e => e.preventDefault()}
          onClick={commit}
          className="text-brand-teal text-[12.5px] font-bold px-2 py-1"
        >
          Done
        </button>
      </div>
    </div>
  )
}
