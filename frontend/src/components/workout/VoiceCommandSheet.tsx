import BottomSheet from '../BottomSheet'
import { VOICE_COMMAND_GROUPS } from '../../constants/voiceCommands'

/** The full voice-command reference, opened from the live voice strip or the Smart Features card. */
export default function VoiceCommandSheet({ onClose }: { onClose: () => void }) {
  return (
    <BottomSheet
      title="Voice commands"
      subtitle="Hold a normal speaking voice — no wake word needed"
      onClose={onClose}
    >
      <div className="flex flex-col gap-6">
        {VOICE_COMMAND_GROUPS.map(group => (
          <section key={group.title}>
            <h3 className="text-[10px] font-bold tracking-[1.4px] text-dark-300 mb-1">
              {group.title.toUpperCase()}
            </h3>
            {group.note && (
              <p className="text-[12px] text-dark-400 leading-relaxed mb-2.5">{group.note}</p>
            )}
            <div className="flex flex-col gap-1.5">
              {group.commands.map(c => (
                <div key={c.example}
                  className="flex items-baseline gap-3 rounded-btn border border-dark-600
                             bg-dark-700 px-3.5 py-2.5">
                  <span className="text-brand-teal text-[13.5px] font-semibold whitespace-nowrap">
                    “{c.example}”
                  </span>
                  <span className="flex-1 text-[12px] text-dark-300 leading-snug text-right">
                    {c.effect}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}

        <p className="text-[12px] text-dark-400 leading-relaxed border-t border-dark-700 pt-4">
          Every command has a button too — voice never becomes the only way to do
          something. If a phrase isn’t recognised nothing happens to your set, so
          it is always safe to just try one.
        </p>
      </div>
    </BottomSheet>
  )
}
