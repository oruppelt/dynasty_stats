import { useQuery } from '@tanstack/react-query'
import { useLeagueData } from './league-data'

// Shape of /data/players/<season>.json (pipeline/players.py): the season's
// player lists, regular season only. Points are fantasy points.

/** One player's points in one period, for one team. */
export interface PlayerPeriod {
  period: number;
  team: string;
  player_id: string;
  player: string;
  fpts: number;
  /** NBA games played that period */
  gp: number;
}

/** A player's season: points scored for a fantasy team (lineup only). */
export interface PlayerLeader {
  player_id: string;
  player: string;
  /** Every team the player scored for, in order (traded players have several) */
  teams: string[];
  points: number;
  /** Periods in a lineup */
  starts: number;
  /** NBA games played in those periods */
  gp: number;
  /** Salary paid (prorated by periods on a roster); not in the playoff lists */
  salary?: number;
}

/** A player's points for one team in a season (or over several seasons). */
export interface TeamPlayer {
  player_id: string;
  player: string;
  points: number;
  starts: number;
  gp: number;
  /** Salary this team paid (all-time franchise lists) */
  salary?: number;
}

export interface TeamPlayers {
  team: string;
  /** The lineup's points (the team's points for, apart from commissioner adjustments) */
  points: number;
  /** Points scored by players on the bench (not injured reserve or minors) */
  bench_points: number;
  top_scorer: { player_id: string; player: string; points: number };
  /** The team's top 5 scorers (points for this team) */
  top_players: TeamPlayer[];
  /** The team's biggest single-player period */
  best_period: PlayerPeriod;
}

/** One regular-season period's players, for the recap. */
export interface PeriodPlayers {
  period: number;
  /** The period's 5 best scores (in a lineup) */
  best: PlayerPeriod[];
  /** The 3 biggest bench scores */
  bench: PlayerPeriod[];
  /** Each team's top scorer that period */
  team_top: Record<string, { player_id: string; player: string; fpts: number; gp: number }>;
}

export interface PlayersData {
  meta: { season: string; periods: number; players: number; regular_periods: number[]; playoff_periods: number[] };
  /** The most points by a player in a lineup in one period */
  best_periods: PlayerPeriod[];
  /** The most points by a player left on the bench in one period */
  best_bench: PlayerPeriod[];
  leaders: PlayerLeader[];
  teams: TeamPlayers[];
  periods: PeriodPlayers[];
  /** Null before the playoffs */
  playoffs: { best_periods: PlayerPeriod[]; leaders: PlayerLeader[] } | null;
}

/** A period entry over several seasons */
export type SeasonPlayerPeriod = PlayerPeriod & { season: string }

/** The all-time lineup records, either regular season only or with the playoffs. */
export interface AllTimeRecords {
  best_periods: SeasonPlayerPeriod[];
  /** A player's points in one season (every team) */
  best_seasons: (PlayerLeader & { season: string })[];
  /** Points over every season */
  career: (PlayerLeader & { seasons: number })[];
  /** Per team, its all-time top 10 scorers (points for that team) */
  franchises: Record<string, (TeamPlayer & { seasons: number })[]>;
}

/** Shape of /data/players/alltime.json: every season's player records. The top-level records are
 * regular season only; `with_playoffs` counts playoff points too; `playoffs` is playoffs only. */
export interface AllTimePlayers extends AllTimeRecords, AllTimeMoreRecords {
  meta: { seasons: string[] };
  best_bench: SeasonPlayerPeriod[];
  with_playoffs: AllTimeRecords;
  playoffs: { best_periods: SeasonPlayerPeriod[]; career: (PlayerLeader & { seasons: number })[] };
}

/** The season on screen's player lists; null when that season has none (yet). */
export function usePlayers() {
  const { data: league } = useLeagueData()
  const season = league?.meta.season
  return useQuery({
    queryKey: ['players', season],
    enabled: !!season,
    queryFn: async (): Promise<PlayersData | null> => {
      const response = await fetch(`/data/players/${season}.json`)
      if (response.status === 404) return null
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      return response.json()
    },
  })
}

/** Every season's player records; null when there are none. */
export function useAllTimePlayers() {
  return useQuery({
    queryKey: ['players', 'alltime'],
    queryFn: async (): Promise<AllTimePlayers | null> => {
      const response = await fetch('/data/players/alltime.json')
      if (response.status === 404) return null
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      return response.json()
    },
  })
}

/** 1234.5 → "1,234.5"; whole numbers without the decimal */
export function formatFpts(points: number): string {
  return points.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

/** Starts for one franchise (regular season), for the longest-serving lists. */
export interface FranchiseStint {
  player_id: string;
  player: string;
  team: string;
  starts: number;
  points: number;
  gp: number;
  seasons: number;
  /** First and last season with a start there */
  first: string;
  last: string;
}

/** Records beyond points, in /data/players/alltime.json (regular season). */
export interface AllTimeMoreRecords {
  longest_serving: FranchiseStint[];
  /** Per team, its 10 players with the most starts */
  franchise_starts: Record<string, FranchiseStint[]>;
  /** Most franchises started for */
  journeymen: (Omit<PlayerLeader, 'gp'> & { seasons: number })[];
  /** A season's points per $1M of salary (at least 12 starts) */
  best_value: (Omit<PlayerLeader, 'gp'> & { season: string; salary: number; contract: string; per_million: number })[];
  /** A player's share of a team's lineup points in a season (at least 12 starts) */
  team_share: { season: string; team: string; player_id: string; player: string; points: number; starts: number; team_points: number; share: number }[];
  /** Per season (not the first) and team: the share of lineup points by players on its roster at the end of the season before */
  continuity: Record<string, Record<string, number>>;
}

/** /data/players/index.json: every player, most career points first. */
export interface PlayerIndexEntry {
  player_id: string;
  player: string;
  /** Latest team and season on a roster */
  team: string;
  season: string;
  /** Career regular-season lineup points */
  points: number;
}

/** One season with one team on a player page. Points are regular season in a lineup unless named otherwise. */
export interface PlayerStint {
  season: string;
  team: string;
  /** Periods on the roster (any slot) */
  periods: number;
  starts: number;
  gp: number;
  points: number;
  bench_points: number;
  playoff_starts: number;
  playoff_points: number;
  /** Salary and contract in the last period there */
  salary: number;
  contract: string;
  /** Salary paid there: the salary times the share of the season's periods on the roster (so far, in a season in progress) */
  paid: number;
}

/** /data/players/player/<id>.json */
export interface PlayerPage {
  player_id: string;
  player: string;
  seasons: PlayerStint[];
  /** The 5 best periods in a lineup, regular season or playoffs */
  best_periods: (SeasonPlayerPeriod & { playoffs: boolean })[];
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const response = await fetch(url)
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  return response.json()
}

/** Every player, for the search; null when there are none. */
export function usePlayerIndex() {
  return useQuery({
    queryKey: ['players', 'index'],
    queryFn: () => fetchJson<PlayerIndexEntry[]>('/data/players/index.json'),
  })
}

/** One player's career; null for an unknown player. */
export function usePlayerPage(playerId: string | null) {
  return useQuery({
    queryKey: ['players', 'player', playerId],
    enabled: !!playerId,
    queryFn: () => fetchJson<PlayerPage>(`/data/players/player/${playerId}.json`),
  })
}

/** 18150000 → "$18.2M", 1000000 → "$1M" */
export function formatSalary(salary: number): string {
  return `$${(salary / 1e6).toLocaleString(undefined, { maximumFractionDigits: 1 })}M`
}

/** Fantrax contract codes, e.g. "R13" → "Rookie contract (1st round), 3 years left" */
export function describeContract(code: string): string {
  const rookie = /^R([12])(\d)$/.exec(code)
  if (rookie) return `Rookie contract (${rookie[1] === '1' ? '1st' : '2nd'} round), ${rookie[2]} year${rookie[2] === '1' ? '' : 's'} left`
  const regular = /^REG(\d)$/.exec(code)
  if (regular) return `${regular[1]} year${regular[1] === '1' ? '' : 's'} left`
  if (code === 'FA') return 'Free agent signing'
  if (code === 'MIN') return 'Minimum contract'
  return code
}
