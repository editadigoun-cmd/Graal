// Envoie par email une copie de chaque notification in-app (table `notifications`), en plus
// de la notification push existante (send-push) — demande explicite du client : toute
// notification doit aussi atteindre l'utilisateur concerné par email.
//
// Appelée en interne par le trigger Postgres notifier_email() (via pg_net), authentifiée par
// le même secret partagé que send-push (lu depuis Vault), jamais exposée à un JWT utilisateur
// — d'où verify_jwt=false au déploiement.
//
// Réutilise l'infrastructure d'envoi déjà en place pour les emails d'invitation (create-user) :
// Brevo en priorité, Resend en repli, mêmes secrets (BREVO_API_KEY/BREVO_FROM_EMAIL ou
// RESEND_API_KEY/RESEND_FROM_EMAIL) déjà configurés sur ce projet. Si aucun des deux n'est
// configuré, ou en cas d'échec d'envoi, on abandonne silencieusement (best-effort) : une
// notification in-app reste créée dans tous les cas, l'email est un canal complémentaire.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const BASE_URL = 'https://graal.editadigoun.workers.dev'
const ROUTE_PAR_ROLE: Record<string, string> = {
  vm: '/app/notifications',
  superviseur: '/admin/activite',
  admin: '/admin/activite'
}

function emailHtml(fullName: string, titre: string, corps: string | null, lienLabel: string, actionLink: string) {
  return `<!doctype html>
<html lang="fr">
<body style="margin:0;padding:0;background-color:#F7F8FA;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F7F8FA;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 8px 30px -12px rgba(15,50,114,0.18);">
        <tr>
          <td style="background:linear-gradient(135deg,#0B2555,#154BAD);padding:32px 32px 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td style="font-size:20px;font-weight:800;color:#ffffff;letter-spacing:0.5px;">GRAAL</td>
            </tr></table>
            <p style="margin:2px 0 0;font-size:11px;font-weight:600;letter-spacing:1.5px;color:rgba(255,255,255,0.6);text-transform:uppercase;">Medical Solutions</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:0.5px;color:#26B876;text-transform:uppercase;">Notification</p>
            <h1 style="margin:0 0 16px;font-size:19px;font-weight:800;color:#232A33;">${titre}</h1>
            ${corps ? `<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#4E5765;">${corps}</p>` : ''}
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
              <tr><td style="border-radius:16px;background-color:#154BAD;">
                <a href="${actionLink}" style="display:inline-block;padding:14px 32px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:16px;">
                  ${lienLabel}
                </a>
              </td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;background-color:#F7F8FA;border-top:1px solid #EEF1F5;">
            <p style="margin:0;font-size:11px;color:#96A0AC;">
              Bonjour ${fullName}, ce message reprend une notification déjà disponible dans votre espace GRAAL Medical Solutions.
              Document confidentiel — usage réservé aux collaborateurs.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

async function sendViaBrevo(apiKey: string, email: string, fullName: string, subject: string, html: string) {
  const fromEmail = Deno.env.get('BREVO_FROM_EMAIL')
  if (!fromEmail) throw new Error('BREVO_FROM_EMAIL manquant (adresse expéditeur vérifiée dans Brevo).')
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: 'GRAAL Medical Solutions', email: fromEmail },
      to: [{ email, name: fullName }],
      subject,
      htmlContent: html
    })
  })
  if (!res.ok) throw new Error(`Échec de l'envoi de l'email (Brevo) : ${await res.text()}`)
}

async function sendViaResend(apiKey: string, email: string, subject: string, html: string) {
  const from = Deno.env.get('RESEND_FROM_EMAIL') ?? 'GRAAL Medical Solutions <onboarding@resend.dev>'
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: email, subject, html })
  })
  if (!res.ok) throw new Error(`Échec de l'envoi de l'email (Resend) : ${await res.text()}`)
}

Deno.serve(async (req) => {
  try {
    const secret = req.headers.get('x-graal-secret')
    if (!secret) return new Response('unauthorized', { status: 401 })

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Réutilise la config push (même secret partagé) — aucune donnée VAPID n'est utilisée ici.
    const { data: configRows } = await admin.rpc('__get_push_config')
    const config = configRows?.[0]
    if (!config?.trigger_secret || config.trigger_secret !== secret) return new Response('unauthorized', { status: 401 })

    const brevoKey = Deno.env.get('BREVO_API_KEY')
    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!brevoKey && !resendKey) { console.error('EMAIL_CONFIG_MISSING: configure BREVO_API_KEY + BREVO_FROM_EMAIL, or RESEND_API_KEY + RESEND_FROM_EMAIL.'); return new Response('email provider not configured', { status: 503 }) }

    const { notification_id } = await req.json()
    const { data: notif, error: notifError } = await admin.from('notifications')
      .select('profile_id, titre, corps').eq('id', notification_id).single()
    if (notifError || !notif) { console.error('NOTIFICATION_NOT_FOUND:', notifError?.message ?? 'notification absent'); return new Response('notification not found', { status: 404 }) }

    const { data: profile, error: profileError } = await admin.from('profiles')
      .select('email, full_name, role').eq('id', notif.profile_id).single()
    if (profileError || !profile) { console.error('PROFILE_NOT_FOUND:', profileError?.message ?? 'profil absent'); return new Response('profile not found', { status: 404 }) }
    if (!profile.email?.trim()) { console.error('PROFILE_EMAIL_MISSING:', profile.id); return new Response('recipient email missing', { status: 422 }) }

    const actionLink = `${BASE_URL}${ROUTE_PAR_ROLE[profile.role] ?? '/'}`
    const lienLabel = profile.role === 'vm' ? 'Voir mes notifications' : "Voir l'activité"
    const html = emailHtml(profile.full_name, notif.titre, notif.corps, lienLabel, actionLink)

    let sent = false
    let brevoError: unknown = null
    if (brevoKey) {
      try {
        await sendViaBrevo(brevoKey, profile.email, profile.full_name, notif.titre, html)
        sent = true
      } catch (e) {
        brevoError = e
        console.error('BREVO_SEND_FAILED:', e instanceof Error ? e.message : String(e))
      }
    }
    if (!sent && resendKey) {
      try {
        await sendViaResend(resendKey, profile.email, notif.titre, html)
        sent = true
      } catch (e) {
        console.error('RESEND_SEND_FAILED:', e instanceof Error ? e.message : String(e))
        return new Response('email provider rejected the message', { status: 502 })
      }
    }
    if (!sent) {
      console.error('EMAIL_DELIVERY_FAILED: no provider succeeded', brevoError instanceof Error ? brevoError.message : String(brevoError ?? 'unknown'))
      return new Response('email delivery failed', { status: 502 })
    }
    console.log('EMAIL_ACCEPTED_BY_PROVIDER:', JSON.stringify({ provider: brevoKey && !brevoError ? 'brevo' : 'resend', notification_id, profile_id: profile.id }))
    return new Response('email accepted by provider', { status: 200 })
  } catch (e) {
    return new Response(`error: ${e instanceof Error ? e.message : String(e)}`, { status: 500 })
  }
})
