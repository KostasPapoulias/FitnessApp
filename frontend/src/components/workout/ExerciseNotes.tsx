import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { NoteIcon } from '../icons'
import { useT } from '../../i18n'

/**
 * The athlete's note on one exercise — on the live screen, and in the
 * calendar's sets sheet afterwards. Collapsed to one line until opened; saves
 * on blur; shows "Saving…" / "Not synced" since the store keeps the text
 * regardless of the network.
 */

interface Props {
  /** The stored note. */
  value: string
  /** Resolves false if the write failed; the text is kept locally regardless. */
  onSave: (notes: string) => Promise<boolean>
}

/** Lets the live screen's Note button open this field. */
export interface ExerciseNotesHandle {
  open: () => void
}

const ExerciseNotes = forwardRef<ExerciseNotesHandle, Props>(function ExerciseNotes(
  { value, onSave }, ref
) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const [status, setStatus] = useState<'idle' | 'saving' | 'failed'>('idle')
  const areaRef = useRef<HTMLTextAreaElement>(null)

  // Follow the store only while closed, so an incoming value never overwrites typing
  useEffect(() => {
    if (!open) setDraft(value)
  }, [value, open])

  const openEditor = () => {
    // flushSync so the textarea exists before this tap handler returns — iOS
    // only raises the keyboard for a focus() inside the tap
    flushSync(() => setOpen(true))

    const el = areaRef.current
    if (!el) return
    el.focus()
    // Caret at the end (usually an edit)
    el.setSelectionRange(el.value.length, el.value.length)
    // The opening button can be a screen away
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  useImperativeHandle(ref, () => ({ open: openEditor }))

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
        <NoteIcon className="w-4 h-4 text-dark-400 flex-shrink-0 mt-0.5" />
        {/*
          break-words as well as min-w-0: a long note with no spaces in it — a
          pasted URL, say — has nowhere to wrap, so it ran out past the border
          instead of breaking. min-w-0 alone only lets the flex child shrink.
        */}
        <span className={`flex-1 min-w-0 text-[13px] leading-5 whitespace-pre-wrap break-words
                          ${has ? 'text-dark-200' : 'text-dark-400'}`}>
          {has ? value : t('note.add')}
        </span>
        {status === 'saving' && (
          <span className="text-dark-400 text-[11px] flex-shrink-0 leading-5">{t('common.saving')}</span>
        )}
        {status === 'failed' && (
          // Not an error colour: the text is kept and sent with the next edit
          <span className="text-brand-yellow text-[11px] flex-shrink-0 leading-5">{t('note.notSynced')}</span>
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
        // Matches the server's `notes` limit
        maxLength={2000}
        placeholder={t('note.placeholder')}
        className="w-full bg-transparent text-white text-[13px] leading-5 p-3
                   placeholder-dark-400 outline-none resize-none"
      />
      <div className="flex justify-end px-3 pb-2.5">
        {/* onMouseDown: the textarea's blur would unmount this before a click lands */}
        <button
          onMouseDown={e => e.preventDefault()}
          onClick={commit}
          className="text-brand-teal text-[12.5px] font-bold px-2 py-1"
        >
          {t('common.done')}
        </button>
      </div>
    </div>
  )
})

export default ExerciseNotes
