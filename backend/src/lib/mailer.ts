/**
 * Outbound email via Resend's HTTP API. Optional: without RESEND_API_KEY the
 * features that need mail refuse with a clear error instead of pretending.
 */

import type { Locale } from './locale'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

const apiKey = process.env.RESEND_API_KEY?.trim()
const from = process.env.MAIL_FROM?.trim() || 'SomaTrack <onboarding@resend.dev>'

export const isMailConfigured = Boolean(apiKey)

export interface Mail {
  to: string
  subject: string
  html: string
  text: string
}

export class MailError extends Error {}

export const sendMail = async (mail: Mail): Promise<void> => {
  if (!apiKey) {
    throw new MailError('Mail is not configured. Set RESEND_API_KEY.')
  }

  // Bounded so a hung provider cannot hold the request open
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [mail.to],
        subject: mail.subject,
        html: mail.html,
        // A text part alongside the HTML improves spam scoring
        text: mail.text,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new MailError(`Resend rejected the message (${response.status}): ${detail.slice(0, 200)}`)
    }
  } catch (error) {
    if (error instanceof MailError) throw error
    throw new MailError(
      error instanceof Error && error.name === 'AbortError'
        ? 'Mail provider timed out.'
        : `Mail provider unreachable: ${(error as Error).message}`
    )
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * The password reset email. Plain and short, with the link shown as text so
 * the destination is visible before clicking.
 */
export const passwordResetMail = (
  to: string, link: string, ttlMinutes: number, locale: Locale = 'en'
): Mail => locale === 'el' ? passwordResetMailEl(to, link, ttlMinutes) : ({
  to,
  subject: 'Reset your SomaTrack password',
  text: [
    'Someone asked to reset the password for your SomaTrack account.',
    '',
    `Open this link to choose a new one (it expires in ${ttlMinutes} minutes):`,
    link,
    '',
    'If this was not you, ignore this email — your password has not changed.',
  ].join('\n'),
  html: `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
                max-width:480px;margin:0 auto;padding:24px;color:#111">
      <h1 style="font-size:20px;margin:0 0 16px">Reset your password</h1>
      <p style="font-size:14px;line-height:1.6;margin:0 0 20px">
        Someone asked to reset the password for your SomaTrack account.
        This link expires in ${ttlMinutes} minutes and can be used once.
      </p>
      <p style="margin:0 0 20px">
        <a href="${link}"
           style="display:inline-block;background:#00D4AA;color:#000;font-weight:700;
                  text-decoration:none;padding:12px 20px;border-radius:12px;font-size:14px">
          Choose a new password
        </a>
      </p>
      <p style="font-size:12px;line-height:1.6;color:#555;margin:0 0 20px;word-break:break-all">
        Or paste this into your browser:<br>${link}
      </p>
      <p style="font-size:12px;line-height:1.6;color:#555;margin:0">
        If this was not you, ignore this email — your password has not changed.
      </p>
    </div>
  `.trim(),
})

/** The same email in Greek. */
const passwordResetMailEl = (to: string, link: string, ttlMinutes: number): Mail => ({
  to,
  subject: 'Επαναφορά κωδικού SomaTrack',
  text: [
    'Κάποιος ζήτησε επαναφορά του κωδικού για τον λογαριασμό σου στο SomaTrack.',
    '',
    `Άνοιξε αυτόν τον σύνδεσμο για να διαλέξεις καινούριο (λήγει σε ${ttlMinutes} λεπτά):`,
    link,
    '',
    'Αν δεν ήσουν εσύ, αγνόησε αυτό το email — ο κωδικός σου δεν έχει αλλάξει.',
  ].join('\n'),
  html: `
    <div lang="el" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
                max-width:480px;margin:0 auto;padding:24px;color:#111">
      <h1 style="font-size:20px;margin:0 0 16px">Επαναφορά κωδικού</h1>
      <p style="font-size:14px;line-height:1.6;margin:0 0 20px">
        Κάποιος ζήτησε επαναφορά του κωδικού για τον λογαριασμό σου στο SomaTrack.
        Ο σύνδεσμος λήγει σε ${ttlMinutes} λεπτά και χρησιμοποιείται μία φορά.
      </p>
      <p style="margin:0 0 20px">
        <a href="${link}"
           style="display:inline-block;background:#00D4AA;color:#000;font-weight:700;
                  text-decoration:none;padding:12px 20px;border-radius:12px;font-size:14px">
          Διάλεξε καινούριο κωδικό
        </a>
      </p>
      <p style="font-size:12px;line-height:1.6;color:#555;margin:0 0 20px;word-break:break-all">
        Ή επικόλλησε αυτό στον browser σου:<br>${link}
      </p>
      <p style="font-size:12px;line-height:1.6;color:#555;margin:0">
        Αν δεν ήσουν εσύ, αγνόησε αυτό το email — ο κωδικός σου δεν έχει αλλάξει.
      </p>
    </div>
  `.trim(),
})
