import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'

export default function Register() {
  const navigate = useNavigate()
  const { register, isLoading } = useAuthStore()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  // Must match the server (credentials.service.ts). It used to say 6, so a
  // 6–9 character password passed here and was rejected by the API — and the
  // catch below reported that as "email may already be in use", which sent
  // people off changing the one thing that was fine.
  const MIN_PASSWORD_LENGTH = 10

  const handleSubmit = async () => {
    if (!name || !email || !password) {
      setError('Please fill in all fields')
      return
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
      return
    }
    try {
      setError('')
      await register(email, password, name)
      navigate('/')
    } catch (err: any) {
      // The server says exactly what was wrong — too short, not a valid
      // address, already registered, too many attempts. Guessing on its behalf
      // is worse than useless when the guess is wrong.
      setError(
        err?.response?.data?.error ||
        (err?.response
          ? 'Registration failed. Please try again.'
          : 'Could not reach the server. Check your connection and try again.')
      )
    }
  }

  return (
    <div className="min-h-dvh bg-dark-900 flex flex-col justify-between p-6">
      <div className="flex-1 flex flex-col justify-center">
        <div className="mb-10">
          <h1 className="text-4xl font-bold text-white">SomaTrack</h1>
          <p className="text-dark-300 mt-2">Create your account</p>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="text-dark-300 text-sm mb-2 block">Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Kostas"
              className="w-full bg-dark-800 border border-dark-600 rounded-btn
                         px-4 py-3 text-white placeholder-dark-400
                         focus:outline-none focus:border-brand-teal"
            />
          </div>

          <div>
            <label className="text-dark-300 text-sm mb-2 block">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full bg-dark-800 border border-dark-600 rounded-btn
                         px-4 py-3 text-white placeholder-dark-400
                         focus:outline-none focus:border-brand-teal"
            />
          </div>

          <div>
            <label className="text-dark-300 text-sm mb-2 block">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              className="w-full bg-dark-800 border border-dark-600 rounded-btn
                         px-4 py-3 text-white placeholder-dark-400
                         focus:outline-none focus:border-brand-teal"
            />
            {/* Stated before submitting, not after being rejected */}
            <p className="text-dark-400 text-xs mt-1.5">
              At least {MIN_PASSWORD_LENGTH} characters. A short phrase works well.
            </p>
          </div>

          {error && <p className="text-brand-red text-sm">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="w-full bg-brand-teal text-black font-bold py-4 rounded-btn
                       mt-2 active:scale-95 transition-transform disabled:opacity-50"
          >
            {isLoading ? 'Creating account...' : 'Create Account'}
          </button>
        </div>
      </div>

      <p className="text-center text-dark-300 text-sm">
        Already have an account?{' '}
        <Link to="/login" className="text-brand-teal font-semibold">
          Sign In
        </Link>
      </p>
    </div>
  )
}