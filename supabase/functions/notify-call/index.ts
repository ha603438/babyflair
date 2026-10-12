// BabyFlair — envoie la notification « X propose un baby » à tous les téléphones abonnés, sauf l'organisateur.
// Appelée par l'app : POST { call_id, exclude_endpoint? } avec l'en-tête x-office-code. Vérifie le code via office_ok(),
// lit les abonnements avec la clé service (jamais exposée au navigateur), envoie un Web Push à chacun, sauf au
// téléphone qui a lancé l'appel (exclude_endpoint) et aux abonnements liés au joueur organisateur, puis supprime les
// abonnements morts (404 / 410). Secrets attendus : VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-office-code, x-player-id',
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

  const body = await req.json().catch(() => ({}))
  const callId = body?.call_id
  const excludeEndpoint = typeof body?.exclude_endpoint === 'string' ? body.exclude_endpoint : null
  if (typeof callId !== 'string') return json(400, { error: 'call_id manquant' })

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  // Two simple queries: an embedded players(...) join is ambiguous (calls ↔ players via created_by and call_players).
  const { data: call, error: callError } = await admin.from('calls').select('id, created_by').eq('id', callId).maybeSingle()
  if (callError) console.error('call lookup failed', callError)
  if (!call) return json(404, { error: 'appel inconnu' })
  const { data: organizer } = await admin.from('players').select('name').eq('id', call.created_by).maybeSingle()
  const name = organizer?.name ?? 'Quelqu’un'

  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') ?? 'https://ha603438.github.io/babyflair/',
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  )
  const payload = JSON.stringify({ title: 'BabyFlair', body: `${name} propose un baby ! Chaud ?`, url: `#/appel/${callId}`, tag: `call-${callId}` })

  const { data: subs, error: subsError } = await admin.from('push_subscriptions').select('endpoint, p256dh, auth, player_id')
  if (subsError) console.error('subscriptions lookup failed', subsError)
  const targets = (subs ?? []).filter((s) => s.endpoint !== excludeEndpoint && s.player_id !== call.created_by)
  let sent = 0
  let failed = 0
  const dead: string[] = []
  await Promise.all(
    targets.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 300 })
        sent += 1
      } catch (error) {
        failed += 1
        const status = (error as { statusCode?: number }).statusCode
        console.error('push failed', status, (error as { body?: string }).body ?? String(error))
        if (status === 404 || status === 410) dead.push(s.endpoint)
      }
    }),
  )
  if (dead.length > 0) await admin.from('push_subscriptions').delete().in('endpoint', dead)
  const skipped = (subs ?? []).length - targets.length
  console.log(`call ${callId}: ${(subs ?? []).length} subscriptions, ${skipped} skipped (organizer), ${sent} sent, ${failed} failed`)
  return json(200, { sent, failed, skipped, removed: dead.length })
})
