import { useEffect, useState } from 'react'
import { progressService } from '../../services/progress.service'
import { NoteIcon } from '../icons'

/**
 * The last note the athlete wrote against this exercise, shown on the live
 * screen before they write today's.
 *
 * This is the moment a note pays off. "Left shoulder pinched at the bottom,
 * go narrower" is written once and is worth nothing unless it is in front of
 * the athlete the next time the bar is in their hands — and until now it was
 * only readable by going to look for it in the calendar.
 *
 * Reads `lastNote` rather than the newest entry's note: most sessions have no
 * note, so the last session's is usually empty while the one that matters sits
 * a few sessions back. The session in progress is never the source — the
 * server only counts finished sessions.
 *
 * Silent when the read fails. It is a reminder, not a record: an offline gym
 * should cost the athlete this line, not put an error above the set card.
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
