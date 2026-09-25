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
// endpoints, where 401 just means a wrong password.
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