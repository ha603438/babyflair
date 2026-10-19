import type { BetRecord, RatedBet } from '../../betStats'
import { fmtDelta, fmtInt, fmtPercent, plural } from '../../format'
import { hrefOf } from '../../router'

// « 🎯 Annonces » card of the player and duo pages (profileParts.tsx BetsCard): its French copy. Pure: the record comes
// from src/betStats.ts. Days only, never a time of day (and here, no day at all).

/** Whose page: the player's (« A fait tomber ») or the duo's (« Ont fait tomber »). */
export type BetSubject = 'player' | 'duo'

export type BetTileView = { label: string; value: string; href: string | null }
export type BetCardView = { tiles: BetTileView[]; faced: string | null }

export const BET_CARD_COPY = {
  emoji: '🎯',
  title: 'Annonces',
  made: 'Annonces',
  won: 'Réussies',
  points: 'Points d’annonce',
  best: 'Plus belle annonce',
  noBest: 'Aucune',
} as const

const VERB: Record<BetSubject, string> = { player: 'A fait tomber', duo: 'Ont fait tomber' }

function successRate(record: Pick<BetRecord, 'made' | 'won'>): number {
  if (record.made === 0) return 0
  return record.won / record.made
}

/** « 2/3 · 67 % ». */
export function betSuccessText(record: Pick<BetRecord, 'made' | 'won'>): string {
  return `${fmtInt(record.won)}/${fmtInt(record.made)} · ${fmtPercent(successRate(record))}`
}

/** « +4 à 23 % ». */
export function bestBetText(rated: RatedBet): string {
  return `+${fmtInt(rated.bet.n)} à ${fmtPercent(rated.bet.chance)}`
}

/** « A fait tomber 2 annonces adverses sur 3 » (« Ont fait tomber… » for a duo); null without any faced. */
export function facedText(record: Pick<BetRecord, 'faced' | 'broken'>, subject: BetSubject): string | null {
  if (record.faced === 0) return null
  const broken = plural(record.broken, 'annonce adverse', 'annonces adverses')
  return `${VERB[subject]} ${broken} sur ${fmtInt(record.faced)}`
}

function bestTile(best: RatedBet | null): BetTileView {
  const label = BET_CARD_COPY.best
  if (best === null) return { label, value: BET_CARD_COPY.noBest, href: null }
  return { label, value: bestBetText(best), href: hrefOf({ name: 'match-detail', id: best.match.id }) }
}

/** The card's four tiles and its secondary line; null (no card) until the subject made an announcement. */
export function betCardView(record: BetRecord, subject: BetSubject): BetCardView | null {
  if (record.made === 0) return null
  const tiles: BetTileView[] = [
    { label: BET_CARD_COPY.made, value: fmtInt(record.made), href: null },
    { label: BET_CARD_COPY.won, value: betSuccessText(record), href: null },
    { label: BET_CARD_COPY.points, value: fmtDelta(record.points), href: null },
    bestTile(record.best),
  ]
  return { tiles, faced: facedText(record, subject) }
}
