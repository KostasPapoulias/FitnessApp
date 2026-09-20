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
  // Every message the server writes back — errors, the sleep note — is in
  // this language. Read per request, so a switch applies to the next call.
  // Always set, even for English: left alone the browser sends its own, and a
  // Greek phone would get Greek errors under an English screen.
  config.headers['Accept-Language'] = useLocaleStore.getState().locale
  return config
})

// Handle 401 — redirect to login if token expired.
//
// Sign-in and registration are excluded: those endpoints answer 401 for a wrong
// password, and reloading the page on that answer threw away the error message
// the form was about to show, so a failed sign-in looked like a button that did
// nothing at all.
const CREDENTIAL_ENDPOINTS = ['/auth/login', '/auth/register']

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url ?? ''
    const isCredentialCheck = CREDENTIAL_ENDPOINTS.some(path => url.includes(path))

    if (error.response?.status === 401 && !isCredentialCheck) {
      localStorage.removeItem('somatrack_token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api