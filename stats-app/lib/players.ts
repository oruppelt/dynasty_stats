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

export interface TeamPlayers {
  team: string;
  /** The lineup's points (the team's points for, apart from commissioner adjustments) */
  points: number;
  /** Points scored by players on the bench (not injured reserve or minors) */
  bench_points: number;
  top_scorer: { player_id: string; player: string; points: number };
}

export interface PlayersData {
  meta: { season: string; periods: number; players: number };
  /** The most points by a player in a lineup in one period */
  best_periods: PlayerPeriod[];
  /** The most points by a player left on the bench in one period */
  best_bench: PlayerPeriod[];
  leaders: PlayerLeader[];
  teams: TeamPlayers[];
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

/** 1234.5 → "1,234.5"; whole numbers without the decimal */
export function formatFpts(points: number): string {
  return points.toLocaleString(undefined, { maximumFractionDigits: 2 })
}
