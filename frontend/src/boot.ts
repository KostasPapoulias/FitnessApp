/**
 * Dismissal of the boot screen that `index.html` paints before React exists.
 *
 * The markup and the animation live in the HTML precisely because they have to
 * be on screen before any of this module has been downloaded. All React owns is
 * when it goes away.
 */

/**
 * Shortest time the boot screen stays up, measured from page load — not from
 * when React got around to asking.
 *
 * The entrance runs to ~700ms and the wordmark settles at ~1020ms, so anything
 * shorter cuts the animation off mid-pop, and a launch that resolves instantly
 * (signed out, nothing to revalidate) would otherwise flash the mark for two
 * frames. Measuring from load rather than from mount means a slow bundle eats
 * the floor instead of adding to it: the screen is held for `max(floor, however
 * long the launch actually took)`, never floor + launch.
 */
const MIN_BOOT_MS = 1150

/** Must match the `transition: opacity` on `#boot` in index.html. */
const FADE_MS = 320

let dismissed = false

/**
 * Fade out the boot screen and remove it.
 *
 * Safe to call repeatedly and safe to call when the node is already gone — the
 * launch gate in `App` re-evaluates on every render and there is no useful
 * guarantee about how many times it lands on "done".
 */
export function dismissBoot(): void {
  if (dismissed) return
  dismissed = true

  const hold = Math.max(0, MIN_BOOT_MS - performance.now())

  window.setTimeout(() => {
    const el = document.getElementById('boot')
    if (!el) return

    el.classList.add('boot-done')
    // Removed rather than left hidden: it is a fixed, full-viewport node above
    // everything, and an opacity-0 overlay that forgot to drop pointer events
    // is a whole class of "the app does not respond to taps" bug.
    window.setTimeout(() => el.remove(), FADE_MS + 20)
  }, hold)
}
