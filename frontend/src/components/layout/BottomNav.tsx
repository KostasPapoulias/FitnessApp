import { useNavigate, useLocation } from 'react-router-dom'
import { useWorkoutStore } from '../../store/useWorkoutStore'

export default function BottomNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const { activeSession, selectedExercises } = useWorkoutStore()

  const isActive = (path: string) => location.pathname === path

  // Center button state
  const centerButton = () => {
    if (activeSession) {
      return { label: 'Live ●', path: '/workout/active', bg: 'bg-brand-red' }
    }
    if (selectedExercises.length > 0) {
      return { label: `Start (${selectedExercises.length})`, path: '/workout/active', bg: 'bg-brand-teal' }
    }
    return { label: 'Plan', path: '/workout/browse', bg: 'bg-brand-teal' }
  }

  const center = centerButton()

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] 
                    bg-dark-800 border-t border-dark-600 px-4 pb-2 pt-3
                    flex items-center justify-around z-50">

      {/* Home */}
      <NavBtn
        icon={<HomeIcon />}
        label="Home"
        active={isActive('/')}
        onClick={() => navigate('/')}
      />

      {/* Calendar */}
      <NavBtn
        icon={<CalendarIcon />}
        label="Calendar"
        active={isActive('/calendar')}
        onClick={() => navigate('/calendar')}
      />

      {/* Center — context aware */}
      <button
        onClick={() => navigate(center.path)}
        className="flex flex-col items-center gap-1 -mt-4"
      >
        <div className={`w-14 h-14 ${center.bg} rounded-full flex items-center 
                        justify-center shadow-lg active:scale-95 transition-transform
                        ${activeSession ? 'animate-pulse' : ''}`}>
          {activeSession
            ? <PlayIcon className="text-white w-5 h-5" />
            : <DumbbellIcon className="text-black w-5 h-5" />
          }
        </div>
        <span className={`text-[9px] font-semibold
                         ${activeSession ? 'text-brand-red' : 'text-brand-teal'}`}>
          {center.label}
        </span>
      </button>

      {/* AI Chat */}
      <NavBtn
        icon={<ChatIcon />}
        label="AI Chat"
        active={isActive('/ai')}
        onClick={() => navigate('/ai')}
      />

      {/* Profile */}
      <NavBtn
        icon={<ProfileIcon />}
        label="Profile"
        active={isActive('/profile')}
        onClick={() => navigate('/profile')}
      />
    </nav>
  )
}

// Reusable nav button
function NavBtn({ icon, label, active, onClick }: {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 active:scale-95 transition-transform"
    >
      <div className={active ? 'text-brand-teal' : 'text-dark-300'}>
        {icon}
      </div>
      <span className={`text-[9px] ${active ? 'text-brand-teal' : 'text-dark-300'}`}>
        {label}
      </span>
    </button>
  )
}

// SVG Icons — inline so no extra library needed
const HomeIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
)

const CalendarIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8">
    <rect x="3" y="4" width="18" height="18" rx="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
)

const DumbbellIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="22" height="22" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M6 4v16M18 4v16M4 8h4M16 8h4M4 16h4M16 16h4"/>
  </svg>
)

const PlayIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="22" height="22" viewBox="0 0 24 24"
    fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3"/>
  </svg>
)

const ChatIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
)

const ProfileIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
)