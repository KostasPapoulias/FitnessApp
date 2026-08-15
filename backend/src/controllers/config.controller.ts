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
 * route line is unreadable next to the rest of the UI.
 *
 * NOT `dataviz-dark`, which this used to default to and which is why the map
 * looked like a black rectangle with the tiles loading perfectly well. That
 * style paints its background at hsl(0,0%,16%) and its roads at 16%, 17% and
 * 20% of the same hue — it is built as a neutral base for a data overlay to sit
 * on, so rendering almost nothing visible is the point of it. On a 190px map on
 * a phone it is indistinguishable from a failure, and it produces no error to
 * say otherwise.
 *
 * `streets-v2-dark` is dark enough to sit in this UI and still has contrast:
 * a blue-grey ground with roads at 33% and water at 52%, so a run through a
 * neighbourhood reads as a run through a neighbourhood.
 *
 * If MAPTILER_STYLE is set in the environment it wins — but check what it is
 * before blaming the map for being empty.
 */
const MAP_STYLE = process.env.MAPTILER_STYLE || 'streets-v2-dark'

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
      // Echoed so an empty-looking map can name the style it drew. A basemap
      // that renders nothing and a basemap that failed to load look the same
      // on a phone, and this is the cheapest way to tell them apart.
      style: MAP_STYLE,
    },
  })
}
