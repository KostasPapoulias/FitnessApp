import { useEffect, useRef } from 'react'
import type { ModalityVoiceHandler } from '../pages/Workout/LiveShared'

/**
 * Registers a modality view's voice handler while mounted. The handler goes
 * through a ref so registration never re-runs. Call it above any conditional
 * return — it is a hook.
 */
export function useModalityVoice(
  register: (handler: ModalityVoiceHandler | null) => void,
  handler: ModalityVoiceHandler,
) {
  const latest = useRef(handler)
  latest.current = handler
  useEffect(() => {
    register(command => latest.current(command))
    return () => register(null)
  }, [register])
}
