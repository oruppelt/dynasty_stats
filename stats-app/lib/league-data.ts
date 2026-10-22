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
