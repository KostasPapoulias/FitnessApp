/**
 * What the app shows while it works out which screen it owes you.
 *
 * The launch used to render its guesses in sequence — login, then the app, then
 * the PIN pad — because each answer arrived separately and each one repainted.
 * Holding a single neutral screen until every answer is in costs a few hundred
 * milliseconds and removes all of that.
 *
 * The animated version of this screen is NOT here: it is in `index.html`, so it
 * can paint before the bundle has even downloaded. By the time this component
 * mounts, that node is already on screen and covering it, and `dismissBoot()`
 * fades it out when the launch resolves. Re-rendering the same visual in React
 * would restart the entrance and read as the logo popping twice.
 *
 * So this is the understudy. It only becomes visible if the boot node is gone
 * while the app is still deciding, and it deliberately has no entrance
 * animation — it is covering a gap, not announcing itself.
 */
export default function Splash() {
  return (
    <div className="fixed inset-0 bg-dark-900 flex flex-col items-center justify-center">
      <div className="relative w-44 h-44 flex items-center justify-center">
        <div
          className="absolute w-44 h-44 rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(0,212,170,0.26) 0%, rgba(0,212,170,0.08) 42%, rgba(0,212,170,0) 70%)',
          }}
        />
        <img src="/logo-mark.png" alt="SomaTrack" className="relative h-auto" style={{ width: 104 }} />
      </div>
      <p className="mt-[22px] text-[10px] leading-none tracking-[0.38em] indent-[0.38em] text-dark-300 uppercase">
        SomaTrack
      </p>
    </div>
  )
}
