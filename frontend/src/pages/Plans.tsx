import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { templateService } from '../services/template.service'
import { useWorkoutStore } from '../store/useWorkoutStore'
import { ScheduledWorkout, WorkoutTemplate } from '../types'

/**
 * Saved plans and the standby queue.
 *
 * Three states, deliberately on one screen: what is coming up, what is kept,
 * and what has been put away. The athlete's question is almost always "what am
 * I doing next, and do I already have something for it" — splitting that across
 * screens makes them navigate to find out they have nothing scheduled.
 */

type Tab = 'standby' | 'plans' | 'archive'

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

const relativeDay = (iso: string) => {
  const target = new Date(iso)
  const today = new Date()
  target.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  if (days < 0) return `${Math.abs(days)} days ago`
  return `In ${days} days`
}

const summarise = (template: WorkoutTemplate) => {
  const sets = template.exercises.reduce((sum, e) => sum + e.sets.length, 0)
  return `${template.exercises.length} exercise${template.exercises.length === 1 ? '' : 's'} · ${sets} sets`
}

export default function Plans() {
  const navigate = useNavigate()
  const loadTemplate = useWorkoutStore(s => s.loadTemplate)

  const [tab, setTab] = useState<Tab>('standby')
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([])
  const [scheduled, setScheduled] = useState<ScheduledWorkout[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      const [all, standby] = await Promise.all([
        templateService.list(true),
        templateService.listScheduled('standby'),
      ])
      setTemplates(all)
      setScheduled(standby)
    } catch {
      setError('Could not load your plans. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  // Loading a plan fills the existing planner rather than starting anything —
  // the athlete still gets to look it over and press Start themselves.
  const openInPlanner = (template: WorkoutTemplate, scheduledId?: string) => {
    loadTemplate(template, scheduledId ?? null)
    navigate('/workout/plan')
  }

  const setArchived = async (template: WorkoutTemplate, archived: boolean) => {
    setBusyId(template.id)
    try {
      await templateService.setArchived(template.id, archived)
      await refresh()
    } catch {
      setError('That did not save. Try again.')
    } finally {
      setBusyId(null)
    }
  }

  const cancel = async (slot: ScheduledWorkout) => {
    setBusyId(slot.id)
    try {
      await templateService.cancel(slot.id)
      await refresh()
    } catch {
      setError('Could not cancel that. Try again.')
    } finally {
      setBusyId(null)
    }
  }

  const active = templates.filter(t => !t.archivedAt)
  const archived = templates.filter(t => t.archivedAt)

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'standby', label: 'Standby', count: scheduled.length },
    { id: 'plans', label: 'My plans', count: active.length },
    { id: 'archive', label: 'Archive', count: archived.length },
  ]

  return (
    <div className="flex-1 bg-dark-900 text-white px-5 pt-4 pb-6">
      <h1 className="text-xl font-extrabold">Plans</h1>
      <p className="text-dark-400 text-[12.5px] mt-0.5">
        Saved workouts, and what you have lined up.
      </p>

      <div className="flex gap-2 mt-4">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2.5 rounded-btn text-[13px] font-bold transition-colors ${
              tab === t.id
                ? 'bg-brand-teal text-black'
                : 'bg-dark-800 border border-dark-600 text-dark-200'
            }`}
          >
            {t.label}{t.count > 0 && ` · ${t.count}`}
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-4 rounded-btn border border-brand-red/40 bg-[#2a1a1a] px-3.5 py-2.5
                        text-[12.5px] text-brand-red font-semibold">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-dark-400 text-sm text-center mt-10">Loading…</p>
      ) : (
        <div className="mt-4 flex flex-col gap-2.5">
          {tab === 'standby' && (
            scheduled.length === 0 ? (
              <Empty
                text="Nothing on standby."
                hint="Ask the coach for a workout, or schedule one of your plans."
                action={{ label: 'Ask the coach →', onClick: () => navigate('/ai') }}
              />
            ) : scheduled.map(slot => (
              <div key={slot.id} className="rounded-card border border-dark-600 bg-dark-800 px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] tracking-wider text-brand-teal font-bold">
                      {relativeDay(slot.scheduledFor).toUpperCase()} · {fmtDate(slot.scheduledFor)}
                    </p>
                    <p className="text-sm font-bold mt-0.5 truncate">{slot.template.name}</p>
                    <p className="text-dark-400 text-[12px] mt-0.5">{summarise(slot.template)}</p>
                    {slot.reminderAt && (
                      <p className="text-dark-400 text-[11.5px] mt-1">
                        🔔 Reminder at {fmtTime(slot.reminderAt)}
                      </p>
                    )}
                  </div>
                  {slot.template.source === 'ai' && (
                    <span className="text-[10px] font-bold text-dark-300 border border-dark-600
                                     rounded-full px-2 py-0.5 flex-shrink-0">AI</span>
                  )}
                </div>

                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => openInPlanner(slot.template, slot.id)}
                    className="flex-1 py-2.5 rounded-btn bg-brand-teal text-black text-[13px] font-extrabold
                               active:scale-95 transition-transform"
                  >
                    Start this →
                  </button>
                  <button
                    onClick={() => cancel(slot)}
                    disabled={busyId === slot.id}
                    className="px-4 py-2.5 rounded-btn border border-dark-600 bg-dark-700
                               text-[13px] font-bold active:scale-95 transition-transform
                               disabled:opacity-40"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ))
          )}

          {tab === 'plans' && (
            active.length === 0 ? (
              <Empty
                text="No saved plans yet."
                hint="Build a workout, then save it from the plan screen so you can repeat it."
                action={{ label: 'Build a workout →', onClick: () => navigate('/workout/start') }}
              />
            ) : active.map(template => (
              <TemplateRow
                key={template.id}
                template={template}
                busy={busyId === template.id}
                onOpen={() => openInPlanner(template)}
                onArchive={() => setArchived(template, true)}
              />
            ))
          )}

          {tab === 'archive' && (
            archived.length === 0 ? (
              <Empty
                text="Nothing archived."
                hint="Plans you put away stay here — the sessions you did from them keep their history."
              />
            ) : archived.map(template => (
              <TemplateRow
                key={template.id}
                template={template}
                busy={busyId === template.id}
                archived
                onOpen={() => openInPlanner(template)}
                onArchive={() => setArchived(template, false)}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

function TemplateRow({ template, busy, archived, onOpen, onArchive }: {
  template: WorkoutTemplate
  busy: boolean
  archived?: boolean
  onOpen: () => void
  onArchive: () => void
}) {
  return (
    <div className="rounded-card border border-dark-600 bg-dark-800 px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold truncate">{template.name}</p>
          <p className="text-dark-400 text-[12px] mt-0.5">{summarise(template)}</p>
          <p className="text-dark-500 text-[11.5px] mt-1">
            {template.timesPerformed > 0
              ? `Done ${template.timesPerformed}×${
                  template.lastPerformedAt ? ` · last ${fmtDate(template.lastPerformedAt)}` : ''
                }`
              : 'Not done yet'}
          </p>
        </div>
        {template.source === 'ai' && (
          <span className="text-[10px] font-bold text-dark-300 border border-dark-600
                           rounded-full px-2 py-0.5 flex-shrink-0">AI</span>
        )}
      </div>

      <div className="flex gap-2 mt-3">
        <button
          onClick={onOpen}
          className="flex-1 py-2.5 rounded-btn bg-brand-teal text-black text-[13px] font-extrabold
                     active:scale-95 transition-transform"
        >
          {archived ? 'Use again →' : 'Load →'}
        </button>
        <button
          onClick={onArchive}
          disabled={busy}
          className="px-4 py-2.5 rounded-btn border border-dark-600 bg-dark-700
                     text-[13px] font-bold active:scale-95 transition-transform disabled:opacity-40"
        >
          {archived ? 'Restore' : 'Archive'}
        </button>
      </div>
    </div>
  )
}

function Empty({ text, hint, action }: {
  text: string
  hint: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="rounded-card border border-dark-600 bg-dark-800 px-5 py-8 text-center">
      <p className="text-white text-sm font-bold">{text}</p>
      <p className="text-dark-400 text-[12.5px] mt-1.5 leading-snug">{hint}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 px-5 py-2.5 rounded-btn bg-brand-teal text-black text-[13px] font-extrabold
                     active:scale-95 transition-transform"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
