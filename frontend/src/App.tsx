import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from './store/useAuthStore'

// Pages
import Login from './pages/Login'
import Register from './pages/Register'
import Home from './pages/Home'
import Calendar from './pages/Calendar'
import AIChat from './pages/AIChat'
import AIChatHub from './pages/AIChatHub'
import Profile from './pages/Profile'
import BrowseCategories from './pages/Workout/BrowseCategories'
import ExerciseList from './pages/Workout/ExerciseList'
import ActiveWorkout from './pages/Workout/ActiveWorkout'
import PlanSets from './pages/Workout/PlanSets'
// Layout
import AppLayout from './components/layout/AppLayout'
import StartWorkout from './pages/Workout/StartWorkout'
import ExerciseDetail from './pages/Workout/ExerciseDetail'
import { useNotifications } from './hooks/useNotifcations'
import { Capacitor } from '@capacitor/core'
// Protected route wrapper
const Protected = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuthStore()
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  const { fetchMe, isAuthenticated } = useAuthStore()
  const { requestPermission, scheduleInactivityReminder, notifyReminder } = useNotifications()

  // On app load, verify token is still valid
  useEffect(() => {
    const token = localStorage.getItem('somatrack_token')
    if (token) fetchMe()
  }, [])
  useEffect(() => {
      if (isAuthenticated) {
        requestPermission().then((granted) => {
          if (granted) scheduleInactivityReminder(3)
        })
      }

    }, [isAuthenticated])

  // Recurring reminder every minute while logged in, desktop/mobile web only (not the native app)
  useEffect(() => {
    if (!isAuthenticated || Capacitor.isNativePlatform()) return

    const interval = setInterval(() => {
      notifyReminder()
    }, 60_000)

    return () => clearInterval(interval)
  }, [isAuthenticated])

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
          <Route path="workout/start" element={<StartWorkout />} />
          <Route path="workout/browse" element={<BrowseCategories />} />
          <Route path="workout/exercises" element={<ExerciseList />} />
          <Route path="exercise-detail" element={<ExerciseDetail />} />
          <Route path="workout/active" element={<ActiveWorkout />} />
          <Route path="ai" element={<AIChatHub />} />
          <Route path="ai/chat/:threadId" element={<AIChat />} />
          <Route path="profile" element={<Profile />} />
          <Route path="workout/plan" element={<PlanSets />} />
        </Route>

        {/* Catch all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}