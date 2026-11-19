// BabyFlair — envoie « X propose une règle : « … ». D'accord ? » à tous les téléphones abonnés, sauf l'auteur.
// Appelée par l'app : POST { rule_id, exclude_endpoint? } avec l'en-tête x-office-code. Même fonctionnement que
// notify-call : code vérifié via office_ok(), abonnements lus avec la clé service, abonnements morts (404 / 410)
// supprimés. Secrets attendus : VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-office-code, x-player-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const MAX_QUOTE = 90

function quote(text: string): string {
  const chars = Array.from(text.trim())
  if (chars.length <= MAX_QUOTE) return text.trim()
  return `${chars.slice(0, MAX_QUOTE).join('').trimEnd()}…`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'POST only' })

  const officeCode = req.headers.get('x-office-code') ?? ''
  const url = Deno.env.get('SUPABASE_URL')!
  const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { 'x-office-code': officeCode } } })
  const { data: ok } = await anon.rpc('office_ok')
  if (ok !== true) return json(403, { error: 'code du bureau refusé' })

  const body = await req.json().catch(() => ({}))
  const ruleId = body?.rule_id
  const excludeEndpoint = typeof body?.exclude_endpoint === 'string' ? body.exclude_endpoint : null
  if (typeof ruleId !== 'string') return json(400, { error: 'rule_id manquant' })

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: rule, error: ruleError } = await admin.from('rules').select('id, text, created_by').eq('id', ruleId).maybeSingle()
  if (ruleError) console.error('rule lookup failed', ruleError)
  if (!rule) return json(404, { error: 'règle inconnue' })
  const { data: author } = await admin.from('players').select('name').eq('id', rule.created_by).maybeSingle()
  const name = author?.name ?? 'Quelqu’un'

  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') ?? 'https://ha603438.github.io/babyflair/',
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  )
  const text = `${name} propose une règle : « ${quote(rule.text)} ». D’accord ?`
  const payload = JSON.stringify({ title: 'BabyFlair · Règlement', body: text, url: '#/reglement', tag: `rule-${ruleId}` })

  const { data: subs, error: subsError } = await admin.from('push_subscriptions').select('endpoint, p256dh, auth, player_id')
  if (subsError) console.error('subscriptions lookup failed', subsError)
  const targets = (subs ?? []).filter((s) => s.endpoint !== excludeEndpoint && s.player_id !== rule.created_by)
  let sent = 0
  let failed = 0
  const dead: string[] = []
  await Promise.all(
    targets.map(async (s) => {
      try {
        // A day to deliver: unlike a call, a rule can wait until the phone is back.
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86_400 })
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
  console.log(`rule ${ruleId}: ${(subs ?? []).length} subscriptions, ${skipped} skipped (author), ${sent} sent, ${failed} failed`)
  return json(200, { sent, failed, skipped, removed: dead.length })
})
