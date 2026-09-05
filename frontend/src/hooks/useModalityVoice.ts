import { useEffect, useRef } from 'react'
import type { ModalityVoiceHandler } from '../pages/Workout/LiveShared'

/**
 * Register a modality view's voice handler for as long as it is mounted.
 *
 * Lives here rather than beside `ModalityViewProps` because it is a hook and
 * `LiveShared` is a component module — exporting a non-component from it costs
 * fast refresh for every screen that imports it.
 *
 * The handler goes through a ref so the registration itself never changes
 * identity. A handler rebuilt on every render would otherwise re-register on
 * every tick, and every screen that uses this has a 1Hz clock.
 *
 * Call it ABOVE any conditional return — all four of these views have one (a
 * start gate, an effort prompt, a missing exercise), and this is a hook.
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
