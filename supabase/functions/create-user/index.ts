// Crée un compte utilisateur (VM, superviseur ou admin) et lui envoie une invitation par
// email — réservé aux administrateurs. Le profil est créé automatiquement par le trigger
// handle_new_auth_user() (voir 002_profiles_teams.sql) à partir des métadonnées fournies ici.
//
// L'envoi utilise Brevo, puis Resend en repli (email HTML aux couleurs GRAAL, en français)
// dès que la variable d'environnement correspondante (BREVO_API_KEY ou RESEND_API_KEY) est
// configurée comme secret sur le projet Supabase — sinon on se rabat sur le mailer intégré
// de Supabase (inviteUserByEmail), qui reste fonctionnel mais n'est pas destiné à un usage
// en production (fort throttling, domaine d'expédition partagé).
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

const ROLE_LABEL: Record<string, string> = { vm: 'Visiteur médical', superviseur: 'Superviseur', admin: 'Administrateur' }
// Le "Site URL" configuré côté Supabase Auth n'est pas fiable (souvent resté sur localhost) —
// on force donc explicitement où les liens d'invitation/réinitialisation redirigent.
const REDIRECT_URL = 'https://graal.editadigoun.workers.dev/definir-mot-de-passe'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

function invitationEmailHtml(fullName: string, role: string, actionLink: string) {
  const roleLabel = ROLE_LABEL[role] ?? role
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
            <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:0.5px;color:#26B876;text-transform:uppercase;">Invitation</p>
            <h1 style="margin:0 0 16px;font-size:20px;font-weight:800;color:#232A33;">Bienvenue, ${fullName} !</h1>
            <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#4E5765;">
              Un compte <strong>${roleLabel}</strong> vient d'être créé pour vous sur la plateforme GRAAL Medical Solutions,
              l'espace de pilotage de la visite médicale.
            </p>
            <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#4E5765;">
              Cliquez sur le bouton ci-dessous pour définir votre mot de passe et accéder à votre espace.
            </p>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
              <tr><td style="border-radius:16px;background-color:#154BAD;">
                <a href="${actionLink}" style="display:inline-block;padding:14px 32px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:16px;">
                  Activer mon compte
                </a>
              </td></tr>
            </table>
            <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#96A0AC;">
              Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br/>
              <a href="${actionLink}" style="color:#1B63C9;word-break:break-all;">${actionLink}</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;background-color:#F7F8FA;border-top:1px solid #EEF1F5;">
            <p style="margin:0;font-size:11px;color:#96A0AC;">
              Document confidentiel — usage réservé aux collaborateurs GRAAL MEDICAL SOLUTIONS.
              Si vous n'attendiez pas cet email, vous pouvez l'ignorer.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

async function sendViaBrevo(apiKey: string, email: string, fullName: string, role: string, actionLink: string) {
  const fromEmail = Deno.env.get('BREVO_FROM_EMAIL')
  if (!fromEmail) throw new Error('BREVO_FROM_EMAIL manquant (adresse expéditeur vérifiée dans Brevo).')
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: 'GRAAL Medical Solutions', email: fromEmail },
      to: [{ email, name: fullName }],
      subject: 'Votre invitation GRAAL Medical Solutions',
      htmlContent: invitationEmailHtml(fullName, role, actionLink)
    })
  })
  if (!res.ok) throw new Error(`Échec de l'envoi de l'email (Brevo) : ${await res.text()}`)
}

async function sendViaResend(apiKey: string, email: string, fullName: string, role: string, actionLink: string) {
  const from = Deno.env.get('RESEND_FROM_EMAIL') ?? 'GRAAL Medical Solutions <onboarding@resend.dev>'
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: email,
      subject: 'Votre invitation GRAAL Medical Solutions',
      html: invitationEmailHtml(fullName, role, actionLink)
    })
  })
  if (!res.ok) throw new Error(`Échec de l'envoi de l'email (Resend) : ${await res.text()}`)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Méthode non supportée' }, 405)

  try {
    const body = await req.json()
    const { email, full_name, role, secteur, equipe_id, zone_id, resend } = body as {
      email: string; full_name: string; role: 'vm' | 'superviseur' | 'admin'
      secteur?: 'A' | 'B' | null; equipe_id?: string | null; zone_id?: string | null; resend?: boolean
    }

    if (!email) return json({ error: 'Email obligatoire.' }, 400)
    if (!resend) {
      if (!full_name || !role) {
        return json({ error: 'Email, nom complet et rôle sont obligatoires.' }, 400)
      }
      if (role === 'vm' && (!secteur || !equipe_id || !zone_id)) {
        return json({ error: 'Un VM doit avoir un secteur, une équipe et une zone.' }, 400)
      }
    }

    // Vérifie que l'appelant est bien administrateur, avec son propre jeton (respecte les RLS)
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )
    const { data: userData, error: userError } = await callerClient.auth.getUser()
    if (userError || !userData.user) return json({ error: 'Non authentifié' }, 401)

    const { data: callerProfile } = await callerClient.from('profiles').select('role').eq('id', userData.user.id).single()
    if (callerProfile?.role !== 'admin') {
      return json({ error: 'Action réservée aux administrateurs.' }, 403)
    }

    // Client "service role" — seul ce contexte peut créer un utilisateur auth.
    const adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Détecte les doublons en amont pour un message clair (au lieu de l'erreur générique de Supabase Auth).
    const { data: existing } = await adminClient.from('profiles').select('full_name, role').ilike('email', email).maybeSingle()

    const brevoKey = Deno.env.get('BREVO_API_KEY')
    const resendKey = Deno.env.get('RESEND_API_KEY')

    if (resend) {
      // Renvoyer une invitation : GoTrue refuse un second lien de type "invite" pour un email
      // déjà enregistré, on passe donc par un lien de type "recovery" (fonctionne même si le
      // compte n'a jamais été confirmé) pour permettre de (re)définir le mot de passe.
      if (!existing) return json({ error: 'Aucun compte trouvé avec cet email.' }, 404)
      if (!brevoKey && !resendKey) return json({ error: "Aucun service d'envoi d'email n'est configuré." }, 400)

      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo: REDIRECT_URL }
      })
      if (linkError) return json({ error: linkError.message }, 400)

      try {
        if (brevoKey) await sendViaBrevo(brevoKey, email, existing.full_name, existing.role, linkData.properties.action_link)
        else await sendViaResend(resendKey!, email, existing.full_name, existing.role, linkData.properties.action_link)
      } catch (mailError) {
        return json({ error: String(mailError) }, 502)
      }

      return json({ id: linkData.user.id, email: linkData.user.email })
    }

    if (existing) {
      return json({ error: `Un compte existe déjà avec cet email (${existing.full_name}).` }, 409)
    }

    const metadata = { full_name, role, secteur: secteur ?? null, equipe_id: equipe_id ?? null, zone_id: zone_id ?? null }

    if (brevoKey || resendKey) {
      // Génère le lien d'invitation sans passer par le mailer intégré de Supabase, puis
      // envoie nous-mêmes l'email en français, aux couleurs GRAAL, via Brevo (ou Resend).
      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: 'invite',
        email,
        options: { data: metadata, redirectTo: REDIRECT_URL }
      })
      if (linkError) return json({ error: linkError.message }, 400)

      try {
        if (brevoKey) await sendViaBrevo(brevoKey, email, full_name, role, linkData.properties.action_link)
        else await sendViaResend(resendKey!, email, full_name, role, linkData.properties.action_link)
      } catch (mailError) {
        return json({ error: String(mailError) }, 502)
      }

      return json({ id: linkData.user.id, email: linkData.user.email })
    }

    const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: metadata,
      redirectTo: REDIRECT_URL
    })

    if (inviteError) return json({ error: inviteError.message }, 400)

    return json({ id: invited.user.id, email: invited.user.email })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
