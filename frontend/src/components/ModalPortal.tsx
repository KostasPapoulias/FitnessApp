import { ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Renders a modal into <body>, outside AppLayout's `<main>`.
 *
 * Every sheet in the app is already `z-[60]` against BottomNav's `z-50`, per
 * the rule in CLAUDE.md, and it was not enough: `<main>` carries an inline
 * `transform`/`transition` for the page swipe, which makes it a stacking
 * context. A z-index inside one is only ever compared with its siblings, so
 * `z-[60]` was competing with the rest of the page rather than with the nav —
 * and the nav, a sibling of the whole shell, painted over every sheet that
 * rises from the bottom edge. Save buttons, the pace plan's Done, the sets
 * sheet's footer: all of them sat under it, which is exactly the bug the
 * z-index was supposed to have fixed.
 *
 * Out here the sheet is a sibling of the nav and `z-[60]` means what it says.
 * Nothing else about a sheet changes — React events still bubble through the
 * React tree, so handlers on ancestors (AppLayout's swipe, for one) still see
 * them, and `data-no-page-swipe` on the root is still what opts a modal out.
 */
export default function ModalPortal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body)
}
