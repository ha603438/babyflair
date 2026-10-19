// BabyFlair rating engine ("BabyElo v2") — pure, deterministic, dependency-free, erasable TypeScript
// (plain `node rating.ts` on Node >= 23.6: no enums, namespaces, parameter properties or decorators).
// Ratings are a pure function of (players, matches, config), recomputed by replay() from the ordered history.

export type Target = 5 | 10;

export type Player = {
  id: string;
  name: string;
  isGuest?: boolean; // display badge only: a guest is rated exactly like everyone else
  createdAt: number; // ms since epoch
};

export type Match = {
  id: string; // non-empty, unique
  seq: number; // immutable ordering key: nextSeq(allStoredMatches) at creation; an edit never changes it
  playedAt: number; // ms since epoch, user-editable (the only way to move a match in the replay order)
  createdAt: number; // ms since epoch, set once when the row is first saved; an edit never changes it
  updatedAt?: number; // ms since epoch, set by an edit (display only: "modifié"); the engine ignores it
  target: Target; // 5 or 10
  teamA: string[]; // 1 or 2 player ids
  teamB: string[]; // same number of player ids as teamA
  scoreA: number;
  scoreB: number;
  deletedAt?: number | null; // soft delete: a NUMBER means deleted (ignored by replay, kept for restore)
  comeback?: boolean; // winners came back from 0-4 to win 5-4 (only meaningful on a 5-4 in a race to 5)
  betA?: number | null; // team A announced « we win by at least N goals » (integer 1..target); missing / null = none
  betB?: number | null; // same for team B
};

export type Config = {
  K: number; // base step for an established player
  scale: number; // Elo divisor
  formatFactor5: number; // the rating gap is multiplied by this in a race to 5
  formatFactor10: number; // ... and by this in a race to 10
  marginUnit: number; // G = 1 + (target - loserGoals) / marginUnit
  shareMin: number; // a teammate never takes less than this share of the team delta ...
  shareMax: number; // ... nor more than this
  rookieK0: number; // multiplier on a player's first match ...
  rookieSpan: number; // ... decaying linearly to 1 at this many matches
  rankedAfter: number; // matches needed to leave the Rookies section
  inactiveDays: number; // days without a match before a player is listed as Inactive
  startRating: number;
  fannyBonus: number; // extra multiplier on the match when the loser scored 0 (5-0, 10-0)
  comebackBonus: number; // extra multiplier on a 5-4 flagged as a comeback
  betStake: number; // an announcement pays betStake × (1 - p) to each member on a success, costs betStake × p otherwise
};

export const DEFAULT_CONFIG: Config = {
  K: 16,
  scale: 400,
  formatFactor5: 0.7,
  formatFactor10: 1.0,
  marginUnit: 10,
  shareMin: 0.45,
  shareMax: 0.55,
  rookieK0: 3,
  rookieSpan: 20,
  rankedAfter: 10,
  inactiveDays: 30,
  startRating: 1000,
  fannyBonus: 1.2,
  comebackBonus: 1.25,
  betStake: 16,
};

// A team's announcement as rated: n = announced minimum margin, chance = p, delta = the points it adds to EACH member.
export type BetResult = { n: number; chance: number; success: boolean; delta: number };

export type PlayerState = { rating: number; matches: number; wins: number; losses: number; lastPlayedAt: number | null };
export type RatingsState = Record<string, PlayerState>;
export type PlayerDelta = { // everything needed to explain one player's delta in one match (the "why" line)
  playerId: string;
  team: 'A' | 'B';
  won: boolean;
  target: Target;
  scoreFor: number;
  scoreAgainst: number;
  expected: number; // the player's TEAM win expectation E_X (0..1)
  margin: number; // G
  bonus: number; // fanny / comeback multiplier (1 when none)
  bonusKind: 'fanny' | 'comeback' | null;
  teamSize: 1 | 2;
  share: number; // this player's share of the team delta (1 in a 1v1)
  rookieK: number; // 1 for an established player
  matchesBefore: number;
  ratingBefore: number;
  ratingAfter: number;
  delta: number; // ratingAfter - ratingBefore, rounded to 0.001 (the announcement included)
  bet: BetResult | null; // the team's announcement, null when it announced nothing
};
export type MatchResult = { matchId: string; deltas: PlayerDelta[] };
export type ReplayResult = { players: RatingsState; matches: MatchResult[] };

export function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

export function freshState(config: Config = DEFAULT_CONFIG): PlayerState {
  return { rating: config.startRating, matches: 0, wins: 0, losses: 0, lastPlayedAt: null };
}

// Win expectation of a side rated `gap` points above its opponent, in a race to `target`.
export function expectedScore(gap: number, target: Target, config: Config = DEFAULT_CONFIG): number {
  const f = target === 5 ? config.formatFactor5 : config.formatFactor10;
  return 1 / (1 + Math.pow(10, (-f * gap) / config.scale));
}

export function marginMultiplier(target: Target, scoreA: number, scoreB: number, config: Config = DEFAULT_CONFIG): number {
  return 1 + (target - Math.min(scoreA, scoreB)) / config.marginUnit;
}

export type MatchBonus = { kind: 'fanny' | 'comeback' | null; multiplier: number };

// Fanny (the loser scored 0) or flagged comeback (5-4 in a race to 5): the whole match counts a bit more, for the
// winners and for the losers alike, so the system stays zero-sum.
export function matchBonus(match: Pick<Match, 'target' | 'scoreA' | 'scoreB' | 'comeback'>, config: Config = DEFAULT_CONFIG): MatchBonus {
  const loser = Math.min(match.scoreA, match.scoreB);
  if (loser === 0) return { kind: 'fanny', multiplier: config.fannyBonus };
  if (match.comeback === true && match.target === 5 && loser === 4) return { kind: 'comeback', multiplier: config.comebackBonus };
  return { kind: null, multiplier: 1 };
}

// k = max(1, K0 - (K0 - 1) * n / SPAN); with the defaults 3 - n/10: x3 on the first match, x2 on the 11th, x1 from the 21st.
export function rookieMultiplier(matchesBefore: number, config: Config = DEFAULT_CONFIG): number {
  return Math.max(1, config.rookieK0 - ((config.rookieK0 - 1) * matchesBefore) / config.rookieSpan);
}

// Teammates' shares of the team delta: proportional to each member's "surprise" at the result (1 - e_i on a win,
// e_i on a loss, e_i = own expectation vs the opposing team), clamped to [shareMin, shareMax], renormalised to 1.
export function teamShares(
  memberRatings: number[],
  opponentRating: number,
  won: boolean,
  target: Target,
  config: Config = DEFAULT_CONFIG,
): number[] {
  if (memberRatings.length === 1) return [1];
  const surprise = memberRatings.map((r) => {
    const e = expectedScore(r - opponentRating, target, config);
    if (won) return 1 - e;
    return e;
  });
  const total = surprise.reduce((a, b) => a + b, 0);
  const clamped = surprise.map((s) => Math.min(config.shareMax, Math.max(config.shareMin, s / total)));
  const clampedTotal = clamped.reduce((a, b) => a + b, 0);
  return clamped.map((s) => s / clampedTotal);
}

// ---------------------------------------------------------------------------
// Announcements (« on gagne d'au moins N buts »): an independent-goals model calibrated on the Elo expectation.
// ---------------------------------------------------------------------------

const BISECTION_STEPS = 60;

// P(a side scoring each goal with probability q reaches `target` first while the other side scores at most
// `maxLoser`) = Σ_{k=0}^{maxLoser} C(target - 1 + k, k) q^target (1 - q)^k (negative binomial).
function raceWin(q: number, target: number, maxLoser: number): number {
  let term = Math.pow(q, target); // k = 0
  let sum = 0;
  for (let k = 0; k <= maxLoser; k++) {
    if (k > 0) term *= ((target - 1 + k) / k) * (1 - q);
    sum += term;
  }
  return sum;
}

// The per-goal probability q whose race to `target` is won with probability `expected` (bisection: deterministic,
// the race probability grows with q).
export function goalProbability(expected: number, target: Target): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < BISECTION_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (raceWin(mid, target, target - 1) < expected) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// Chance that a side with win expectation `expected` wins by at least `n` goals (the loser scores ≤ target - n).
// n = 1 gives `expected` back, n = target the chance of a fanny.
export function betChance(expected: number, target: Target, n: number): number {
  return raceWin(goalProbability(expected, target), target, target - n);
}

// What an announcement of `n` is worth to each member: +stake × (1 - p) if it works, -stake × p otherwise. Zero
// expected value under the model, so announcing cannot be gamed.
export function betOutlook(
  expected: number,
  target: Target,
  n: number,
  config: Config = DEFAULT_CONFIG,
): { chance: number; success: number; failure: number } {
  const chance = betChance(expected, target, n);
  return { chance, success: config.betStake * (1 - chance), failure: -config.betStake * chance };
}

// The announcement of one side, rated: success = that side won with a margin (target - loser goals) of at least n.
// Added as is to each member: no teammate split, rookie, margin or fanny / comeback multiplier.
export function rateBet(
  n: number | null | undefined,
  side: { won: boolean; expected: number },
  match: Pick<Match, 'target' | 'scoreA' | 'scoreB'>,
  config: Config = DEFAULT_CONFIG,
): BetResult | null {
  if (n === null || n === undefined) return null;
  const outlook = betOutlook(side.expected, match.target, n, config);
  const margin = match.target - Math.min(match.scoreA, match.scoreB);
  const success = side.won && margin >= n;
  if (success) return { n, chance: outlook.chance, success, delta: round3(outlook.success) };
  return { n, chance: outlook.chance, success, delta: round3(outlook.failure) };
}

// The points an announcement adds to each member of its team (0 without one).
function betPoints(bet: BetResult | null): number {
  if (bet === null) return 0;
  return bet.delta;
}

export function isDeleted(match: Match): boolean {
  return typeof match.deletedAt === 'number';
}

// Throws on any row the engine must not rate. The form blocks the same cases before saving.
export function validateMatch(match: Match, players?: Player[]): void {
  const fail = (msg: string): never => {
    throw new Error(`Invalid match ${match.id}: ${msg}`);
  };
  if (typeof match.id !== 'string' || match.id.length === 0) fail('id must be a non-empty string');
  if (match.target !== 5 && match.target !== 10) fail('target must be 5 or 10');
  if (!Number.isFinite(match.playedAt)) fail('playedAt must be a finite timestamp');
  if (!Number.isFinite(match.createdAt)) fail('createdAt must be a finite timestamp');
  if (!Number.isFinite(match.seq)) fail('seq must be a finite number');
  if (!Number.isInteger(match.scoreA) || !Number.isInteger(match.scoreB)) fail('scores must be integers');
  const aAtTarget = match.scoreA === match.target;
  const bAtTarget = match.scoreB === match.target;
  if (aAtTarget === bAtTarget) fail('exactly one team must have the target score');
  const loser = Math.min(match.scoreA, match.scoreB);
  if (loser < 0 || loser > match.target - 1) fail('the losing score must be between 0 and target - 1');
  for (const team of [match.teamA, match.teamB]) {
    if (!Array.isArray(team) || team.length < 1 || team.length > 2) fail('each team has 1 or 2 players');
  }
  if (match.teamA.length !== match.teamB.length) fail('both teams must have the same number of players');
  const ids = [...match.teamA, ...match.teamB];
  if (new Set(ids).size !== ids.length) fail('a player cannot appear twice');
  for (const bet of [match.betA, match.betB]) {
    if (bet === undefined || bet === null) continue;
    if (Number.isInteger(bet) && bet >= 1 && bet <= match.target) continue;
    fail('an announced margin must be an integer in 1..target');
  }
  if (players === undefined) return;
  const known = new Set(players.map((p) => p.id));
  for (const id of ids) if (!known.has(id)) fail(`unknown player ${id}`);
}

// Replay order: non-deleted matches by playedAt, then seq (inherited by edits), then id. Pure (returns a copy).
export function orderMatches(matches: Match[]): Match[] {
  return matches
    .filter((m) => !isDeleted(m))
    .sort((a, b) => {
      if (a.playedAt !== b.playedAt) return a.playedAt - b.playedAt;
      if (a.seq !== b.seq) return a.seq - b.seq;
      if (a.id === b.id) return 0;
      return a.id < b.id ? -1 : 1;
    });
}

// seq for a new match: 1 + the greatest seq over ALL stored rows, deleted ones included (so a restore never collides).
export function nextSeq(allMatches: Match[]): number {
  return 1 + allMatches.reduce((max, m) => Math.max(max, m.seq), 0);
}

// "Annuler le dernier match": the most recently ENTERED non-deleted match (createdAt desc, seq desc, id desc).
// Edits never change createdAt, so correcting an old match never makes it the "last" one.
export function lastEntered(allMatches: Match[]): Match | undefined {
  let best: Match | undefined;
  for (const m of allMatches) {
    if (isDeleted(m)) continue;
    if (best === undefined) { best = m; continue; }
    if (m.createdAt !== best.createdAt) { if (m.createdAt > best.createdAt) best = m; continue; }
    if (m.seq !== best.seq) { if (m.seq > best.seq) best = m; continue; }
    if (m.id > best.id) best = m;
  }
  return best;
}

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

// Applies one match. Pure: returns a new state and the per-player deltas. Pass `players` (the preview must) so an
// unknown id throws instead of silently starting at startRating; a player absent from `state` starts fresh.
export function applyMatch(
  state: RatingsState,
  match: Match,
  config: Config = DEFAULT_CONFIG,
  players?: Player[],
): { newState: RatingsState; deltas: PlayerDelta[] } {
  validateMatch(match, players);
  const get = (id: string): PlayerState => state[id] ?? freshState(config);
  const rA = mean(match.teamA.map((id) => get(id).rating));
  const rB = mean(match.teamB.map((id) => get(id).rating));
  const eA = expectedScore(rA - rB, match.target, config);
  const aWon = match.scoreA === match.target;
  const g = marginMultiplier(match.target, match.scoreA, match.scoreB, config);
  const bonus = matchBonus(match, config);
  const baseA = config.K * g * bonus.multiplier * ((aWon ? 1 : 0) - eA); // per-member base delta of team A; B gets -baseA
  const sides = [
    { team: 'A' as const, ids: match.teamA, opp: rB, won: aWon, expected: eA, base: baseA, f: match.scoreA, a: match.scoreB },
    { team: 'B' as const, ids: match.teamB, opp: rA, won: !aWon, expected: 1 - eA, base: -baseA, f: match.scoreB, a: match.scoreA },
  ];
  const announced = { A: match.betA, B: match.betB };
  const newState: RatingsState = { ...state };
  const deltas: PlayerDelta[] = [];
  for (const side of sides) {
    const shares = teamShares(side.ids.map((id) => get(id).rating), side.opp, side.won, match.target, config);
    const bet = rateBet(announced[side.team], side, match, config);
    const betPart = betPoints(bet); // + 0 leaves a match without announcement bit-identical
    side.ids.forEach((id, i) => {
      const before = get(id);
      const rookieK = rookieMultiplier(before.matches, config);
      const ratingAfter = round3(before.rating + side.ids.length * side.base * shares[i] * rookieK + betPart);
      newState[id] = {
        rating: ratingAfter,
        matches: before.matches + 1,
        wins: before.wins + (side.won ? 1 : 0),
        losses: before.losses + (side.won ? 0 : 1),
        lastPlayedAt: Math.max(before.lastPlayedAt ?? -Infinity, match.playedAt),
      };
      deltas.push({
        playerId: id, team: side.team, won: side.won, target: match.target, scoreFor: side.f, scoreAgainst: side.a,
        expected: side.expected, margin: g, bonus: bonus.multiplier, bonusKind: bonus.kind, teamSize: side.ids.length as 1 | 2, share: shares[i], rookieK,
        matchesBefore: before.matches, ratingBefore: before.rating, ratingAfter, delta: round3(ratingAfter - before.rating),
        bet,
      });
    });
  }
  return { newState, deltas };
}

// Full replay from scratch. Everyone starts at startRating with 0 matches; deleted matches are skipped.
// Rejects duplicate player ids, duplicate match ids and duplicate seq values (deleted rows included), so the
// replay order is always a total order that does not depend on uuid luck.
export function replay(players: Player[], matches: Match[], config: Config = DEFAULT_CONFIG): ReplayResult {
  if (new Set(players.map((p) => p.id)).size !== players.length) throw new Error('duplicate player id');
  if (new Set(matches.map((m) => m.id)).size !== matches.length) throw new Error('duplicate match id');
  if (new Set(matches.map((m) => m.seq)).size !== matches.length) throw new Error('duplicate match seq');
  let state: RatingsState = {};
  for (const p of players) state[p.id] = freshState(config);
  const results: MatchResult[] = [];
  for (const match of orderMatches(matches)) {
    const applied = applyMatch(state, match, config, players);
    state = applied.newState;
    results.push({ matchId: match.id, deltas: applied.deltas });
  }
  return { players: state, matches: results };
}

export type LeaderboardRow = PlayerState & { player: Player; rank: number | null };
export type Leaderboard = { ranked: LeaderboardRow[]; rookies: LeaderboardRow[]; inactive: LeaderboardRow[] };

// Name key for the tie-break: accents stripped, lower-cased (deterministic on every device, no locale involved).
export function nameKey(name: string): string {
  return name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

// Tie-break: rating desc, matches desc, nameKey asc, raw name asc, id asc (a total order).
export function compareRows(a: LeaderboardRow, b: LeaderboardRow): number {
  if (a.rating !== b.rating) return b.rating - a.rating;
  if (a.matches !== b.matches) return b.matches - a.matches;
  const ka = nameKey(a.player.name);
  const kb = nameKey(b.player.name);
  if (ka !== kb) return ka < kb ? -1 : 1;
  if (a.player.name !== b.player.name) return a.player.name < b.player.name ? -1 : 1;
  if (a.player.id === b.player.id) return 0;
  return a.player.id < b.player.id ? -1 : 1;
}

// Sections, precedence inactive > rookie > ranked. Inactive = no match for inactiveDays (never played: from createdAt).
export function leaderboard(players: Player[], state: RatingsState, now: number, config: Config = DEFAULT_CONFIG): Leaderboard {
  const rows: LeaderboardRow[] = players.map((player) => ({ ...(state[player.id] ?? freshState(config)), player, rank: null }));
  rows.sort(compareRows);
  const out: Leaderboard = { ranked: [], rookies: [], inactive: [] };
  const inactiveMs = config.inactiveDays * 86_400_000;
  for (const row of rows) {
    const lastActivity = row.lastPlayedAt ?? row.player.createdAt;
    if (now - lastActivity >= inactiveMs) {
      out.inactive.push(row);
    } else if (row.matches < config.rankedAfter) {
      out.rookies.push(row);
    } else {
      out.ranked.push({ ...row, rank: out.ranked.length + 1 });
    }
  }
  return out;
}

// French "why" line: "Victoire 10-8 (en 10) · 50 % de chances · marge ×1,2 · part 55 % · débutant ×3,0 → +31,7"
// 1.2 → « 1,2 », 1.25 → « 1,25 »: two decimals at most, trailing zeros dropped.
function frTrim(x: number): string {
  return String(Math.round(x * 100) / 100).replace('.', ',');
}

export function whyFr(d: PlayerDelta): string {
  const fr = (x: number, digits: number): string => x.toFixed(digits).replace('.', ',');
  const parts = [
    `${d.won ? 'Victoire' : 'Défaite'} ${d.scoreFor}-${d.scoreAgainst} (en ${d.target})`,
    `${Math.round(d.expected * 100)} % de chances`,
    `marge ×${fr(d.margin, 1)}`,
  ];
  if (d.teamSize === 2) parts.push(`part ${Math.round(d.share * 100)} %`);
  if (d.bonusKind !== null) parts.push(`${d.bonusKind} ×${frTrim(d.bonus)}`);
  if (d.rookieK > 1) parts.push(`débutant ×${fr(d.rookieK, 1)}`);
  if (d.bet) parts.push(betWhy(d.bet));
  const sign = d.delta >= 0 ? '+' : '−';
  return `${parts.join(' · ')} → ${sign}${fr(Math.abs(d.delta), 1)}`;
}

// « annonce +4 réussie (23 % de chances) +12,4 » / « annonce +4 ratée (23 % de chances) −3,6 »
function betWhy(bet: BetResult): string {
  const chance = `(${Math.round(bet.chance * 100)} % de chances)`;
  const points = Math.abs(bet.delta).toFixed(1).replace('.', ',');
  if (bet.success) return `annonce +${bet.n} réussie ${chance} +${points}`;
  return `annonce +${bet.n} ratée ${chance} −${points}`;
}
