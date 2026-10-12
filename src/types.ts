// Shared domain types for BabyFlair. Every other module imports its shapes from here.
// All date fields are ISO 8601 strings; ratings and deltas are integers once they reach the UI.

export type PlayerId = string
export type MatchId = string
export type Target = 5 | 10
export type Format = '1v1' | '2v2'
export type Team = 'A' | 'B'

export type Player = { id: PlayerId; name: string; isGuest: boolean; createdAt: string }

export type Match = {
  id: MatchId
  /** Immutable, assigned at creation; with playedAt it defines the replay order. */
  seq: number
  playedAt: string
  createdAt: string
  updatedAt: string
  target: Target
  /** 1 or 2 ids each, equal sizes, all distinct. */
  teamA: PlayerId[]
  teamB: PlayerId[]
  /** Exactly one equals target, the other is in [0, target - 1]. */
  scoreA: number
  scoreB: number
}

export type Settings = {
  lastFormat: Format
  lastTarget: Target
  installHintDismissedAt?: string
  exportHintDismissedAt?: string
  lastExportAt?: string
  /** Mode partagé: the office code this phone sends to the server. Never exported. */
  officeCode?: string
}

export type SyncMode = 'local' | 'shared'
export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'unauthorized'

export type Store = { version: 1; players: Player[]; matches: Match[]; settings: Settings; nextSeq: number }

export type ExportFile = {
  app: 'babyflair'
  version: 1
  exportedAt: string
  players: Player[]
  matches: Match[]
  settings: Settings
}

// Rating engine result shapes (the engine itself lives in src/rating/; the shapes are fixed here).

export type PlayerStatus = 'ranked' | 'rookie' | 'inactive'

export type HistoryPoint = {
  matchId: MatchId
  playedAt: string
  ratingBefore: number
  ratingAfter: number
  delta: number
}

export type PlayerStats = {
  playerId: PlayerId
  /** Integer, rounded by the engine. */
  rating: number
  played: number
  wins: number
  losses: number
  lastPlayedAt?: string
  status: PlayerStatus
  /** 0..10 */
  rookieProgress: number
  history: HistoryPoint[]
}

export type MatchPlayerResult = {
  playerId: PlayerId
  team: Team
  before: number
  after: number
  delta: number
  /**
   * Ready-to-display French line from the engine,
   * e.g. « Attendu 28 % de victoire, gagné 10-8 (×1,1 écart) : +16 ».
   */
  why: string
}

export type MatchResult = { matchId: MatchId; expectedA: number; expectedB: number; perPlayer: MatchPlayerResult[] }

export type ReplayResult = { byPlayer: Map<PlayerId, PlayerStats>; byMatch: Map<MatchId, MatchResult> }

export type Ranking = { ranked: PlayerId[]; rookies: PlayerId[]; inactive: PlayerId[] }

export type Score = { winner: Team; loserGoals: number }

export type Draft = {
  format: Format
  target: Target
  /** Length 4; 1v1 uses indices 0 and 2. */
  slots: (PlayerId | null)[]
  activeSlot: number
  score: Score | null
  step: 'players' | 'score' | 'done'
  lastSavedMatchId?: MatchId
}

export type PreviewWhatIf = {
  expectedA: number
  expectedB: number
  rows: Array<{ playerId: PlayerId; team: Team; winDelta: number; lossDelta: number }>
}

export type PreviewExact = {
  expectedA: number
  expectedB: number
  rows: Array<{ playerId: PlayerId; team: Team; delta: number }>
}
