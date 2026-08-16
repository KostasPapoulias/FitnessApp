import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { aiService } from '../../services/ai.service'
import { useWorkoutStore } from '../../store/useWorkoutStore'
import { AiProposal } from '../../types'

/**
 * A workout the coach has drafted, waiting on the athlete.
 *
 * Nothing exists server-side until Add is tapped. The card is deliberately
 * explicit about that — it lists the actual exercises and the date rather than
 * summarising, because this is the only point at which a mistake in the plan is
 * cheap to catch. Once it becomes a session it is training history, and every
 * fatigue and load number downstream is computed from it.
 */

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })

interface Props {
  proposal: AiProposal
  /** Lets the chat drop the card once it has been dealt with. */
  onResolved: (id: string) => void
}

export default function ProposalCard({ proposal, onResolved }: Props) {
  const navigate = useNavigate()
  const loadTemplate = useWorkoutStore(s => s.loadTemplate)

  // A drafted exercise and a drafted plan are the same card with different
  // nouns: what it is called, what accepting it means, and where "open" goes.
  const isExercise = proposal.kind === 'create_exercise'

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [accepted, setAccepted] = useState<{ id: string } | null>(null)

  const accept = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await aiService.acceptProposal(proposal.id)
      // The two kinds return different objects — a template for a plan, an
      // exercise for a movement. Reading `result.template.id` for both left the
      // accepted state holding undefined, and "open" then went nowhere.
      setAccepted({
        id: result.kind === 'create_exercise' ? result.exercise.id : result.template.id,
      })
    } catch (err: any) {
      // 409 means expired or already used — the server phrases those for a
      // human, so show its reason rather than a generic failure.
      setError(err?.response?.data?.error ?? 'Could not add that. Try asking again.')
    } finally {
      setBusy(false)
    }
  }

  const dismiss = async () => {
    setBusy(true)
    try {
      await aiService.rejectProposal(proposal.id)
      onResolved(proposal.id)
    } catch {
      // A card that could not be dismissed is a nuisance, not a failure worth
      // reporting — it will expire on its own within the half hour.
      onResolved(proposal.id)
    }
  }

  const openAccepted = async () => {
    if (!accepted) return

    if (isExercise) {
      navigate('/exercise-detail', { state: { exerciseId: accepted.id } })
      return
    }

    setBusy(true)
    try {
      const { templateService } = await import('../../services/template.service')
      const template = await templateService.get(accepted.id)
      loadTemplate(template)
      navigate('/workout/plan')
    } catch {
      setError('Saved, but the planner could not be opened. It is in your plans.')
      setBusy(false)
    }
  }

  return (
    <div className="ml-11 mt-2 rounded-2xl border border-brand-teal/40 bg-[#0a2a22] overflow-hidden">
      <div className="px-4 pt-3 pb-2 flex items-start gap-2">
        <span className="text-base leading-none mt-0.5">{isExercise ? '✏️' : '🏋️'}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] tracking-wider text-brand-teal font-bold">
            {isExercise
              ? (accepted ? 'ADDED TO YOUR EXERCISES' : 'NEW EXERCISE · NOT SAVED YET')
              : (accepted ? 'ADDED TO YOUR PLANS' : 'SUGGESTED PLAN · NOT SAVED YET')}
          </p>
          <p className="text-white text-sm font-bold mt-0.5 truncate">{proposal.title}</p>
        </div>
      </div>

      {proposal.lines.length > 0 && (
        <ul className="px-4 pb-2 flex flex-col gap-1">
          {proposal.lines.map((line, i) => (
            <li key={i} className="text-dark-200 text-[12.5px] leading-snug">• {line}</li>
          ))}
        </ul>
      )}

      {proposal.scheduledFor && (
        <div className="px-4 pb-2 text-[12px] text-dark-300">
          📅 {fmtWhen(proposal.scheduledFor)}
          {proposal.reminderAt && ` · reminder ${fmtWhen(proposal.reminderAt)}`}
        </div>
      )}

      {error && (
        <div className="px-4 pb-2 text-[12px] text-brand-red font-semibold">{error}</div>
      )}

      <div className="flex gap-2 px-3 pb-3 pt-1">
        {accepted ? (
          <>
            <button
              onClick={openAccepted}
              disabled={busy}
              className="flex-1 py-2.5 rounded-btn bg-brand-teal text-black text-[13px] font-extrabold
                         active:scale-95 transition-transform disabled:opacity-40"
            >
              {isExercise ? 'View exercise →' : 'Open in planner →'}
            </button>
            <button
              onClick={() => onResolved(proposal.id)}
              className="px-4 py-2.5 rounded-btn border border-dark-600 bg-dark-800
                         text-white text-[13px] font-bold active:scale-95 transition-transform"
            >
              Later
            </button>
          </>
        ) : (
          <>
            <button
              onClick={accept}
              disabled={busy}
              className="flex-1 py-2.5 rounded-btn bg-brand-teal text-black text-[13px] font-extrabold
                         active:scale-95 transition-transform disabled:opacity-40"
            >
              {busy ? 'Adding…'
                : isExercise ? 'Add exercise'
                : proposal.scheduledFor ? 'Add & schedule'
                : 'Add to my plans'}
            </button>
            <button
              onClick={dismiss}
              disabled={busy}
              className="px-4 py-2.5 rounded-btn border border-dark-600 bg-dark-800
                         text-white text-[13px] font-bold active:scale-95 transition-transform
                         disabled:opacity-40"
            >
              No thanks
            </button>
          </>
        )}
      </div>
    </div>
  )
}
