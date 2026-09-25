import { useEffect, useState } from 'react'

// Anything smaller than this is browser chrome (collapsing URL bar), not a keyboard.
const KEYBOARD_MIN_HEIGHT = 80

/**
 * Height (px) the on-screen keyboard covers, from visualViewport; 0 when closed.
 * Reports 0 on Android WebView with adjustResize, where the OS resizes the layout itself.
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
