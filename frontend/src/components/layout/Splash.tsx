/**
 * Neutral screen while the launch checks resolve. The animated splash lives in
 * index.html (it paints before the bundle loads); this only shows if that node
 * is gone while the app is still deciding, so it has no entrance animation.
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
