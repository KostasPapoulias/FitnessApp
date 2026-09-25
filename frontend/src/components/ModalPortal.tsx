import { ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Renders a modal into <body>. `<main>` is a stacking context (it has a
 * transform), so a sheet inside it could never paint above BottomNav whatever
 * its z-index. React events still bubble through the React tree.
 */
export default function ModalPortal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body)
}
