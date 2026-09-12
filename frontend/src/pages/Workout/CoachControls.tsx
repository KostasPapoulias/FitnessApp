import { CoachMode, PaceZone } from '../../lib/paceCoach'
import { fmtTime } from './helpers'

// Both switches stay on screen whatever their state — rendering them only when
// ON meant turning one off deleted the control that turned it back on.

// Two vocabularies for the same three zones. On GPS the athlete is behind a
// target; on a machine the DIAL is below it, which is a fact about a setting
// and not about them — "behind target" on a treadmill reads as a rebuke for
// something the athlete has not done.
const ZONE: Record<CoachMode, Record<PaceZone, { label: string; color: string; tint: string }>> = {
  follow: {
    on: { label: 'On target', color: '#00D4AA', tint: '#0a2a22' },
    slow: { label: 'Behind target', color: '#F97316', tint: '#2a1c10' },
    fast: { label: 'Ahead of target', color: '#FACC15', tint: '#2a2410' },
  },
  dial: {
    on: { label: 'Dial matches target', color: '#00D4AA', tint: '#0a2a22' },
    slow: { label: 'Dial set too slow', color: '#F97316', tint: '#2a1c10' },
    fast: { label: 'Dial set too fast', color: '#FACC15', tint: '#2a2410' },
  },
}

function Switch({ on }: { on: boolean }) {
  return (
    <span
      className="w-[42px] h-[24px] rounded-full flex items-center px-[3px] transition-colors flex-shrink-0"
      style={{ background: on ? '#00D4AA' : '#2A2A2A' }}
    >
      <span
        className="w-[18px] h-[18px] rounded-full bg-white transition-transform"
        style={{ transform: `translateX(${on ? 18 : 0}px)` }}
      />
    </span>
  )
}

interface Props {
  coachOn: boolean
  onCoach: (on: boolean) => void
  /** The plan in words — see describePlan. */
  planLabel: string
  onEditPlan: () => void
  voiceOn: boolean
  onVoice: (on: boolean) => void
  /**
   * Which coach is running, which changes every word on this card. Wording
   * only — the mode itself is decided by the exercise and the source.
   */
  mode: CoachMode
  /** Live only. */
  zone?: PaceZone | null
  targetSec?: number | null
  currentPaceSec?: number
  live?: boolean
}

export default function CoachControls({
  coachOn, onCoach, planLabel, onEditPlan, voiceOn, onVoice,
  mode, zone, targetSec, currentPaceSec, live,
}: Props) {
  const verdict = live && coachOn ? (zone ? ZONE[mode][zone] : null) : null

  return (
    <div className="rounded-card border border-dark-600 bg-dark-800 overflow-hidden text-left">
      {/* ── pace coach ── */}
      <div className="px-4 py-3 border-b border-dark-700">
        <button
          onClick={() => onCoach(!coachOn)}
          className="w-full flex items-center gap-3 active:scale-[0.99] transition-transform"
        >
          <span className="text-[16px]">🎯</span>
          <span className="flex-1 min-w-0">
            <span className="block text-[13.5px] font-bold">Pace coach</span>
            <span className="block text-[11.5px] text-dark-300 mt-0.5">
              {coachOn
                ? mode === 'dial'
                  ? 'Calls the pace to set, then confirms it'
                  : 'Speaks when you drift off pace'
                : 'Off — no spoken pace'}
            </span>
          </span>
          <Switch on={coachOn} />
        </button>

        {coachOn && (
          <button
            onClick={onEditPlan}
            className="w-full mt-2.5 rounded-btn border border-dark-600 bg-dark-900 px-3 py-2.5
                       flex items-center gap-2.5 active:scale-[0.99] transition-transform"
            style={verdict ? { borderColor: `${verdict.color}55`, background: verdict.tint } : undefined}
          >
            <span className="flex-1 min-w-0">
              <span className="block text-[12.5px] font-bold tabular-nums"
                style={verdict ? { color: verdict.color } : { color: '#FFFFFF' }}>
                {verdict ? verdict.label : planLabel}
              </span>
              <span className="block text-[11px] text-dark-400 mt-0.5 tabular-nums">
                {verdict ? planLabel : 'Tap to change'}
                {live && targetSec != null && ` · target ${fmtTime(targetSec)}`}
                {live && currentPaceSec != null && currentPaceSec > 0 &&
                  ` · ${mode === 'dial' ? 'set to' : 'now'} ${fmtTime(currentPaceSec)}`}
              </span>
            </span>
            <span className="text-dark-400 text-[13px] flex-shrink-0">›</span>
          </button>
        )}
      </div>

      {/* ── voice commands ──
          The warning is the point: recognition holds the audio session for as
          long as it listens, and re-takes it every time the engine restarts,
          which is what stops the music. Saying so is the difference between a
          setting and a mystery. */}
      <button
        onClick={() => onVoice(!voiceOn)}
        className="w-full px-4 py-3 flex items-center gap-3 active:scale-[0.99] transition-transform"
      >
        <span className="text-[16px]">🎤</span>
        <span className="flex-1 min-w-0">
          <span className="block text-[13.5px] font-bold">Voice commands</span>
          <span className="block text-[11.5px] text-dark-300 mt-0.5">
            {voiceOn ? 'Holding the mic — this can interrupt music' : 'Off — your music is left alone'}
          </span>
        </span>
        <Switch on={voiceOn} />
      </button>
    </div>
  )
}
