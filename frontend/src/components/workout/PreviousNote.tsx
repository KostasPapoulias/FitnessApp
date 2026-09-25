import { useEffect, useState } from 'react'
import { progressService } from '../../services/progress.service'
import { NoteIcon } from '../icons'

/**
 * The last note written on this exercise (from any finished session), shown
 * on the live screen before today's. Silent if the read fails.
 */

const fmtWhen = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days <= 0) return 'Earlier today'
  if (days === 1) return 'Yesterday'
  if (days < 14) return `${days} days ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function PreviousNote({ exerciseId }: { exerciseId: string }) {
  const [note, setNote] = useState<{ text: string; dateTime: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    progressService.getExerciseHistory(exerciseId, 1)
      .then(history => { if (!cancelled) setNote(history.lastNote) })
      .catch(() => { /* see the note above */ })
    return () => { cancelled = true }
  }, [exerciseId])

  if (!note) return null

  return (
    <div className="mt-3 flex items-start gap-2 px-3 py-2.5 rounded-btn
                    bg-dark-800 border border-dark-600">
      <NoteIcon className="w-4 h-4 text-brand-teal flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-dark-400 text-[11px] leading-4">Your note · {fmtWhen(note.dateTime)}</p>
        <p className="text-dark-200 text-[13px] leading-5 mt-0.5 whitespace-pre-wrap break-words">
          {note.text}
        </p>
      </div>
    </div>
  )
}
