import axios from 'axios'
import { useLocaleStore } from '../store/useLocaleStore'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
  headers: { 'Content-Type': 'application/json' }
})

// Attach JWT token to every request automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('somatrack_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  // Always sent, so server messages match the app's language rather than the browser's
  config.headers['Accept-Language'] = useLocaleStore.getState().locale
  return config
})

// On 401, clear the token and go to login — except for the credential
// endpoints, where 401 just means the credential was wrong.
//
// Every endpoint that checks a credential it was handed must be listed here.
// security.controller answers a wrong PIN or a wrong current password with 401
// (setPin, removePin, verifyPin and changePassword all do), which is not an
// expired session: treating it as one signed the user out on a single mistyped
// digit, and made the lockout in verifyPin unreachable — it can only count
// attempts the user is still around to make.
const CREDENTIAL_ENDPOINTS = [
  '/auth/login',
  '/auth/register',
  // Prefix: covers GET/PUT/DELETE /security/pin and POST /security/pin/verify
  '/security/pin',
  '/security/password',
]

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url ?? ''
    const isCredentialCheck = CREDENTIAL_ENDPOINTS.some(path => url.includes(path))

    if (error.response?.status === 401 && !isCredentialCheck) {
      localStorage.removeItem('somatrack_token')
      // The persisted store too. The redirect below is a full page load, so
      // zustand rebuilds from storage; leaving this behind kept the profile —
      // email, date of birth, weight, height — readable after a sign-out the
      // user did not ask for. logout() clears it on the normal path, but this
      // one never reaches the store.
      localStorage.removeItem('somatrack_auth')
      // The in-progress workout is now persisted too; it belongs to the account
      // being signed out, not to whoever signs in next on this device.
      localStorage.removeItem('somatrack_workout')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api