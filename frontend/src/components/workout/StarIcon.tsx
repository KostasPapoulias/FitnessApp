/** The favourite star, filled or outlined. Shared so both states look the same everywhere; colour comes from `currentColor`. */
export default function StarIcon({ filled, size = 23 }: { filled: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.4l2.6 5.3 5.8.85-4.2 4.1 1 5.75L12 16.7l-5.2 2.7 1-5.75-4.2-4.1 5.8-.85z" />
    </svg>
  )
}
