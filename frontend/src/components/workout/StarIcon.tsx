/**
 * The favourite star, in its two states.
 *
 * Shared rather than declared per screen — which is the local convention for
 * icons — because this one carries meaning and the two states have to be
 * distinguishable from each other, not merely present. ExerciseDetail sets a
 * star, ExerciseList filters by it, and a star that looked filled on one screen
 * and outlined on the other would read as the state not having saved.
 *
 * Colour is the caller's job (`currentColor`); this only decides fill.
 */
export default function StarIcon({ filled, size = 23 }: { filled: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.4l2.6 5.3 5.8.85-4.2 4.1 1 5.75L12 16.7l-5.2 2.7 1-5.75-4.2-4.1 5.8-.85z" />
    </svg>
  )
}
