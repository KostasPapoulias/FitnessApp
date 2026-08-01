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
import NotificationSettings from './pages/NotificationSettings'
import BrowseCategories from './pages/Workout/BrowseCategories'
import ExerciseList from './pages/Workout/ExerciseList'
import ActiveWorkout from './pages/Workout/ActiveWorkout'
import PlanSets from './pages/Workout/PlanSets'
import WorkoutQueue from './pages/Workout/WorkoutQueue'
import Finish from './pages/Workout/Finish'
import CardioPlan from './pages/Workout/CardioPlan'
import MobilityPlan from './pages/Workout/MobilityPlan'
import WodPlan from './pages/Workout/WodPlan'
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
  const { requestPermission, scheduleInactivityReminder, ensurePushSubscription } = useNotifications()

  // On app load, verify token is still valid
  useEffect(() => {
    const token = localStorage.getItem('somatrack_token')
    if (token) fetchMe()
  }, [])

  // Native only: the scheduled inactivity reminder is a Capacitor local
  // notification. On the web this used to fire requestPermission() on load,
  // outside any user gesture — iOS ignores that and it spends the one prompt
  // the app gets, so permission is now asked for by the Profile toggle instead.
  useEffect(() => {
    if (!isAuthenticated || !Capacitor.isNativePlatform()) return

    requestPermission().then((granted) => {
      if (granted) scheduleInactivityReminder(3)
    })
  }, [isAuthenticated])

  // Re-register this device's push subscription on launch. The server prunes an
  // endpoint as soon as it 410s while the browser keeps handing the same one
  // back, so without this the two drift apart and push dies silently.
  useEffect(() => {
    if (!isAuthenticated || Capacitor.isNativePlatform()) return
    ensurePushSubscription()
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
          <Route path="workout/queue" element={<WorkoutQueue />} />
          <Route path="workout/finish" element={<Finish />} />
          <Route path="ai" element={<AIChatHub />} />
          <Route path="ai/chat/:threadId" element={<AIChat />} />
          <Route path="profile" element={<Profile />} />
          <Route path="profile/notifications" element={<NotificationSettings />} />
          <Route path="workout/plan" element={<PlanSets />} />
          <Route path="workout/plan/cardio" element={<CardioPlan />} />
          <Route path="workout/plan/mobility" element={<MobilityPlan />} />
          <Route path="workout/plan/wod" element={<WodPlan />} />
        </Route>

        {/* Catch all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}