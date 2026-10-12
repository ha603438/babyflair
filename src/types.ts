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
  /** Mode partagé: who saved / last changed it, set by a server trigger from x-player-id. Never sent by the app. */
  createdBy?: PlayerId
  updatedBy?: PlayerId
}

export type Settings = {
  lastFormat: Format
  lastTarget: Target
  installHintDismissedAt?: string
  exportHintDismissedAt?: string
  lastExportAt?: string
  /** Mode partagé: the office code this phone sends to the server. Never exported. */
  officeCode?: string
  /** Id of the newest Nouveautés entry seen on this phone (tab badge). */
  seenChangelogId?: string
  /** Profile of this phone (« Qui es-tu ? »): signs its matches and call answers (x-player-id). Never exported. */
  myPlayerId?: PlayerId
  /** The profile was chosen on the « Qui es-tu ? » screen (player or visitor); cleared by « Changer ». */
  profileConfirmed?: boolean
  /** Mode invité: read-only, no x-player-id. */
  visitor?: boolean
  /** This phone holds a push subscription on the server (Réglages › Notifications). */
  pushEnabled?: boolean
  notifHintDismissedAt?: string
}

// Appels à jouer (« Proposer un baby »): shared through the server only; local mode keeps both arrays empty.

export type Call = {
  id: string
  createdAt: string
  /** Ignored client-side once past (no server cron). */
  expiresAt: string
  createdBy: PlayerId
  closedAt?: string
}

export type CallPlayer = { callId: string; playerId: PlayerId; joinedAt: string }

// Journal des modifications (mode partagé): match_events rows, written by a server trigger only.

export type MatchEventAction = 'created' | 'updated' | 'deleted' | 'restored'

/** The parts of a match row the journal displays (before / after of an event). */
export type MatchSnapshot = { target: Target; teamA: PlayerId[]; teamB: PlayerId[]; scoreA: number; scoreB: number }

export type MatchEvent = {
  id: number
  at: string
  action: MatchEventAction
  matchId: MatchId
  /** Null when the request carried no (valid) x-player-id, or the player was deleted since. */
  actorId: PlayerId | null
  before: MatchSnapshot | null
  after: MatchSnapshot | null
}

export type SyncMode = 'local' | 'shared'
export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'unauthorized'

export type Store = {
  version: 1
  players: Player[]
  matches: Match[]
  settings: Settings
  nextSeq: number
  calls: Call[]
  callPlayers: CallPlayer[]
}

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
