import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { authService } from '../services/auth.service'

/**
 * Choose a new password, using the token from the emailed link.
 *
 * Success does NOT sign the user in. Handing out a session off the back of a
 * link sitting in an inbox skips the one thing that proves they know the
 * password they just set — so they land on sign-in and type it once.
 */
export default function ResetPassword() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // Checked here as well as server-side, so a mismatch costs no round trip and
  // the message appears next to the field that caused it.
  const mismatch = confirm.length > 0 && password !== confirm

  const submit = async () => {
    if (isLoading || mismatch || !password) return
    setIsLoading(true)
    setError(null)
    try {
      await authService.resetPassword(token, password)
      setDone(true)
    } catch (err: any) {
      setError(
        err?.response?.data?.error ??
        'Could not reach the server. Check your connection and try again.'
      )
    } finally {
      setIsLoading(false)
    }
  }

  const shell = (children: React.ReactNode) => (
    <div className="min-h-dvh bg-dark-900 flex flex-col justify-between px-6
                    pt-[calc(1.5rem+var(--safe-top))] pb-[calc(1.5rem+var(--safe-bottom))]">
      <div className="flex-1 flex flex-col justify-center">{children}</div>
      <p className="text-center text-dark-300 text-sm">
        <Link to="/login" className="text-brand-teal font-semibold">Back to sign in</Link>
      </p>
    </div>
  )

  // No token in the URL at all — someone opened the page directly, or a mail
  // client mangled the link. Say so rather than showing a form that can only
  // fail on submit.
  if (!token) {
    return shell(
      <>
        <h1 className="text-3xl font-bold text-white">Link incomplete</h1>
        <p className="text-dark-300 mt-2 mb-6">
          This page needs the link from your reset email. Open it there, or ask
          for a new one.
        </p>
        <Link
          to="/forgot-password"
          className="w-full bg-brand-teal text-black font-bold py-4 rounded-btn
                     text-center active:scale-95 transition-transform"
        >
          Request a new link
        </Link>
      </>
    )
  }

  if (done) {
    return shell(
      <>
        <h1 className="text-3xl font-bold text-white">Password updated</h1>
        <p className="text-dark-300 mt-2 mb-6">
          You’ve been signed out everywhere else. Sign in with your new password.
        </p>
        <button
          onClick={() => navigate('/login', { replace: true })}
          className="w-full bg-brand-teal text-black font-bold py-4 rounded-btn
                     active:scale-95 transition-transform"
        >
          Sign in
        </button>
      </>
    )
  }

  return shell(
    <>
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-white">New password</h1>
        <p className="text-dark-300 mt-2">At least 10 characters.</p>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <label className="text-dark-300 text-sm mb-2 block">New password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••••"
            className="w-full bg-dark-800 border border-dark-600 rounded-btn
                       px-4 py-3 text-white placeholder-dark-400
                       focus:outline-none focus:border-brand-teal"
          />
        </div>

        <div>
          <label className="text-dark-300 text-sm mb-2 block">Confirm</label>
          <input
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="••••••••••"
            className={`w-full bg-dark-800 border rounded-btn
                        px-4 py-3 text-white placeholder-dark-400 focus:outline-none
                        ${mismatch ? 'border-brand-red' : 'border-dark-600 focus:border-brand-teal'}`}
          />
          {mismatch && (
            <p className="text-brand-red text-xs mt-1.5">Those don’t match.</p>
          )}
        </div>

        {error && <p className="text-brand-red text-sm">{error}</p>}

        <button
          onClick={submit}
          disabled={isLoading || mismatch || !password}
          className="w-full bg-brand-teal text-black font-bold py-4 rounded-btn
                     mt-2 active:scale-95 transition-transform disabled:opacity-50"
        >
          {isLoading ? 'Saving…' : 'Set new password'}
        </button>
      </div>
    </>
  )
}
