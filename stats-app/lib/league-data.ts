import { useQuery } from '@tanstack/react-query'

// Shapes of /data/league.json, written by pipeline/build_data.py.

/** A matrix row: the team under `Team`, then one value per opponent (null = never played, or the team itself). */
export interface MatrixRow {
  Team: string;
  [opponent: string]: number | string | null;
}

/** Team-vs-team matrices; rows in `teams` order. */
export interface Matchups {
  teams: string[];
  /** Share of periods the row team outscored the opponent */
  all_play: MatrixRow[];
  /** Actual head-to-head wins (a tie counts half) */
  wins: MatrixRow[];
  /** Head-to-head games played */
  games: MatrixRow[];
  /** Head-to-head wins minus expected wins (all_play x games); a row sums to the team's luck */
  luck: MatrixRow[];
}

/** Season totals. A tie counts as half a win and half a loss. */
export interface TeamSummary {
  team: string;
  games: number;
  wins: number;
  losses: number;
  all_play_wins: number;
  all_play_losses: number;
  points_for: number;
  points_against: number;
  /** Actual minus all-play expected wins */
  luck: number;
}

/** One team's game in one scoring period (two periods per week: Mon–Thu, Fri–Sun). */
export interface PeriodResult {
  period: number;
  team: string;
  score: number;
  opponent: string;
  opp_score: number;
  /** 1, 0.5 (tie) or 0 */
  win: number;
  /** Teams outscored that period (ties count half) */
  all_play_wins: number;
  all_play_losses: number;
  /** The team's total luck through this period, from the games played so far */
  luck_to_date: number;
}

/** A playoff game, as played (Team was the away side in Fantrax). */
export interface PlayoffGame {
  team: string;
  score: number;
  opponent: string;
  opp_score: number;
}

export interface SwissStanding {
  team: string;
  /** Regular-season rank */
  seed: number;
  wins: number;
  losses: number;
  /** 3 wins: through to the knockout; 3 losses: out */
  status: 'through' | 'out' | 'playing';
}

/** A best-of-3 knockout series; the better seed first in every pair. */
export interface Series {
  teams: [string, string];
  seeds: [number, number];
  wins: [number, number];
  winner: string | null;
  games: (PlayoffGame & { period: number })[];
}

/** The playoffs (LEAGUE.md): a Swiss stage, then a seeded knockout. */
export interface Playoffs {
  swiss: {
    rounds: { round: number; period: number; games: PlayoffGame[] }[];
    /** Best record first */
    standings: SwissStanding[];
  };
  knockout: { round: number; name: string; series: Series[] }[];
  champion: string | null;
}

export interface LeagueData {
  meta: {
    /** When the data last changed */
    updated_at: string;
    games: number;
    latest_period: number;
  };
  teams: TeamSummary[];
  results: PeriodResult[];
  matchups: Matchups;
  /** Null before the playoffs start, and for data from the sheet */
  playoffs: Playoffs | null;
}

async function fetchLeagueData(): Promise<LeagueData> {
  const response = await fetch('/data/league.json')
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  return response.json()
}

/** The whole league dataset; one request shared by every component. */
export function useLeagueData() {
  return useQuery({ queryKey: ['league'], queryFn: fetchLeagueData })
}
