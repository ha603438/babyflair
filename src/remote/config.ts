// Mode partagé: the Supabase project the app talks to, read from the build-time env. Both variables missing (dev
// server without a .env, tests) → null, and the store stays local-only.

export type RemoteConfig = { url: string; anonKey: string }

function nonEmpty(value: string | undefined): string | null {
  if (value === undefined) return null
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  return trimmed
}

export function remoteConfigFrom(env: { VITE_SUPABASE_URL?: string; VITE_SUPABASE_ANON_KEY?: string }): RemoteConfig | null {
  const url = nonEmpty(env.VITE_SUPABASE_URL)
  const anonKey = nonEmpty(env.VITE_SUPABASE_ANON_KEY)
  if (url === null || anonKey === null) return null
  return { url: url.replace(/\/+$/, ''), anonKey }
}

export function remoteConfig(): RemoteConfig | null {
  return remoteConfigFrom(import.meta.env)
}
