/** Dismisses the boot screen that index.html paints before React loads. */

/**
 * Minimum time the boot screen stays up, measured from page load, so the
 * entrance animation is never cut short.
 */
const MIN_BOOT_MS = 1150

/** Must match the `transition: opacity` on `#boot` in index.html. */
const FADE_MS = 320

let dismissed = false

/** Fade out and remove the boot screen. Safe to call repeatedly. */
export function dismissBoot(): void {
  if (dismissed) return
  dismissed = true

  const hold = Math.max(0, MIN_BOOT_MS - performance.now())

  window.setTimeout(() => {
    const el = document.getElementById('boot')
    if (!el) return

    el.classList.add('boot-done')
    // Removed, not just hidden, so it can never block taps
    window.setTimeout(() => el.remove(), FADE_MS + 20)
  }, hold)
}
