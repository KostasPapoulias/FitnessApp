// Shared shell dimensions. Kept in one place so fixed-position overlays
// (chat header/input) line up with the nav they have to avoid.

/** Desktop sidebar width — must match `w-72` on the <aside> in BottomNav. */
export const SIDEBAR_WIDTH = 288

/**
 * Fallback only. BottomNav measures itself and publishes `--bottom-nav-h`;
 * this is what's used before that lands (and if the nav isn't mounted).
 */
export const BOTTOM_NAV_HEIGHT = 78

/** Phone shell max width — must match `max-w-[430px]` in AppLayout. */
export const PHONE_MAX_WIDTH = 430
