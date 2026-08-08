import { Response } from 'express'
import { AuthRequest } from '../server'

/**
 * Client configuration that must not be baked into the frontend bundle.
 *
 * A map tile key is not a secret — it travels in the query string of every tile
 * request the browser makes, so it is visible in devtools no matter how it is
 * delivered. What this does buy:
 *
 *   - it is not readable by anyone who simply downloads the JS bundle, which is
 *     where scrapers look first
 *   - it can be rotated by changing one Railway variable, with no Netlify
 *     rebuild and no redeploy of the frontend
 *
 * The control that actually protects the quota is MapTiler's allowed-origins
 * setting. Restrict the key to the app's own domains and a leaked key is
 * useless to anyone else.
 */

/**
 * Dark by default — the app has no light theme, and a bright basemap under a
 * route line is unreadable next to the rest of the UI. `dataviz-dark` is the
 * quieter of MapTiler's dark styles: fewer labels and POIs competing with the
 * one line that matters.
 */
const MAP_STYLE = process.env.MAPTILER_STYLE || 'dataviz-dark'

// GET /api/config/map
export const getMapConfig = async (_req: AuthRequest, res: Response): Promise<void> => {
  const key = process.env.MAPTILER_API_KEY

  if (!key) {
    // Not an error the user can act on, and not a reason to fail a workout —
    // the caller falls back to tracking without a basemap.
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
    },
  })
}
