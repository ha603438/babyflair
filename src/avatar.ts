// Player photos: a link to the colleague's Slack picture (players.photo_url, docs/supabase/photos.sql), initials
// otherwise. Only https links are kept, whatever the source (Supabase row, local storage, imported file).

const MAX_PHOTO_URL_LENGTH = 500

export function readPhotoUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  if (!value.startsWith('https://') || value.length > MAX_PHOTO_URL_LENGTH) return undefined
  return value
}

/** « Julien Fritz » → « JF », « Edgar » → « E », « 🦊 Renard » → « 🦊R » (code points, so an emoji stays whole). */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter((word) => word.length > 0)
  if (words.length === 0) return '?'
  const first = Array.from(words[0])[0]
  if (words.length === 1) return first.toUpperCase()
  const last = Array.from(words[words.length - 1])[0]
  return `${first}${last}`.toUpperCase()
}
