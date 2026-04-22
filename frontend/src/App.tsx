import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from './store/useAuthStore'

// Pages
import Login from './pages/Login'
import Register from './pages/Register'
import Home from './pages/Home'
import Calendar from './pages/Calendar'
import AIChat from './pages/AIChat'
import Profile from './pages/Profile'
import BrowseCategories from './pages/Workout/BrowseCategories'
import ExerciseList from './pages/Workout/ExerciseList'
import ActiveWorkout from './pages/Workout/ActiveWorkout'

// Layout
import AppLayout from './components/layout/AppLayout'

// Protected route wrapper
const Protected = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuthStore()
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  const { fetchMe, isAuthenticated } = useAuthStore()

  // On app load, verify token is still valid
  useEffect(() => {
    const token = localStorage.getItem('somatrack_token')
    if (token) fetchMe()
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={
          isAuthenticated ? <Navigate to="/" replace /> : <Login />
        } />
        <Route path="/register" element={
          isAuthenticated ? <Navigate to="/" replace /> : <Register />
        } />

        {/* Protected routes — all inside AppLayout (has BottomNav) */}
        <Route path="/" element={
          <Protected><AppLayout /></Protected>
        }>
          <Route index element={<Home />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="workout/browse" element={<BrowseCategories />} />
          <Route path="workout/exercises" element={<ExerciseList />} />
          <Route path="workout/active" element={<ActiveWorkout />} />
          <Route path="ai" element={<AIChat />} />
          <Route path="profile" element={<Profile />} />
        </Route>

        {/* Catch all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}