import { useEffect, useState } from 'react'
import { securityService } from '../../services/security.service'
import { useAuthStore } from '../../store/useAuthStore'
import { useT } from '../../i18n'
import { LockIcon } from '../icons'

/** Full-screen PIN gate. The PIN is verified by the server, never in the client. */

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']

export default function PinLock({ onUnlock }: { onUnlock: () => void }) {
  const { logout } = useAuthStore()
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [shake, setShake] = useState(false)
  const { t } = useT()

  // No submit button: verify from the 4th digit on, and again on each further digit
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
        setError(err?.response?.data?.error ?? t('pin.incorrect'))
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

  // The length cap lives in the updater: the keyboard listener can land keys
  // faster than React re-renders
  const press = (key: string) => {
    setError(null)
    if (key === '⌫') return setPin(p => p.slice(0, -1))
    if (key === '') return
    setPin(p => (p.length >= 8 ? p : p + key))
  }

  // The pad key to highlight while its keyboard key is held
  const [litKey, setLitKey] = useState<string | null>(null)

  // Desktop keyboard entry, listened for on window (an input would raise the phone keyboard)
  useEffect(() => {
    if (busy) return

    const onKeyDown = (e: KeyboardEvent) => {
      // Leave browser and OS shortcuts alone
      if (e.ctrlKey || e.metaKey || e.altKey) return

      let key: string | null = null
      if (/^[0-9]$/.test(e.key)) {
        // Ignore auto-repeat from a held digit
        if (e.repeat) { e.preventDefault(); return }
        key = e.key
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        key = '⌫'
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setError(null)
        setPin('')
        return
      }
      if (key === null) return

      e.preventDefault()
      press(key)
      setLitKey(key)
    }
    const onKeyUp = () => setLitKey(null)

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      // The keyup may land while busy, with no listener
      setLitKey(null)
    }
  }, [busy])

  // Scrolls instead of clipping when the pad is taller than the viewport
  return (
    <div className="fixed inset-0 z-50 bg-dark-900 text-white flex flex-col
                    items-center [justify-content:safe_center] overflow-y-auto px-8
                    pt-[calc(2rem+var(--safe-top))] pb-[calc(2rem+var(--safe-bottom))]">
      <LockIcon className="w-11 h-11 mb-4 text-brand-teal" />
      <h1 className="text-xl font-extrabold">{t('pin.title')}</h1>
      <p className="text-dark-300 text-[13px] mt-1.5 text-center max-w-[260px]">
        {error ?? t('pin.locked')}
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
                        ${key === '' ? 'invisible'
                          : litKey === key ? 'bg-dark-800 border border-brand-teal scale-90'
                          : 'bg-dark-800 border border-dark-600'}`}
          >
            {key}
          </button>
        ))}
      </div>

      {/* Forgotten PIN: sign out and back in with the password */}
      <button
        onClick={logout}
        className="mt-9 text-dark-300 text-[13px] underline underline-offset-4"
      >
        {t('pin.forgot')}
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
