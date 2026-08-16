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
import Plans from './pages/Plans'
import Profile from './pages/Profile'
import Onboarding from './pages/Onboarding'
import TrainingSetup from './pages/TrainingSetup'
import NotificationSettings from './pages/NotificationSettings'
import SecuritySettings from './pages/SecuritySettings'
import BrowseCategories from './pages/Workout/BrowseCategories'
import ExerciseList from './pages/Workout/ExerciseList'
import CreateExercise from './pages/Workout/CreateExercise'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import ActiveWorkout from './pages/Workout/ActiveWorkout'
import PlanSets from './pages/Workout/PlanSets'
import WorkoutQueue from './pages/Workout/WorkoutQueue'
import Finish from './pages/Workout/Finish'
import CardioPlan from './pages/Workout/CardioPlan'
import MobilityPlan from './pages/Workout/MobilityPlan'
import WodPlan from './pages/Workout/WodPlan'
// Layout
import AppLayout from './components/layout/AppLayout'
import Splash from './components/layout/Splash'
import StartWorkout from './pages/Workout/StartWorkout'
import ExerciseDetail from './pages/Workout/ExerciseDetail'
import { useNotifications } from './hooks/useNotifcations'
import { Capacitor } from '@capacitor/core'
import PinLock from './components/security/PinLock'
import { useAppLock } from './hooks/useAppLock'
// Protected route wrapper
//
// Two gates, in order. Unauthenticated users go to /login; authenticated users
// who have never answered the required onboarding questions go to /onboarding.
//
// The second gate applies to EXISTING accounts too, deliberately. Until a user
// records a bodyweight, calisthenics load is scored against a hardcoded 70 kg —
// grandfathering old accounts past this would keep that wrong number in their
// history indefinitely.
const Protected = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, user } = useAuthStore()

  if (!isAuthenticated) return <Navigate to="/login" replace />

  // `user` is briefly null on a cold load while fetchMe resolves. Redirecting
  // on that would bounce already-onboarded users through the form on every
  // launch, so an unknown profile waits rather than guesses.
  if (user && !user.profile?.onboardingCompletedAt) {
    return <Navigate to="/onboarding" replace />
  }

  return <>{children}</>
}

export default function App() {
  const { fetchMe, isAuthenticated, isBootstrapping, user } = useAuthStore()
  const { requestPermission, scheduleInactivityReminder, ensurePushSubscription } = useNotifications()
  const { locked, checked: lockChecked, unlock } = useAppLock(isAuthenticated)

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

  // Order matters, and this is the whole fix for the launch flicker.
  //
  // The PIN pad goes first and does not wait for the server: `useAppLock`
  // believes a device-local flag on the first frame, so a locked phone opens
  // straight onto the pad instead of onto a slice of the app that a lock then
  // drops over. Rendered before the router, so no screen — and no data on it —
  // is ever visible behind it.
  //
  // Then the splash, which covers the gap where the app knows there is a token
  // but not yet whether it is still good or whether this device is locked.
  // Rendering the router during that window is what put Login on screen for a
  // moment before bouncing a perfectly signed-in user back into the app.
  if (locked) return <PinLock onUnlock={unlock} />
  if (isBootstrapping || (isAuthenticated && !lockChecked)) return <Splash />

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

        {/* Password recovery. Reachable while signed in as well as signed out:
            the link arrives by email and may well be opened on a device that
            still has a live session, and bouncing that to Home leaves the
            person holding a link they cannot use. */}
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Authenticated but pre-onboarding. Outside AppLayout on purpose —
            the bottom nav would offer escape routes past a gate whose whole
            job is to not be escapable. */}
        <Route path="/onboarding" element={
          !isAuthenticated
            ? <Navigate to="/login" replace />
            : user?.profile?.onboardingCompletedAt
              ? <Navigate to="/" replace />
              : <Onboarding />
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
          <Route path="workout/exercises/new" element={<CreateExercise />} />
          <Route path="exercise-detail" element={<ExerciseDetail />} />
          <Route path="workout/active" element={<ActiveWorkout />} />
          <Route path="workout/queue" element={<WorkoutQueue />} />
          <Route path="workout/finish" element={<Finish />} />
          <Route path="ai" element={<AIChatHub />} />
          <Route path="ai/chat/:threadId" element={<AIChat />} />
          <Route path="profile" element={<Profile />} />
          <Route path="training-setup" element={<TrainingSetup />} />
          <Route path="profile/notifications" element={<NotificationSettings />} />
          <Route path="profile/security" element={<SecuritySettings />} />
          <Route path="plans" element={<Plans />} />
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