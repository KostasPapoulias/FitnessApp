/**
 * Outbound email.
 *
 * Resend over HTTP rather than SMTP: one API key, no connection handling, no
 * transport to keep warm, and nothing to configure beyond an env var. Sent with
 * `fetch` rather than the SDK — this makes exactly one request shape, and a
 * dependency for that is not worth the install.
 *
 * Mail is OPTIONAL. If `RESEND_API_KEY` is unset the app boots and runs
 * normally and only the features that need mail refuse, saying why. The
 * alternative — pretending a reset was sent when nothing was configured — is
 * the worst outcome: the user waits for a mail that was never going to arrive
 * and has no way to find out.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

/** Both must be present for mail to be considered configured. */
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

  // Bounded so a hung provider cannot hold an HTTP handler open indefinitely —
  // the caller is a request the user is waiting on.
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
        // Sent alongside the HTML, not instead of it: a mail with no text part
        // scores worse with spam filters, and a reset that lands in spam has
        // failed just as completely as one that was never sent.
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
 * The reset email.
 *
 * Deliberately plain and short. A password reset is the single most phished
 * message a product sends, so it makes one clear statement, shows the link as
 * text so the destination is visible before clicking, and never asks for
 * anything back.
 */
export const passwordResetMail = (to: string, link: string, ttlMinutes: number): Mail => ({
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
