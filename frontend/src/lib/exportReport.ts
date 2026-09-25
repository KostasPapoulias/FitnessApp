import { bodySvg } from '../components/muscle/bodyAssets'
import { MUSCLE_NAME_TO_GROUP } from '../components/muscle/MiniMuscleMap'
import { fmtTime } from '../pages/Workout/helpers'
import { INTL_LOCALE, Locale, MessageKey, Params, translate } from '../i18n'
import type { DataExport, ExportSession, ExportSet } from '../services/export.service'

/**
 * The data export as one self-contained HTML file: a readable report with a
 * muscle map per session, plus the full export embedded as JSON.
 *
 * Each body SVG is written once as a <symbol> and reused with <use>; a
 * session's colours come from CSS custom properties, which inherit into the
 * <use> shadow tree. Everything the athlete typed goes through `esc`.
 */

// ── helpers ─────────────────────────────────────────────────────────────────

const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

/** Every body group the map knows, for the CSS and the symbols. */
const GROUP_IDS = [...new Set(Object.values(MUSCLE_NAME_TO_GROUP).flat())]

/**
 * One traced body as a <symbol>. Group ids become `data-m` attributes (front
 * and back share names); the root fill becomes the unworked grey.
 */
const bodySymbol = (side: 'front' | 'back', gender: string | null) => {
  const svg = bodySvg(side, gender)
  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1] ?? '0 0 648 1280'
  const inner = svg
    .replace(/^[\s\S]*?<svg\b[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/<metadata[\s\S]*?<\/metadata>/g, '')
    .replace(/>[^<]+</g, '><')
    // Spaces allowed around `=` (the male trace writes `id = "Chest"`)
    .replace(/\bid\s*=\s*"/g, 'data-m="')
    .replace(/fill="#000000"/g, 'fill="#2A2A2A"')
  return `<symbol id="body-${side}" viewBox="${viewBox}">${inner}</symbol>`
}

/** `--Chest:#EF4444;--Quads:#FACC15` for one session's snapshot. */
const mapVars = (snapshot: ExportSession['fatigueSnapshot']) => {
  const byGroup = new Map<string, string>()
  for (const item of snapshot) {
    for (const id of MUSCLE_NAME_TO_GROUP[item.muscle] ?? []) byGroup.set(id, item.color)
  }
  return [...byGroup].map(([id, color]) => `--${id}:${color}`).join(';')
}

// ── the report ──────────────────────────────────────────────────────────────

export function buildExportHtml(
  data: DataExport,
  opts: { locale: Locale; gender: string | null },
): string {
  const { locale, gender } = opts
  const intl = INTL_LOCALE[locale]
  const t = (key: MessageKey, params?: Params) => translate(locale, key, params)

  const date = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleDateString(intl, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
  const dateTime = (iso: string | null | undefined) =>
    iso
      ? new Date(iso).toLocaleString(intl, {
          weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        })
      : '—'
  const n = (v: number | null | undefined, digits = 1) =>
    v == null ? '—' : (Math.round(v * 10 ** digits) / 10 ** digits).toLocaleString(intl)
  // h:mm:ss for an hour or more
  const dur = (sec: number | null | undefined) => {
    if (sec == null) return '—'
    if (sec < 3600) return fmtTime(sec)
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = Math.round(sec % 60)
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  const yesNo = (b: boolean) => (b ? t('export.yes') : t('export.no'))

  const table = (head: string[], rows: string[][]) =>
    rows.length === 0
      ? `<p class="muted">${esc(t('export.empty'))}</p>`
      : `<div class="tw"><table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
         <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`

  /** One set as a readable line, in the units its modality recorded. */
  const describeSet = (s: ExportSet): string => {
    if (s.strength) return `${n(s.strength.weightKg)} kg × ${s.strength.reps}`
    if (s.calisthenics) {
      const load = s.calisthenics.addedWeightKg
      const loadText = load === 0 ? '' : ` (${load > 0 ? '+' : ''}${n(load)} kg)`
      return s.calisthenics.timeSec
        ? `${dur(s.calisthenics.timeSec)}${loadText}`
        : `${s.calisthenics.reps}${loadText}`
    }
    if (s.cardio) {
      const parts: string[] = []
      if (s.cardio.distanceKm) parts.push(`${n(s.cardio.distanceKm, 2)} km`)
      if (s.cardio.reps) parts.push(String(s.cardio.reps))
      if (s.cardio.timeSec) parts.push(dur(s.cardio.timeSec))
      return parts.join(' · ') || '—'
    }
    if (s.wod) {
      const parts: string[] = []
      if (s.wod.rounds != null) parts.push(`${n(s.wod.rounds)} rounds`)
      if (s.wod.reps != null) parts.push(`${s.wod.reps} reps`)
      if (s.wod.weightKg) parts.push(`${n(s.wod.weightKg)} kg`)
      if (s.wod.distanceKm) parts.push(`${n(s.wod.distanceKm, 2)} km`)
      if (s.wod.timeSec) parts.push(dur(s.wod.timeSec))
      return parts.join(' · ') || '—'
    }
    if (s.mobility) return dur(s.mobility.timeSec)
    return '—'
  }

  const runBlock = (s: ExportSet) => {
    const r = s.run
    if (!r) return ''
    const stats = [
      [t('export.runDistance'), `${n(r.distanceM / 1000, 2)} km`],
      [t('export.runTime'), dur(r.durationSec)],
      [t('export.runPace'), `${dur(r.avgPaceSecPerKm)} /km`],
      [t('export.runClimb'), `${r.elevationGainM} m`],
      [t('export.runSource'), r.source],
    ]
    const splits = r.splits?.length
      ? `<details><summary>${esc(t('export.splits'))} (${r.splits.length})</summary>${table(
          [t('export.colKm'), t('export.runTime'), t('export.runPace')],
          r.splits.map(sp => [
            String(sp.index),
            dur(sp.seconds),
            sp.meters > 0 ? `${dur(sp.seconds / (sp.meters / 1000))} /km` : '—',
          ]),
        )}</details>`
      : ''
    return `<div class="run">${stats
      .map(([k, v]) => `<div><span class="k">${esc(k)}</span><b>${esc(v)}</b></div>`)
      .join('')}</div>${splits}`
  }

  const sessionCard = (s: ExportSession) => {
    const meta = [
      [t('export.duration'), dur(s.durationSec)],
      [t('export.volume'), s.totalVolumeKg ? `${n(s.totalVolumeKg, 0)} kg` : '—'],
      [t('export.avgRpe'), n(s.avgRpe)],
      [t('export.load'), n(s.systemicLoad, 0)],
      ...(s.template ? [[t('export.plan'), s.template]] : []),
      ...(s.weatherCondition ? [[t('export.weather'), s.weatherCondition]] : []),
    ]
    const snapshot = [...s.fatigueSnapshot].sort((a, b) => b.fatigueAfter - a.fatigueAfter)
    const vars = mapVars(s.fatigueSnapshot)

    return `<article class="session">
      <header>
        <h3>${esc(dateTime(s.dateTime))}</h3>
        ${s.finished ? '' : `<span class="tag">${esc(t('export.unfinished'))}</span>`}
      </header>
      <div class="meta">${meta
        .map(([k, v]) => `<span><span class="k">${esc(k)}</span> ${esc(v)}</span>`)
        .join('')}</div>
      ${s.notes ? `<p class="note">${esc(s.notes)}</p>` : ''}
      <div class="mapRow">
        <div class="map" style="${esc(vars)}" role="img" aria-label="${esc(t('export.musclesAfter'))}">
          ${(['front', 'back'] as const).map(side =>
            // Sized by the symbol's viewBox; xlink:href for older Safari
            `<svg><use href="#body-${side}" xlink:href="#body-${side}" width="100%" height="100%"/></svg>`,
          ).join('')}
        </div>
        <div class="legend">
          <p class="k">${esc(t('export.musclesAfter'))}</p>
          ${snapshot.length === 0
            ? `<p class="muted">${esc(t('export.noMuscles'))}</p>`
            : snapshot.map(m => `<span class="chip"><i style="background:${esc(m.color)}"></i>${esc(m.muscle)} <b>${n(m.fatigueAfter, 0)}</b>${
                m.delta ? ` <small>(${m.delta > 0 ? '+' : ''}${n(m.delta, 0)})</small>` : ''
              }</span>`).join('')}
        </div>
      </div>
      ${s.exercises.map(ex => `<section class="exercise">
        <h4>${esc(ex.name)} <small>${esc(ex.modality)}</small></h4>
        ${ex.notes ? `<p class="note"><span class="k">${esc(t('export.note'))}</span> ${esc(ex.notes)}</p>` : ''}
        ${table(
          [t('export.colSet'), t('export.colPerformed'), t('export.colRpe'), t('export.colRest')],
          ex.sets.map(set => [
            String(set.setNumber),
            esc(describeSet(set)),
            esc(n(set.rpe)),
            esc(set.restSeconds != null ? dur(set.restSeconds) : '—'),
          ]),
        )}
        ${ex.sets.map(runBlock).join('')}
      </section>`).join('')}
    </article>`
  }

  // ── sections ──
  const sessions = [...data.sessions].sort((a, b) => b.dateTime.localeCompare(a.dateTime))
  const finished = data.sessions.filter(s => s.finished)
  const totalSets = data.sessions.reduce(
    (sum, s) => sum + s.exercises.reduce((x, e) => x + e.sets.length, 0), 0)
  const totalVolume = finished.reduce((sum, s) => sum + (s.totalVolumeKg ?? 0), 0)
  const p = data.profile
  const st = data.settings

  const profileRows: [string, string][] = [
    [t('export.fName'), p?.name ?? '—'],
    [t('export.fEmail'), data.account.email],
    [t('export.fMemberSince'), date(data.account.createdAt)],
    [t('export.fBirthDate'), p?.birthDate ? date(p.birthDate) : p?.age != null ? String(p.age) : '—'],
    [t('export.fWeight'), p?.weightKg != null ? `${n(p.weightKg)} kg` : '—'],
    [t('export.fHeight'), p?.heightCm != null ? `${n(p.heightCm, 0)} cm` : '—'],
    [t('export.fGender'), p?.gender ?? '—'],
    [t('export.fLevel'), p?.fitnessLevel ?? '—'],
    [t('export.fGoal'), p?.goal ?? '—'],
    [t('export.fDays'), p?.trainingDaysPerWeek != null ? String(p.trainingDaysPerWeek) : '—'],
    [t('export.fExperience'), p?.experienceYears != null ? n(p.experienceYears) : '—'],
    [t('export.fLanguage'), st?.language ?? '—'],
    [t('export.fUnits'), st?.preferredUnit ?? '—'],
    [t('export.fPin'), st ? yesNo(st.pinLockEnabled) : '—'],
    [t('export.fAiConsent'), st ? yesNo(st.aiConsentEnabled) : '—'],
    [t('export.fEquipment'), data.equipment.join(', ') || '—'],
    [t('export.fInjuries'), data.injuries.map(i =>
      `${i.label}${i.muscle ? ` (${i.muscle})` : ''} · ${i.severity}${
        i.resolvedAt ? ` · ${t('export.resolved', { date: date(i.resolvedAt) })}` : ''}`,
    ).join('; ') || '—'],
  ]

  const fatigueRows = [
    ...(data.currentFatigue.systemic
      ? [[esc(t('export.systemic')), n(data.currentFatigue.systemic.level, 0),
          esc(dateTime(data.currentFatigue.systemic.recoveryTargetAt))]]
      : []),
    ...data.currentFatigue.muscles
      .filter(m => m.level > 0)
      .sort((a, b) => b.level - a.level)
      .map(m => [esc(m.muscle), n(m.level, 0), esc(dateTime(m.recoveryTargetAt))]),
  ]

  const section = (id: string, title: string, body: string) =>
    `<section id="${id}" class="block"><h2>${esc(title)}</h2>${body}</section>`

  const nav: [string, MessageKey][] = [
    ['sessions', 'export.secSessions'], ['profile', 'export.secProfile'],
    ['body', 'export.secBody'], ['sleep', 'export.secSleep'],
    ['nutrition', 'export.secNutrition'], ['strength', 'export.secStrength'],
    ['fatigue', 'export.secFatigue'], ['plans', 'export.secPlans'],
    ['exercises', 'export.secExercises'], ['coach', 'export.secCoach'],
    ['notifications', 'export.secNotifications'], ['raw', 'export.secRaw'],
  ]

  // `<` is escaped so no string in the data can close the script element
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  const fileBase = `somatrack-export-${data.exportedAt.slice(0, 10)}`

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t('export.title'))} · ${esc(p?.name ?? data.account.email)}</title>
<style>
  :root { --bg:#f6f6f4; --card:#fff; --ink:#161616; --muted:#6b6b6b; --line:#e4e4e0; --teal:#00a888; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
         font:14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 860px; margin: 0 auto; padding: 24px 16px 64px; }
  h1 { font-size: 24px; margin: 0; } h2 { font-size: 18px; margin: 0 0 12px; }
  h3 { font-size: 15px; margin: 0; } h4 { font-size: 14px; margin: 14px 0 6px; }
  h4 small, .k, .muted { color: var(--muted); font-weight: 400; }
  .k { font-size: 12px; }
  .top { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; align-items:flex-start; }
  .actions button { font:inherit; font-size:13px; padding:7px 12px; border-radius:8px;
                    border:1px solid var(--line); background:var(--card); cursor:pointer; margin-left:6px; }
  .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:8px; margin:18px 0; }
  .stats div { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:10px 12px; }
  .stats b { display:block; font-size:20px; }
  nav { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:24px; }
  nav a { font-size:12px; color:var(--ink); text-decoration:none; border:1px solid var(--line);
          background:var(--card); padding:4px 10px; border-radius:999px; }
  .block { margin-top: 32px; }
  .session { background:var(--card); border:1px solid var(--line); border-radius:12px;
             padding:14px 16px; margin-bottom:14px; break-inside: avoid-page; }
  .session header { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .tag { font-size:11px; background:#fff4d6; color:#8a6100; border-radius:6px; padding:2px 7px; }
  .meta { display:flex; flex-wrap:wrap; gap:4px 16px; margin:6px 0 10px; }
  .note { background:#f3f7f6; border-left:3px solid var(--teal); padding:6px 10px; margin:8px 0;
          white-space:pre-wrap; border-radius:0 6px 6px 0; }
  .mapRow { display:flex; gap:14px; align-items:flex-start; flex-wrap:wrap; }
  .map { display:flex; gap:2px; background:#111; border-radius:10px; padding:8px; flex-shrink:0; }
  .map svg { width:64px; height:126px; display:block; }
  .legend { flex:1; min-width:180px; }
  .legend .k { margin:0 0 6px; }
  .chip { display:inline-flex; align-items:center; gap:5px; font-size:12px; border:1px solid var(--line);
          border-radius:999px; padding:2px 9px 2px 6px; margin:0 4px 4px 0; }
  .chip i { width:9px; height:9px; border-radius:50%; display:inline-block; }
  .chip small { color:var(--muted); }
  .tw { overflow-x:auto; }
  table { border-collapse:collapse; width:100%; font-size:13px; }
  th, td { text-align:left; padding:5px 8px; border-bottom:1px solid var(--line); vertical-align:top; }
  th { font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:var(--muted); font-weight:600; }
  dl { display:grid; grid-template-columns:minmax(120px,max-content) 1fr; gap:6px 16px; margin:0;
       background:var(--card); border:1px solid var(--line); border-radius:12px; padding:14px 16px; }
  dt { color:var(--muted); } dd { margin:0; }
  .run { display:flex; flex-wrap:wrap; gap:6px 18px; margin:8px 0; }
  .run b { display:block; }
  details { margin:6px 0; } summary { cursor:pointer; color:var(--teal); font-size:13px; }
  .msg { margin:6px 0; padding:8px 10px; border-radius:8px; background:var(--card);
         border:1px solid var(--line); white-space:pre-wrap; }
  .msg.you { background:#eef8f5; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:14px 16px; margin-bottom:10px; }
  /* Muscle groups take their colour from the session's custom properties.
     Unset, the declaration is invalid at computed-value time and fill falls
     back to the inherited grey — which is exactly "not worked". */
  ${GROUP_IDS.map(id => `[data-m="${id}"] { fill: var(--${id}); }`).join('\n  ')}
  @media print {
    body { background:#fff; } .actions, nav { display:none; }
    .session, .card, dl { border-color:#ccc; }
    .map { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    details > *:not(summary) { display:block; }
  }
</style>
</head>
<body>
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  ${bodySymbol('front', gender)}
  ${bodySymbol('back', gender)}
</svg>
<main>
  <div class="top">
    <div>
      <h1>${esc(t('export.title'))}</h1>
      <p class="muted">${esc(p?.name ?? '')}${p?.name ? ' · ' : ''}${esc(data.account.email)} · ${esc(t('export.exportedOn', { date: dateTime(data.exportedAt) }))}</p>
    </div>
    <div class="actions">
      <button type="button" onclick="window.print()">${esc(t('export.print'))}</button>
      <button type="button" id="saveJson">${esc(t('export.saveJson'))}</button>
    </div>
  </div>

  <div class="stats">
    <div><span class="k">${esc(t('export.statSessions'))}</span><b>${finished.length.toLocaleString(intl)}</b></div>
    <div><span class="k">${esc(t('export.statSets'))}</span><b>${totalSets.toLocaleString(intl)}</b></div>
    <div><span class="k">${esc(t('export.statVolume'))}</span><b>${n(totalVolume, 0)} kg</b></div>
    <div><span class="k">${esc(t('export.statSince'))}</span><b>${esc(date(finished[0]?.dateTime))}</b></div>
  </div>

  <nav>${nav.map(([id, key]) => `<a href="#${id}">${esc(t(key))}</a>`).join('')}</nav>

  ${section('sessions', t('export.secSessions'),
    sessions.length ? sessions.map(sessionCard).join('') : `<p class="muted">${esc(t('export.empty'))}</p>`)}

  ${section('profile', t('export.secProfile'),
    `<dl>${profileRows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`)}

  ${section('body', t('export.secBody'), table(
    [t('export.colDate'), t('export.colType'), t('export.colValue'), t('export.colSource')],
    data.biometrics.map(b => [esc(date(b.measuredAt)), esc(b.type), n(b.value), esc(b.source)]),
  ))}

  ${section('sleep', t('export.secSleep'), table(
    [t('export.colDate'), t('export.colDuration'), t('export.colScore'), t('export.colNotes')],
    data.sleep.map(l => [esc(date(l.date)), esc(dur(l.durationMin * 60)), n(l.score, 0), esc(l.notes ?? '')]),
  ))}

  ${section('nutrition', t('export.secNutrition'), table(
    [t('export.colDate'), t('export.colProtein'), t('export.colCalories'), t('export.colNotes')],
    data.nutrition.map(l => [esc(date(l.date)), n(l.proteinG, 0), n(l.calories, 0), esc(l.notes ?? '')]),
  ))}

  ${section('strength', t('export.secStrength'), table(
    [t('export.colExercise'), t('export.colE1rm'), t('export.colUpdated')],
    data.strengthEstimates.map(e => [esc(e.exercise), `${n(e.e1rmKg)} kg`, esc(date(e.updatedAt))]),
  ))}

  ${section('fatigue', t('export.secFatigue'),
    `<p class="muted">${esc(t('export.fatigueNote'))}</p>${table(
      [t('export.colMuscle'), t('export.colLevel'), t('export.colRecovered')], fatigueRows)}`)}

  ${section('plans', t('export.secPlans'),
    (data.templates.length ? data.templates.map(tp => `<div class="card">
      <h3>${esc(tp.name)} <small class="muted">${esc(t('export.timesDone', { count: tp.timesPerformed }))}${
        tp.archivedAt ? ` · ${esc(t('export.archived'))}` : ''}</small></h3>
      ${tp.notes ? `<p class="note">${esc(tp.notes)}</p>` : ''}
      ${table([t('export.colExercise'), t('export.colSet'), t('export.colPerformed'), t('export.colRpe')],
        tp.exercises.flatMap(ex => ex.sets.map(ts => [
          esc(ex.name), String(ts.setNumber),
          esc(ts.weightKg != null && ts.reps != null ? `${n(ts.weightKg)} kg × ${ts.reps}` : ts.reps ?? '—'),
          n(ts.rpe),
        ])))}
    </div>`).join('') : `<p class="muted">${esc(t('export.empty'))}</p>`) +
    `<h3 style="margin-top:18px">${esc(t('export.secScheduled'))}</h3>` +
    table([t('export.colDate'), t('export.plan'), t('export.colStatus')],
      data.scheduledWorkouts.map(s => [esc(dateTime(s.scheduledFor)), esc(s.template), esc(s.status)])))}

  ${section('exercises', t('export.secExercises'),
    `<h3>${esc(t('export.favourites'))}</h3><p>${esc(data.favoriteExercises.join(', ')) || `<span class="muted">${esc(t('export.empty'))}</span>`}</p>
     <h3>${esc(t('export.custom'))}</h3>${table(
      [t('export.colExercise'), t('export.colModality'), t('export.colNotes')],
      data.customExercises.map(e => [esc(e.name), esc(e.modality), esc(e.description ?? '')]))}`)}

  ${section('coach', t('export.secCoach'),
    (data.aiCoach.threads.length ? data.aiCoach.threads.map(th => `<details>
      <summary>${esc(t('export.conversation', { date: dateTime(th.startedAt) }))} · ${th.messages.length}</summary>
      ${th.messages.map(m => `<div class="msg${m.from === 'user' ? ' you' : ''}"><span class="k">${
        esc(m.from === 'user' ? t('export.coachYou') : t('export.coachCoach'))} · ${esc(dateTime(m.at))}</span>
        <div>${esc(m.text)}</div></div>`).join('')}
    </details>`).join('') : `<p class="muted">${esc(t('export.empty'))}</p>`) +
    (data.aiCoach.proposals.length
      ? `<h3 style="margin-top:18px">${esc(t('export.proposals'))}</h3>${table(
          [t('export.colDate'), t('export.colType'), t('export.colStatus')],
          data.aiCoach.proposals.map(pr => [esc(dateTime(pr.createdAt)), esc(pr.kind), esc(pr.status)]))}`
      : ''))}

  ${section('notifications', t('export.secNotifications'),
    data.notifications.length
      ? `<details><summary>${data.notifications.length}</summary>${table(
          [t('export.colDate'), t('export.colTitle'), t('export.colStatus')],
          data.notifications.map(x => [esc(dateTime(x.createdAt)),
            `<b>${esc(x.title)}</b><br>${esc(x.body)}`, esc(x.status)]))}</details>`
      : `<p class="muted">${esc(t('export.empty'))}</p>`)}

  ${section('raw', t('export.secRaw'),
    `<p>${esc(t('export.rawBody'))}</p><p class="actions"><button type="button" id="saveJson2">${esc(t('export.saveJson'))}</button></p>`)}
</main>

<script type="application/json" id="somatrack-data">${json}</script>
<script>
  // Saves the embedded JSON by reading it back out of the page
  function saveJson() {
    var text = document.getElementById('somatrack-data').textContent;
    var blob = new Blob([JSON.stringify(JSON.parse(text), null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = ${JSON.stringify(`${fileBase}.json`)};
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  document.getElementById('saveJson').addEventListener('click', saveJson);
  document.getElementById('saveJson2').addEventListener('click', saveJson);
</script>
</body>
</html>`
}

/** The filename the report downloads as. */
export const exportFileName = (data: DataExport) =>
  `somatrack-export-${data.exportedAt.slice(0, 10)}.html`

/**
 * Save the file: the share sheet on touch devices, else a download. If the
 * share is refused (the tap's activation expired during the fetch), fall back
 * to the download; a dismissed sheet ends there.
 */
export async function saveExportFile(name: string, html: string): Promise<void> {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const file = new File([blob], name, { type: 'text/html' })
  const coarse = window.matchMedia?.('(pointer: coarse)').matches

  if (coarse && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name })
      return
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return
      // NotAllowedError etc.: fall back to a download
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoked later; some browsers read the blob after click() returns
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
