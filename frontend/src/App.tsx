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
import Progress from './pages/Progress'
import History from './pages/History'
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
import QuickLog from './pages/Workout/QuickLog'
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
import { dismissBoot } from './boot'
// Protected route: signed-out users go to /login; users without completed
// onboarding (existing accounts too) go to /onboarding.
const Protected = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, user } = useAuthStore()

  if (!isAuthenticated) return <Navigate to="/login" replace />

  // `user` is briefly null on launch — wait rather than redirect
  if (user && !user.profile?.onboardingCompletedAt) {
    return <Navigate to="/onboarding" replace />
  }

  return <>{children}</>
}

export default function App() {
  const { fetchMe, isAuthenticated, isBootstrapping, user } = useAuthStore()
  const { requestPermission, scheduleInactivityReminder, ensurePushSubscription } = useNotifications()
  const { locked, checked: lockChecked, unlock } = useAppLock(isAuthenticated)

  // Verify the stored token on launch
  useEffect(() => {
    const token = localStorage.getItem('somatrack_token')
    if (token) fetchMe()
  }, [])

  // Native only: schedule the inactivity reminder (on the web, permission is
  // asked from the Profile toggle, inside a gesture)
  useEffect(() => {
    if (!isAuthenticated || !Capacitor.isNativePlatform()) return

    requestPermission().then((granted) => {
      if (granted) scheduleInactivityReminder(3)
    })
  }, [isAuthenticated])

  // Re-register the push subscription on launch, in case the server pruned it
  useEffect(() => {
    if (!isAuthenticated || Capacitor.isNativePlatform()) return
    ensurePushSubscription()
  }, [isAuthenticated])

  // Launch checks that decide the first screen: token validity and the PIN lock.
  const settling = isBootstrapping || (isAuthenticated && !lockChecked)

  // Dismiss the boot screen once they resolve (the only place it is removed;
  // dismissBoot enforces a minimum display time)
  useEffect(() => {
    if (!settling) dismissBoot()
  }, [settling])

  // Launch order: the PIN pad first (trusting the device-local flag, so nothing
  // shows behind it), then the splash until the checks settle, then the router.
  if (locked) return <PinLock onUnlock={unlock} />
  if (settling) return <Splash />

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

        {/* Password recovery — available signed in or out (the link may open anywhere) */}
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Onboarding, outside AppLayout so the nav offers no way around the gate */}
        <Route path="/onboarding" element={
          !isAuthenticated
            ? <Navigate to="/login" replace />
            : user?.profile?.onboardingCompletedAt
              ? <Navigate to="/" replace />
              : <Onboarding />
        } />

        {/* Protected routes, inside AppLayout */}
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
          <Route path="workout/log" element={<QuickLog />} />
          <Route path="workout/finish" element={<Finish />} />
          <Route path="ai" element={<AIChatHub />} />
          <Route path="ai/chat/:threadId" element={<AIChat />} />
          <Route path="profile" element={<Profile />} />
          <Route path="progress" element={<Progress />} />
          <Route path="history" element={<History />} />
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