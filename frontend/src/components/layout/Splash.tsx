/**
 * What the app shows while it works out which screen it owes you.
 *
 * The launch used to render its guesses in sequence — login, then the app, then
 * the PIN pad — because each answer arrived separately and each one repainted.
 * Holding a single neutral screen until every answer is in costs a few hundred
 * milliseconds and removes all of that.
 *
 * The mark fades in on a delay rather than immediately: a fast launch should
 * look like the app opening straight into itself, and only a launch slow enough
 * to feel like waiting should admit that anything is loading.
 */
export default function Splash() {
  return (
    <div className="fixed inset-0 bg-dark-900 flex items-center justify-center">
      <div className="flex flex-col items-center opacity-0 animate-[splashIn_0.5s_ease-out_0.45s_forwards]">
        <div className="w-11 h-11 rounded-2xl bg-brand-teal/15 border border-brand-teal/40
                        flex items-center justify-center text-xl">
          🧬
        </div>
        <p className="mt-3 text-[10px] tracking-[0.35em] text-dark-400 uppercase">
          Somatrack
        </p>
      </div>

      <style>{`
        @keyframes splashIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes splashIn { from { opacity: 0; } to { opacity: 1; } }
        }
      `}</style>
    </div>
  )
}
