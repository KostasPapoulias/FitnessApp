import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { aiService } from '../../services/ai.service'
import { useWorkoutStore } from '../../store/useWorkoutStore'
import { AiProposal } from '../../types'
import { useT } from '../../i18n'
import { CalendarIcon, DumbbellIcon, PencilIcon } from '../icons'

/**
 * A workout the coach has drafted, waiting on the athlete.
 *
 * Nothing exists server-side until Add is tapped. The card is deliberately
 * explicit about that — it lists the actual exercises and the date rather than
 * summarising, because this is the only point at which a mistake in the plan is
 * cheap to catch. Once it becomes a session it is training history, and every
 * fatigue and load number downstream is computed from it.
 */

const fmtWhen = (iso: string, intl: string) =>
  new Date(iso).toLocaleString(intl, {
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
  const { t, intl } = useT()

  // A drafted exercise and a drafted plan are the same card with different
  // nouns: what it is called, what accepting it means, and where "open" goes.
  const isExercise = proposal.kind === 'create_exercise'

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [accepted, setAccepted] = useState<{ id: string } | null>(null)

  // Reopened from history rather than just drafted. `applied` has no id to
  // open: the proposal row records that it was applied, not what it created,
  // so the card points at the plans list instead of one plan.
  const wasApplied = proposal.status === 'applied'
  const hasExpired = proposal.status === 'expired'
  const resolved = wasApplied || hasExpired || accepted !== null

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
      setError(err?.response?.data?.error ?? t('proposal.failed'))
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
      setError(t('proposal.savedNoOpen'))
      setBusy(false)
    }
  }

  return (
    <div className="ml-11 mt-2 rounded-2xl border border-brand-teal/40 bg-[#0a2a22] overflow-hidden">
      <div className="px-4 pt-3 pb-2 flex items-start gap-2">
        <span className="mt-0.5 text-brand-teal">
          {isExercise ? <PencilIcon className="w-4 h-4" /> : <DumbbellIcon className="w-4 h-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] tracking-wider text-brand-teal font-bold">
            {hasExpired
              ? t('proposal.expired')
              : isExercise
                ? (resolved ? t('proposal.addedExercise') : t('proposal.newExercise'))
                : (resolved ? t('proposal.addedPlan') : t('proposal.newPlan'))}
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
          <CalendarIcon className="w-3.5 h-3.5 inline-block align-[-2px] mr-1" />
          {fmtWhen(proposal.scheduledFor, intl)}
          {proposal.reminderAt &&
            ` · ${t('proposal.reminder', { when: fmtWhen(proposal.reminderAt, intl) })}`}
        </div>
      )}

      {error && (
        <div className="px-4 pb-2 text-[12px] text-brand-red font-semibold">{error}</div>
      )}

      {/* An expired draft keeps its contents and loses its buttons: what was
          suggested is still worth reading, and applying it is not — it was
          reasoned about a body state that has moved on. */}
      {hasExpired && (
        <p className="px-4 pb-3 text-[12px] text-dark-400">{t('proposal.expiredNote')}</p>
      )}

      {!hasExpired && (
      <div className="flex gap-2 px-3 pb-3 pt-1">
        {wasApplied ? (
          <button
            onClick={() => navigate(isExercise ? '/workout/exercises' : '/plans')}
            className="flex-1 py-2.5 rounded-btn border border-dark-600 bg-dark-800
                       text-white text-[13px] font-bold active:scale-95 transition-transform"
          >
            {isExercise ? t('proposal.viewExercise') : t('proposal.inYourPlans')}
          </button>
        ) : accepted ? (
          <>
            <button
              onClick={openAccepted}
              disabled={busy}
              className="flex-1 py-2.5 rounded-btn bg-brand-teal text-black text-[13px] font-extrabold
                         active:scale-95 transition-transform disabled:opacity-40"
            >
              {isExercise ? t('proposal.viewExercise') : t('proposal.openPlanner')}
            </button>
            <button
              onClick={() => onResolved(proposal.id)}
              className="px-4 py-2.5 rounded-btn border border-dark-600 bg-dark-800
                         text-white text-[13px] font-bold active:scale-95 transition-transform"
            >
              {t('proposal.later')}
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
              {busy ? t('proposal.adding')
                : isExercise ? t('proposal.addExercise')
                : proposal.scheduledFor ? t('proposal.addSchedule')
                : t('proposal.addPlan')}
            </button>
            <button
              onClick={dismiss}
              disabled={busy}
              className="px-4 py-2.5 rounded-btn border border-dark-600 bg-dark-800
                         text-white text-[13px] font-bold active:scale-95 transition-transform
                         disabled:opacity-40"
            >
              {t('proposal.noThanks')}
            </button>
          </>
        )}
      </div>
      )}
    </div>
  )
}
