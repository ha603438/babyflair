// BabyFlair — envoie la notification « X propose un baby » à tous les téléphones abonnés.
// Appelée par l'app : POST { call_id } avec l'en-tête x-office-code. Vérifie le code via office_ok(),
// lit les abonnements avec la clé service (jamais exposée au navigateur), envoie un Web Push à chacun
// et supprime les abonnements morts (404 / 410). Secrets attendus : VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-office-code',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'POST only' })

  const officeCode = req.headers.get('x-office-code') ?? ''
  const url = Deno.env.get('SUPABASE_URL')!
  const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { 'x-office-code': officeCode } } })
  const { data: ok } = await anon.rpc('office_ok')
  if (ok !== true) return json(403, { error: 'code du bureau refusé' })

  const { call_id } = await req.json().catch(() => ({}))
  if (typeof call_id !== 'string') return json(400, { error: 'call_id manquant' })

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: call } = await admin.from('calls').select('id, created_by, expires_at, players(name)').eq('id', call_id).single()
  if (!call) return json(404, { error: 'appel inconnu' })
  const name = (call as { players?: { name?: string } }).players?.name ?? 'Quelqu’un'

  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') ?? 'https://ha603438.github.io/babyflair/',
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  )
  const payload = JSON.stringify({ title: 'BabyFlair', body: `${name} propose un baby ! Chaud ?`, url: `#/appel/${call_id}`, tag: `call-${call_id}` })

  const { data: subs } = await admin.from('push_subscriptions').select('endpoint, p256dh, auth')
  let sent = 0
  const dead: string[] = []
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 1800 })
        sent += 1
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) dead.push(s.endpoint)
      }
    }),
  )
  if (dead.length > 0) await admin.from('push_subscriptions').delete().in('endpoint', dead)
  return json(200, { sent, removed: dead.length })
})
