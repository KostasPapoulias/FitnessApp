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

  const handleSubmit = async () => {
    if (!name || !email || !password) {
      setError('Please fill in all fields')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    try {
      setError('')
      await register(email, password, name)
      navigate('/')
    } catch {
      setError('Registration failed. Email may already be in use.')
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
              className="w-full bg-dark-800 border border-dark-600 rounded-btn
                         px-4 py-3 text-white placeholder-dark-400
                         focus:outline-none focus:border-brand-teal"
            />
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