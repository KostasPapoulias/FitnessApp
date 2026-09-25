import coachAvatar from '../../assets/coach-avatar.png'

/** The coach's avatar, used everywhere the chat shows one. Decorative (hidden from screen readers). */
export default function CoachAvatar({ className = 'w-9 h-9' }: { className?: string }) {
  return (
    <img
      src={coachAvatar}
      alt=""
      aria-hidden="true"
      className={`${className} rounded-full object-cover border border-brand-teal/40 flex-shrink-0`}
    />
  )
}
