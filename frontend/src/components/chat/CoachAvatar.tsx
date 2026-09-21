import coachAvatar from '../../assets/coach-avatar.png'

/**
 * The coach's face, wherever the chat needs one.
 *
 * One component rather than an <img> repeated at five call sites: the avatar
 * appears in the header, in the empty state, on every assistant bubble and on
 * the typing indicator, and those drifting apart is how one of them ends up
 * still showing the old emoji.
 *
 * Decorative, so it is hidden from screen readers — every place it appears
 * already has the words "AI Coach" or the assistant's own message beside it,
 * and an alt text here would only repeat them.
 */
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
