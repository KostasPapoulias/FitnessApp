import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PinStatus, securityService } from '../services/security.service'
import { useAuthStore } from '../store/useAuthStore'
import { rememberPinEnabled } from '../hooks/useAppLock'

function Section({ title, subtitle, children }: {
  title: string; subtitle?: string; children: React.ReactNode
}) {
  return (
    <div className="mb-5">
      <p className="text-dark-300 text-xs uppercase tracking-wider px-1 mb-2">{title}</p>
      {subtitle && (
        <p className="text-dark-400 text-[11.5px] px-1 mb-2 leading-relaxed">{subtitle}</p>
      )}
      <div className="bg-dark-800 rounded-card border border-dark-600 overflow-hidden">
        {children}
      </div>
    </div>
  )
}

const field =
  'w-full bg-dark-700 border border-dark-600 rounded-btn px-3 py-2.5 text-sm text-white'

export default function SecuritySettings() {
  const navigate = useNavigate()
  const { logout } = useAuthStore()

  const [status, setStatus] = useState<PinStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'idle' | 'set' | 'remove' | 'password'>('idle')

  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [currentPin, setCurrentPin] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')

  // The launch gate reads a cached copy of `enabled` so it can paint the pad on
  // the first frame. This screen is the only place that changes it, so every
  // read of the real status writes the cache back — a PIN removed here and not
  // mirrored would leave the next launch stuck behind a pad with no PIN to open
  // it.
  const refresh = () =>
    securityService.getPinStatus()
      .then(s => { setStatus(s); rememberPinEnabled(s.enabled) })
      .catch(() => {})
  useEffect(() => { refresh() }, [])

  const reset = () => {
    setPin(''); setConfirmPin(''); setCurrentPin('')
    setCurrentPassword(''); setNewPassword(''); setMode('idle')
  }

  const savePin = async () => {
    if (pin !== confirmPin) return alert('The two PINs don’t match.')
    setBusy(true)
    try {
      await securityService.setPin(pin, status?.enabled ? { currentPin } : undefined)
      // Already unlocked here by definition — don't lock on the way out
      sessionStorage.setItem('somatrack_unlocked', '1')
      await refresh()
      reset()
      alert('PIN saved.')
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Could not save the PIN.')
    } finally { setBusy(false) }
  }

  const deletePin = async () => {
    setBusy(true)
    try {
      await securityService.removePin({ pin: currentPin, password: currentPassword })
      await refresh()
      reset()
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Could not remove the PIN.')
    } finally { setBusy(false) }
  }

  const savePassword = async () => {
    setBusy(true)
    try {
      await securityService.changePassword(currentPassword, newPassword)
      // Changing the password revokes every token, this one included
      alert('Password changed. You’ll need to sign in again.')
      logout()
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Could not change the password.')
      setBusy(false)
    }
  }

  const signOutEverywhere = async () => {
    if (!confirm('Sign out of every device, including this one?')) return
    setBusy(true)
    try {
      await securityService.signOutEverywhere()
      logout()
    } catch {
      alert('Could not sign out everywhere.')
      setBusy(false)
    }
  }

  return (
    <div className="min-h-dvh bg-dark-900 text-white px-4 pt-4 pb-24">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate('/profile')}
          className="w-9 h-9 rounded-full bg-dark-800 border border-dark-600
                     flex items-center justify-center text-lg">←</button>
        <h1 className="text-xl font-extrabold">Security</h1>
      </div>

      <Section
        title="Screen lock"
        subtitle="Asks for a PIN when you open the app, and after it’s been in the background a couple of minutes. It guards against someone picking up your unlocked phone — it isn’t a second password."
      >
        {mode === 'idle' && (
          <div className="flex items-center gap-3 px-3.5 py-3">
            <span className="text-lg">🔒</span>
            <div className="flex-1">
              <p className="text-sm font-medium">PIN lock</p>
              <p className="text-dark-300 text-[11.5px] mt-0.5">
                {status?.enabled ? 'On' : 'Off'}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setMode('set')}
                className="px-3 py-1.5 rounded-btn bg-dark-700 border border-dark-600
                           text-[12px] font-semibold">
                {status?.enabled ? 'Change' : 'Set up'}
              </button>
              {status?.enabled && (
                <button onClick={() => setMode('remove')}
                  className="px-3 py-1.5 rounded-btn text-brand-red text-[12px] font-semibold">
                  Remove
                </button>
              )}
            </div>
          </div>
        )}

        {mode === 'set' && (
          <div className="px-3.5 py-3.5 flex flex-col gap-2.5">
            {status?.enabled && (
              <input className={field} type="password" inputMode="numeric"
                placeholder="Current PIN" value={currentPin}
                onChange={e => setCurrentPin(e.target.value)} />
            )}
            <input className={field} type="password" inputMode="numeric"
              placeholder="New PIN (4–8 digits)" value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} />
            <input className={field} type="password" inputMode="numeric"
              placeholder="Confirm PIN" value={confirmPin}
              onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 8))} />
            <div className="flex gap-2 mt-1">
              <button onClick={savePin} disabled={busy || pin.length < 4}
                className="flex-1 py-2.5 rounded-btn bg-brand-teal text-black
                           text-sm font-bold disabled:opacity-40">Save</button>
              <button onClick={reset}
                className="px-4 py-2.5 rounded-btn bg-dark-700 text-sm">Cancel</button>
            </div>
          </div>
        )}

        {mode === 'remove' && (
          <div className="px-3.5 py-3.5 flex flex-col gap-2.5">
            <p className="text-dark-300 text-[12px]">
              Enter your PIN, or your account password if you’ve forgotten it.
            </p>
            <input className={field} type="password" inputMode="numeric"
              placeholder="PIN" value={currentPin}
              onChange={e => setCurrentPin(e.target.value)} />
            <input className={field} type="password" placeholder="or account password"
              value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
            <div className="flex gap-2 mt-1">
              <button onClick={deletePin} disabled={busy}
                className="flex-1 py-2.5 rounded-btn bg-brand-red text-white
                           text-sm font-bold disabled:opacity-40">Remove PIN</button>
              <button onClick={reset}
                className="px-4 py-2.5 rounded-btn bg-dark-700 text-sm">Cancel</button>
            </div>
          </div>
        )}
      </Section>

      <Section
        title="Password"
        subtitle="Changing it signs out every device — a password change that leaves old sessions working hasn’t really changed anything."
      >
        {mode === 'password' ? (
          <div className="px-3.5 py-3.5 flex flex-col gap-2.5">
            <input className={field} type="password" placeholder="Current password"
              value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
            <input className={field} type="password" placeholder="New password (10+ characters)"
              value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            <div className="flex gap-2 mt-1">
              <button onClick={savePassword} disabled={busy || newPassword.length < 10}
                className="flex-1 py-2.5 rounded-btn bg-brand-teal text-black
                           text-sm font-bold disabled:opacity-40">Change password</button>
              <button onClick={reset}
                className="px-4 py-2.5 rounded-btn bg-dark-700 text-sm">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setMode('password')}
            className="w-full flex items-center gap-3 px-3.5 py-3 text-left active:bg-dark-700">
            <span className="text-lg">🔑</span>
            <span className="flex-1 text-sm font-medium">Change password</span>
            <span className="text-dark-400 text-lg">›</span>
          </button>
        )}
      </Section>

      <Section
        title="Sessions"
        subtitle="Signing out everywhere invalidates every token on the account immediately, even ones on devices you no longer have."
      >
        <button onClick={signOutEverywhere} disabled={busy}
          className="w-full flex items-center gap-3 px-3.5 py-3 text-left
                     active:bg-dark-700 disabled:opacity-40">
          <span className="text-lg">🚪</span>
          <span className="flex-1 text-sm font-medium text-brand-red">
            Sign out everywhere
          </span>
        </button>
      </Section>
    </div>
  )
}
