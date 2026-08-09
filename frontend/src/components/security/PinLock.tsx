import { useEffect, useState } from 'react'
import { securityService } from '../../services/security.service'
import { useAuthStore } from '../../store/useAuthStore'

/**
 * Full-screen PIN gate.
 *
 * Shown over the app when a PIN is set and the session is locked. The PIN is
 * checked by the server, never compared in the client — a correct value sitting
 * in the bundle or in device storage would be readable by anything that can
 * read either.
 */

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']

export default function PinLock({ onUnlock }: { onUnlock: () => void }) {
  const { logout } = useAuthStore()
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [shake, setShake] = useState(false)

  // A PIN is 4–8 digits, so there is no submit button — verify as soon as the
  // shortest valid length is reached, then again on each further digit.
  useEffect(() => {
    if (pin.length < 4 || busy) return

    let cancelled = false
    const attempt = async () => {
      setBusy(true)
      try {
        await securityService.verifyPin(pin)
        if (!cancelled) onUnlock()
      } catch (err: any) {
        if (cancelled) return
        setError(err?.response?.data?.error ?? 'Incorrect PIN.')
        setShake(true)
        setPin('')
        setTimeout(() => setShake(false), 420)
      } finally {
        if (!cancelled) setBusy(false)
      }
    }

    // Give the fourth digit a moment to render before the request
    const timer = setTimeout(attempt, 120)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [pin]) // eslint-disable-line react-hooks/exhaustive-deps

  const press = (key: string) => {
    setError(null)
    if (key === '⌫') return setPin(p => p.slice(0, -1))
    if (key === '' || pin.length >= 8) return
    setPin(p => p + key)
  }

  // Scrolls rather than clipping the keypad: in landscape, or with large text,
  // the pad is taller than the viewport. `safe center` keeps the top reachable
  // when it does overflow.
  return (
    <div className="fixed inset-0 z-50 bg-dark-900 text-white flex flex-col
                    items-center [justify-content:safe_center] overflow-y-auto px-8
                    pt-[calc(2rem+var(--safe-top))] pb-[calc(2rem+var(--safe-bottom))]">
      <div className="text-[44px] leading-none mb-4">🔒</div>
      <h1 className="text-xl font-extrabold">Enter your PIN</h1>
      <p className="text-dark-300 text-[13px] mt-1.5 text-center max-w-[260px]">
        {error ?? 'SomaTrack is locked on this device.'}
      </p>

      {/* Dots */}
      <div className={`flex gap-3 mt-8 mb-9 ${shake ? 'animate-[shake_0.4s]' : ''}`}
        style={shake ? { animation: 'pinShake 0.4s' } : undefined}>
        {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
          <div key={i}
            className={`w-3.5 h-3.5 rounded-full transition-colors
                        ${i < pin.length ? 'bg-brand-teal' : 'bg-dark-600'}`} />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3.5 w-full max-w-[260px]">
        {KEYS.map((key, i) => (
          <button
            key={i}
            onClick={() => press(key)}
            disabled={busy || key === ''}
            className={`h-[62px] rounded-full text-[22px] font-semibold
                        active:scale-90 transition-transform disabled:opacity-30
                        ${key === '' ? 'invisible' : 'bg-dark-800 border border-dark-600'}`}
          >
            {key}
          </button>
        ))}
      </div>

      {/* Forgetting the PIN must not mean losing the account — signing out and
          back in with the password is the way through. */}
      <button
        onClick={logout}
        className="mt-9 text-dark-300 text-[13px] underline underline-offset-4"
      >
        Forgot PIN? Sign out
      </button>

      <style>{`
        @keyframes pinShake {
          0%,100% { transform: translateX(0); }
          25%     { transform: translateX(-7px); }
          75%     { transform: translateX(7px); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes pinShake { 0%,100% { transform: none; } }
        }
      `}</style>
    </div>
  )
}
