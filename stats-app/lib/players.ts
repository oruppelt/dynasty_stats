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
}

/** A player's points for one team in a season (or over several seasons). */
export interface TeamPlayer {
  player_id: string;
  player: string;
  points: number;
  starts: number;
  gp: number;
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

/** Shape of /data/players/alltime.json: every season's player records. Regular season apart from `playoffs`. */
export interface AllTimePlayers {
  meta: { seasons: string[] };
  best_periods: SeasonPlayerPeriod[];
  best_bench: SeasonPlayerPeriod[];
  /** A player's points in one season (every team) */
  best_seasons: (PlayerLeader & { season: string })[];
  /** Points over every season */
  career: (PlayerLeader & { seasons: number })[];
  /** Per team, its all-time top 10 scorers (points for that team) */
  franchises: Record<string, (TeamPlayer & { seasons: number })[]>;
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
