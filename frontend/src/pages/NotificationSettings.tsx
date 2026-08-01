import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../hooks/useNotifcations'
import {
  NOTIFICATION_CATALOGUE,
  NotificationPreferences,
  NotificationRecord,
  deviceTimezone,
  notificationService,
} from '../services/notification.service'

function Toggle({ value, onChange, disabled }: {
  value: boolean; onChange: (v: boolean) => void; disabled?: boolean
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      className={`w-10 h-6 rounded-full flex items-center px-0.5 shrink-0
                 transition-all duration-200 disabled:opacity-40
                 ${value ? 'bg-brand-teal justify-end' : 'bg-dark-600 justify-start'}`}
    >
      <div className="w-5 h-5 bg-white rounded-full shadow" />
    </button>
  )
}

function Section({ title, subtitle, children }: {
  title: string; subtitle?: string; children: React.ReactNode
}) {
  return (
    <div className="mb-5">
      <p className="text-dark-300 text-xs uppercase tracking-wider px-1 mb-2">{title}</p>
      {subtitle && <p className="text-dark-400 text-[11.5px] px-1 mb-2 leading-relaxed">{subtitle}</p>}
      <div className="bg-dark-800 rounded-card border border-dark-600 overflow-hidden">
        {children}
      </div>
    </div>
  )
}

function Row({ icon, label, description, right, dim }: {
  icon?: string; label: string; description?: string
  right?: React.ReactNode; dim?: boolean
}) {
  return (
    <div className={`flex items-center gap-3 px-3.5 py-3 ${dim ? 'opacity-45' : ''}`}>
      {icon && <span className="text-lg shrink-0">{icon}</span>}
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium">{label}</p>
        {description && (
          <p className="text-dark-300 text-[11.5px] leading-snug mt-0.5">{description}</p>
        )}
      </div>
      {right}
    </div>
  )
}

const Divider = () => <div className="h-px bg-dark-700 mx-3.5" />

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const fmtHour = (h: number) => `${String(h).padStart(2, '0')}:00`

export default function NotificationSettings() {
  const navigate = useNavigate()
  const { subscribeToPush, unsubscribeFromPush, isPushSubscribed, sendTestPush } = useNotifications()

  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null)
  const [history, setHistory] = useState<NotificationRecord[]>([])
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      notificationService.getPreferences().catch(() => null),
      isPushSubscribed(),
    ]).then(([serverPrefs, isSubscribed]) => {
      if (serverPrefs) setPrefs(serverPrefs)
      setSubscribed(isSubscribed)
      setLoading(false)
    })
    notificationService.getHistory(10).then(setHistory).catch(() => {})
  }, [])

  // On means BOTH: this device holds a subscription and the server has consent
  const pushOn = subscribed && Boolean(prefs?.pushEnabled)

  const save = async (patch: Partial<NotificationPreferences>) => {
    setBusy(true)
    try {
      setPrefs(await notificationService.updatePreferences(patch))
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Could not save that setting.')
    } finally {
      setBusy(false)
    }
  }

  const handleMaster = async (next: boolean) => {
    setBusy(true)
    try {
      if (next) {
        const ok = await subscribeToPush()
        if (!ok) {
          alert('Could not enable notifications. On iPhone, open this from the home screen icon (not Safari) and use iOS 16.4+.')
          return
        }
        // The device's zone travels with the opt-in — nothing timed can be
        // scheduled until the server knows what "9am" means for this user.
        const saved = await notificationService.updatePreferences({
          pushEnabled: true,
          essentialEnabled: true,
          timezone: deviceTimezone(),
        })
        setPrefs(saved)
        setSubscribed(true)
      } else {
        await unsubscribeFromPush()
        setPrefs(await notificationService.updatePreferences({
          pushEnabled: false, coachEnabled: false,
        }))
        setSubscribed(false)
      }
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Could not update notifications.')
    } finally {
      setBusy(false)
    }
  }

  // Absent type rows mean "follow the tier", so an unset type reads as on
  const typeEnabled = (type: string) => prefs?.types?.[type] ?? true

  const handleType = async (type: string, next: boolean, safety?: boolean) => {
    // Safety alerts get one confirm on the way out. It fires precisely when you
    // feel fine and are about to train through a load spike — the moment it is
    // easiest to switch off and most costly to have switched off.
    if (!next && safety) {
      const ok = confirm(
        'Turn off the injury risk warning?\n\n' +
        'This is the alert that tells you your training load has spiked into the range where overuse injuries happen. It fires when you feel fine.'
      )
      if (!ok) return
    }
    await save({ types: { ...(prefs?.types ?? {}), [type]: next } })
  }

  const handleTest = async () => {
    setBusy(true)
    try {
      const res = await sendTestPush()
      alert(`Test push sent to ${res?.data?.sent ?? 0} device(s).\n\nLock the phone — it should still arrive.`)
      setTimeout(() => {
        notificationService.getHistory(10).then(setHistory).catch(() => {})
      }, 1500)
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Could not send the test push.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-dvh bg-dark-900 flex items-center justify-center">
        <p className="text-dark-300 text-sm">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-dark-900 text-white px-4 pt-4 pb-24">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate('/profile')}
          className="w-9 h-9 rounded-full bg-dark-800 border border-dark-600
                     flex items-center justify-center text-lg">
          ←
        </button>
        <h1 className="text-xl font-extrabold">Notifications</h1>
      </div>

      <Section
        title="Push notifications"
        subtitle="Delivered even when the app is closed and the phone is locked."
      >
        <Row
          icon="📲"
          label="Enable notifications"
          description={pushOn ? 'On for this device' : 'Off — nothing will be sent'}
          right={<Toggle value={pushOn} onChange={handleMaster} disabled={busy} />}
        />
      </Section>

      <Section title="What to notify me about">
        {NOTIFICATION_CATALOGUE.map((item, index) => (
          <div key={item.type}>
            {index > 0 && <Divider />}
            <Row
              icon={item.icon}
              label={item.label}
              description={item.description}
              dim={!pushOn}
              right={
                <Toggle
                  value={pushOn && typeEnabled(item.type)}
                  onChange={next => handleType(item.type, next, (item as any).safety)}
                  disabled={busy || !pushOn}
                />
              }
            />
          </div>
        ))}

        <Divider />

        {/* Tier flag rather than a type row: suspension and backoff key off
            coachEnabled, and a separate type row could disagree with it. */}
        <Row
          icon="🤖"
          label="AI coaching nudges"
          description={
            prefs?.coachSuspendedAt
              ? 'Paused because they went unopened. Turn back on to resume.'
              : 'Adaptive messages timed around your training. Tap one to talk it through.'
          }
          dim={!pushOn}
          right={
            <Toggle
              value={pushOn && Boolean(prefs?.coachEnabled) && !prefs?.coachSuspendedAt}
              onChange={next => save({ coachEnabled: next })}
              disabled={busy || !pushOn}
            />
          }
        />
      </Section>

      <Section
        title="How often"
        subtitle="A hard ceiling. The AI plans within it and can never exceed it."
      >
        <div className={`px-3.5 py-3.5 ${!pushOn ? 'opacity-45' : ''}`}>
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-sm">Most per day</span>
            <span className="text-brand-teal text-sm font-bold">{prefs?.dailyCap ?? 3}</span>
          </div>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                disabled={busy || !pushOn}
                onClick={() => save({ dailyCap: n })}
                className={`flex-1 py-2 rounded-btn text-sm font-bold transition-colors
                  ${(prefs?.dailyCap ?? 3) === n
                    ? 'bg-brand-teal text-black'
                    : 'bg-dark-700 text-dark-200'}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section
        title="Quiet hours"
        subtitle="Nothing is sent during these hours — not even the injury warning."
      >
        <div className={`flex gap-3 px-3.5 py-3.5 ${!pushOn ? 'opacity-45' : ''}`}>
          {([
            ['From', 'quietStartHour', prefs?.quietStartHour ?? 22],
            ['Until', 'quietEndHour', prefs?.quietEndHour ?? 8],
          ] as const).map(([label, key, value]) => (
            <div key={key} className="flex-1">
              <p className="text-dark-300 text-[11px] mb-1.5">{label}</p>
              <select
                value={value}
                disabled={busy || !pushOn}
                onChange={e => save({ [key]: Number(e.target.value) } as any)}
                className="w-full bg-dark-700 border border-dark-600 rounded-btn
                           px-3 py-2.5 text-sm text-white appearance-none"
              >
                {HOURS.map(h => <option key={h} value={h}>{fmtHour(h)}</option>)}
              </select>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Check it works"
        subtitle="Sent from the server, so it tests delivery with the app closed."
      >
        <button
          onClick={handleTest}
          disabled={busy || !pushOn}
          className="w-full px-3.5 py-3.5 text-left text-sm font-medium
                     disabled:opacity-45 active:bg-dark-700"
        >
          🔔 Send a test notification
        </button>
      </Section>

      {history.length > 0 && (
        <Section
          title="Recent"
          subtitle="“Delivered” means your phone confirmed it rendered — not just that it was sent."
        >
          {history.map((n, index) => (
            <div key={n.id}>
              {index > 0 && <Divider />}
              <div className="px-3.5 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-white text-sm font-medium">{n.title}</p>
                  <span className={`text-[10px] font-bold shrink-0 mt-0.5 ${
                    n.clickedAt ? 'text-brand-teal' :
                    n.displayedAt ? 'text-brand-green' :
                    n.status === 'failed' ? 'text-brand-red' : 'text-dark-400'
                  }`}>
                    {n.clickedAt ? 'OPENED' :
                     n.displayedAt ? 'DELIVERED' :
                     n.status === 'failed' ? 'FAILED' : 'SENT'}
                  </span>
                </div>
                <p className="text-dark-300 text-[11.5px] mt-1 leading-snug">{n.body}</p>
                <p className="text-dark-400 text-[10.5px] mt-1.5">
                  {n.sentAt ? new Date(n.sentAt).toLocaleString() : '—'}
                  {n.failReason && ` · ${n.failReason}`}
                </p>
              </div>
            </div>
          ))}
        </Section>
      )}
    </div>
  )
}
