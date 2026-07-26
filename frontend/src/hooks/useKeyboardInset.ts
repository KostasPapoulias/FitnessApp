import { useEffect, useState } from 'react'

// Anything smaller than this is browser chrome (collapsing URL bar), not a keyboard.
const KEYBOARD_MIN_HEIGHT = 80

/**
 * Height in px that the on-screen keyboard covers at the bottom of the viewport.
 * 0 when the keyboard is closed.
 *
 * Uses visualViewport: the layout viewport keeps its full height while the
 * visual viewport shrinks, so the difference is the keyboard. This lets us
 * lift only the elements we choose instead of the whole page — the bottom nav
 * can stay pinned and get covered.
 *
 * Note: on Android WebView with the default adjustResize behaviour the OS
 * shrinks the layout viewport itself, so this reports 0 and the nav gets
 * pushed up with everything else.
 */
export const useKeyboardInset = () => {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const update = () => {
      const covered = window.innerHeight - (vv.height + vv.offsetTop)
      setInset(covered > KEYBOARD_MIN_HEIGHT ? Math.round(covered) : 0)
    }

    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)

    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  return inset
}
