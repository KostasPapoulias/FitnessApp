import { Response } from 'express'
import { AuthRequest } from '../server'

/**
 * Map configuration served at runtime so the MapTiler key is not in the JS
 * bundle and can be rotated without a frontend deploy. The real quota
 * protection is MapTiler's allowed-origins setting.
 *
 * Default style is `streets-v2-dark`; `dataviz-dark` renders near-black and
 * looks like a broken map. MAPTILER_STYLE overrides it.
 */
const MAP_STYLE = process.env.MAPTILER_STYLE || 'streets-v2-dark'

// GET /api/config/map
export const getMapConfig = async (_req: AuthRequest, res: Response): Promise<void> => {
  const key = process.env.MAPTILER_API_KEY

  if (!key) {
    // The client falls back to tracking without a basemap
    res.status(503).json({
      success: false,
      error: 'Maps are not configured on the server.',
    })
    return
  }

  res.json({
    success: true,
    data: {
      styleUrl: `https://api.maptiler.com/maps/${MAP_STYLE}/style.json?key=${key}`,
      // Echoed so an empty-looking map can report which style it drew
      style: MAP_STYLE,
    },
  })
}
