import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'

export default function Login() {
  const navigate = useNavigate()
  const { login, isLoading } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!email || !password) {
      setError('Please fill in all fields')
      return
    }
    try {
      setError('')
      await login(email, password)
      navigate('/')
    } catch {
      setError('Invalid email or password')
    }
  }

  return (
    <div className="min-h-dvh bg-dark-900 flex flex-col justify-between p-6">

      {/* Top */}
      <div className="flex-1 flex flex-col justify-center">
        {/* Logo */}
        <div className="mb-10">
          <h1 className="text-4xl font-bold text-white">SomaTrack</h1>
          <p className="text-dark-300 mt-2">Track your body. Own your recovery.</p>
        </div>

        {/* Form */}
        <div className="flex flex-col gap-4">
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
          </div>

          {error && (
            <p className="text-brand-red text-sm">{error}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="w-full bg-brand-teal text-black font-bold py-4 rounded-btn
                       mt-2 active:scale-95 transition-transform disabled:opacity-50"
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </div>
      </div>

      {/* Bottom */}
      <p className="text-center text-dark-300 text-sm">
        Don't have an account?{' '}
        <Link to="/register" className="text-brand-teal font-semibold">
          Register
        </Link>
      </p>
    </div>
  )
}