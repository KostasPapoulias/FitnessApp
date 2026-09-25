/**
 * The app's hand-drawn icon set: 24×24, no fill, 1.8 stroke, round caps.
 * Each takes `className` for size and colour and paints in `currentColor`.
 */

interface IconProps {
  className?: string
}

const Svg = ({ className = 'w-5 h-5', children }: IconProps & { children: React.ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
)

export const TrendingUpIcon = (props: IconProps) => (
  <Svg {...props}>
    <polyline points="3 17 9 11 13 15 21 7" />
    <polyline points="15 7 21 7 21 13" />
  </Svg>
)

export const HistoryListIcon = (props: IconProps) => (
  <Svg {...props}>
    <rect x="8" y="2" width="8" height="4" rx="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <path d="M9 12h6M9 16h4" />
  </Svg>
)

export const UserIcon = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
  </Svg>
)

/** Matches the bottom nav's centre button. */
export const DumbbellIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M6 4v16M18 4v16M4 8h4M16 8h4M4 16h4M16 16h4" />
  </Svg>
)

export const MoonIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </Svg>
)

/** Nutrition: a bowl with a leaf. */
export const NutritionIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M3 12h18a9 9 0 0 1-18 0z" />
    <path d="M12 9c0-2.5 2-4.5 4.5-4.5C16.5 7 14.5 9 12 9z" />
  </Svg>
)

export const RulerIcon = (props: IconProps) => (
  <Svg {...props}>
    <rect x="2" y="8" width="20" height="8" rx="1.5" />
    <path d="M6 8v3M10 8v4M14 8v3M18 8v4" />
  </Svg>
)

export const GlobeIcon = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z" />
  </Svg>
)

export const BellIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
  </Svg>
)

export const LockIcon = (props: IconProps) => (
  <Svg {...props}>
    <rect x="3.5" y="11" width="17" height="10" rx="2" />
    <path d="M7.5 11V7a4.5 4.5 0 0 1 9 0v4" />
  </Svg>
)

/** Download / export. */
export const DownloadIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 3v12" />
    <polyline points="7 10 12 15 17 10" />
    <path d="M5 20h14" />
  </Svg>
)

export const TrashIcon = (props: IconProps) => (
  <Svg {...props}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </Svg>
)

export const AlertTriangleIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </Svg>
)

export const MicIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <path d="M12 18v3" />
  </Svg>
)

/** Microphone with a line through it. */
export const MicOffIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M9 9v3a3 3 0 0 0 5.1 2.1M15 12V6a3 3 0 0 0-5.9-.8" />
    <path d="M5 11a7 7 0 0 0 10.3 6.2M19 11a7 7 0 0 1-.6 2.8" />
    <path d="M12 18v3" />
    <path d="M3 3l18 18" />
  </Svg>
)

export const FlagIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M5 21V4" />
    <path d="M5 4h12l-2.5 4L17 12H5" />
  </Svg>
)

export const ListIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M8 6h13M8 12h13M8 18h13" />
    <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
  </Svg>
)

export const NoteIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 5a2 2 0 0 1 2-2h8l6 6v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
    <path d="M14 3v6h6" />
    <path d="M8 13h7M8 17h5" />
  </Svg>
)

export const PencilIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
    <path d="M13.5 6.5l4 4" />
  </Svg>
)

export const VibrateIcon = (props: IconProps) => (
  <Svg {...props}>
    <rect x="8" y="3" width="8" height="18" rx="1.5" />
    <path d="M4 8v8M20 8v8" />
  </Svg>
)

export const SpeakerIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 9v6h4l5 4V5L8 9H4z" />
    <path d="M17 8a5 5 0 0 1 0 8" />
  </Svg>
)

/** The AI mark — four-pointed so it never reads as a favourite star. */
export const SparkleIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 3c.6 4.2 1.8 5.4 6 6-4.2.6-5.4 1.8-6 6-.6-4.2-1.8-5.4-6-6 4.2-.6 5.4-1.8 6-6z" />
  </Svg>
)

export const TargetIcon = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="12" cy="12" r="0.5" />
  </Svg>
)

export const SearchIcon = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="m16.2 16.2 4.3 4.3" />
  </Svg>
)

export const LightbulbIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M9 18h6" />
    <path d="M10 21h4" />
    <path d="M12 3a6 6 0 0 1 3.6 10.8c-.6.5-.9 1.1-1 1.7l-.1.5h-5l-.1-.5c-.1-.6-.4-1.2-1-1.7A6 6 0 0 1 12 3z" />
  </Svg>
)

export const WifiOffIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M3 3l18 18" />
    <path d="M12 18h.01" />
    <path d="M8.5 14.5a5 5 0 0 1 6 0" />
    <path d="M5 11a10 10 0 0 1 3.5-2.3M19 11a10 10 0 0 0-8.6-2.8" />
  </Svg>
)

export const TrophyIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M7 4h10v6a5 5 0 0 1-10 0z" />
    <path d="M7 6H4.5A2.5 2.5 0 0 0 7 9M17 6h2.5A2.5 2.5 0 0 1 17 9" />
    <path d="M12 15v3" />
    <path d="M8.5 21h7l-1-3h-5z" />
  </Svg>
)

export const BarChartIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 20V10M10 20V4M16 20v-7M21 20H3" />
  </Svg>
)

/** A modality's mark, used everywhere a session type is shown. */
export const ModalityIcon = (
  { modality, className = 'w-5 h-5' }: IconProps & { modality: string }
) => {
  switch (modality) {
    case 'Calisthenics':
      return (
        <Svg className={className}>
          <circle cx="12" cy="5" r="2" />
          <path d="M12 7v6M6 10h12M12 13l-4 6M12 13l4 6" />
        </Svg>
      )
    case 'Cardio':
      return (
        <Svg className={className}>
          <path d="M3 12h4l2-6 3.5 12L15 9l2 3h4" />
        </Svg>
      )
    case 'Mobility':
      return (
        <Svg className={className}>
          <circle cx="12" cy="4" r="2" />
          <path d="M12 6v5M12 11l-6 3M12 11l6 3M6 14l1 6M18 14l-1 6" />
        </Svg>
      )
    case 'WOD':
      return (
        <Svg className={className}>
          <path d="M13 2L5 13h6l-1 9 9-12h-6l1-8z" />
        </Svg>
      )
    default:
      return <DumbbellIcon className={className} />
  }
}

export const CalendarIcon = (props: IconProps) => (
  <Svg {...props}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M16 3v4M8 3v4M3 10h18" />
  </Svg>
)

export const FlameIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 3c3 3.5 4.5 6 4.5 8.5a4.5 4.5 0 0 1-9 0c0-1.2.4-2.3 1.2-3.4.6 1 1.3 1.6 2 1.9-.3-2.4.2-4.7 1.3-7z" />
    <path d="M12 21a6 6 0 0 0 6-6" />
  </Svg>
)

export const ZapIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M13 2L5 13h6l-1 9 9-12h-6l1-8z" />
  </Svg>
)

export const MessageIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </Svg>
)

export const SmartphoneIcon = (props: IconProps) => (
  <Svg {...props}>
    <rect x="6" y="2" width="12" height="20" rx="2.5" />
    <path d="M11 18h2" />
  </Svg>
)

export const ScaleIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 4v16" />
    <path d="M6 20h12" />
    <path d="M4 9h16" />
    <path d="M7 9l-3 6a3 3 0 0 0 6 0zM17 9l-3 6a3 3 0 0 0 6 0z" />
  </Svg>
)

export const CakeIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 21h16v-6a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3z" />
    <path d="M4 17h16" />
    <path d="M12 12V8M9 12V9M15 12V9" />
    <path d="M12 5.5V4M9 6V5M15 6V5" />
  </Svg>
)

export const KeyIcon = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="8" cy="15" r="4" />
    <path d="M10.8 12.2 20 3" />
    <path d="M17 6l2.5 2.5M15 8l2 2" />
  </Svg>
)

export const SignOutIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
    <path d="M15 17l5-5-5-5" />
    <path d="M20 12H9" />
  </Svg>
)

export const BuildingIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 21V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v17" />
    <path d="M15 9h4a1 1 0 0 1 1 1v11" />
    <path d="M7 7h2M7 11h2M7 15h2M11 7h1M11 11h1M11 15h1M17 13h1M17 17h1" />
    <path d="M3 21h18" />
  </Svg>
)

export const HouseIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
    <path d="M10 21v-6h4v6" />
  </Svg>
)

export const TreeIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 3 7 11h3l-3 5h10l-3-5h3z" />
    <path d="M12 16v5" />
  </Svg>
)

/** Filled star for a personal best. */
export const StarFilledIcon = ({ className = 'w-4 h-4' }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M12 3.4l2.6 5.3 5.8.85-4.2 4.1 1 5.75L12 16.7l-5.2 2.7 1-5.75-4.2-4.1 5.8-.85z" />
  </svg>
)
