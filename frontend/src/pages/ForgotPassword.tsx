import { useState } from 'react'
import { Link } from 'react-router-dom'
import { authService } from '../services/auth.service'
import { useT } from '../i18n'

/**
 * Request a password reset link. The confirmation is the same whether or not
 * the address has an account. Rendered outside AppLayout, so it uses
 * --safe-top/--safe-bottom directly.
 */
export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { t, tx } = useT()

  const submit = async () => {
    if (!email.trim() || isLoading) return
    setIsLoading(true)
    setError(null)
    try {
      await authService.forgotPassword(email.trim())
      setSent(true)
    } catch (err: any) {
      // 503: mail is not configured on the server
      setError(err?.response?.data?.error ?? t('common.offline'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-dvh bg-dark-900 flex flex-col justify-between px-6
                    pt-[calc(1.5rem+var(--safe-top))] pb-[calc(1.5rem+var(--safe-bottom))]">

      <div className="flex-1 flex flex-col justify-center">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-white">{t('forgot.title')}</h1>
          <p className="text-dark-300 mt-2">
            {sent ? t('forgot.sentSubtitle') : t('forgot.subtitle')}
          </p>
        </div>

        {sent ? (
          <div className="bg-dark-800 border border-dark-600 rounded-card p-5">
            <p className="text-white text-sm leading-relaxed">
              {tx('forgot.sentBody', {
                email: <span className="font-semibold">{email.trim()}</span>,
              })}
            </p>
            <p className="text-dark-400 text-xs mt-3 leading-relaxed">
              {t('forgot.noMail')}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-dark-300 text-sm mb-2 block">{t('auth.email')}</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                placeholder={t('auth.emailPlaceholder')}
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
              {isLoading ? t('forgot.sending') : t('forgot.send')}
            </button>
          </div>
        )}
      </div>

      <p className="text-center text-dark-300 text-sm">
        <Link to="/login" className="text-brand-teal font-semibold">
          {t('auth.backToSignIn')}
        </Link>
      </p>
    </div>
  )
}
