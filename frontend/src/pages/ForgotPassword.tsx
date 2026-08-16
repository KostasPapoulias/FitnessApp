import { useState } from 'react'
import { Link } from 'react-router-dom'
import { authService } from '../services/auth.service'

/**
 * Ask for a reset link.
 *
 * The confirmation is deliberately identical whether or not the address has an
 * account. Saying "no account with that email" would turn this form into a way
 * to check who has signed up — which, for a fitness app, is information about
 * a person they did not choose to publish.
 *
 * Outside AppLayout, so it uses --safe-top/--safe-bottom directly. The
 * under-padded --page-top belongs to screens that render inside it.
 */
export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!email.trim() || isLoading) return
    setIsLoading(true)
    setError(null)
    try {
      await authService.forgotPassword(email.trim())
      setSent(true)
    } catch (err: any) {
      // 503 means the deployment has no mail configured. That is worth saying
      // plainly rather than claiming a message is on its way.
      setError(
        err?.response?.data?.error ??
        'Could not reach the server. Check your connection and try again.'
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-dvh bg-dark-900 flex flex-col justify-between px-6
                    pt-[calc(1.5rem+var(--safe-top))] pb-[calc(1.5rem+var(--safe-bottom))]">

      <div className="flex-1 flex flex-col justify-center">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-white">Reset password</h1>
          <p className="text-dark-300 mt-2">
            {sent
              ? 'Check your inbox.'
              : 'We’ll email you a link to choose a new one.'}
          </p>
        </div>

        {sent ? (
          <div className="bg-dark-800 border border-dark-600 rounded-card p-5">
            <p className="text-white text-sm leading-relaxed">
              If <span className="font-semibold">{email.trim()}</span> has an
              account, a reset link is on its way. It expires in 30 minutes and
              can be used once.
            </p>
            <p className="text-dark-400 text-xs mt-3 leading-relaxed">
              Nothing arrived? Check spam, and make sure that is the address you
              signed up with.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-dark-300 text-sm mb-2 block">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                placeholder="your@email.com"
                className="w-full bg-dark-800 border border-dark-600 rounded-btn
                           px-4 py-3 text-white placeholder-dark-400
                           focus:outline-none focus:border-brand-teal"
              />
            </div>

            {error && <p className="text-brand-red text-sm">{error}</p>}

            <button
              onClick={submit}
              disabled={isLoading || !email.trim()}
              className="w-full bg-brand-teal text-black font-bold py-4 rounded-btn
                         mt-2 active:scale-95 transition-transform disabled:opacity-50"
            >
              {isLoading ? 'Sending…' : 'Send reset link'}
            </button>
          </div>
        )}
      </div>

      <p className="text-center text-dark-300 text-sm">
        <Link to="/login" className="text-brand-teal font-semibold">
          Back to sign in
        </Link>
      </p>
    </div>
  )
}
