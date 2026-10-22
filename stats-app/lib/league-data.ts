import { useQuery } from '@tanstack/react-query'

// Shapes of /data/league.json, written by pipeline/build_data.py.

/** A matrix row: the team under `Team`, then one value per opponent (null = never played, or the team itself). */
export interface MatrixRow {
  Team: string;
  [opponent: string]: number | string | null;
}

export interface RankedMatrixRow extends MatrixRow {
  Strength: number;
  Rank: number;
}

export interface StrengthData {
  teams: string[];
  /** All-play win rate against each opponent; Strength = row mean */
  matrix: RankedMatrixRow[];
  /** Actual head-to-head wins */
  matrix_wins: MatrixRow[];
  /** Head-to-head games played */
  matrix_games: MatrixRow[];
  metadata: {
    maxWinRate: number;
    minWinRate: number;
  };
}

export interface ScheduleStrengthData {
  teams: string[];
  /** Actual minus all-play expected wins against each opponent; Strength = total luck */
  matrix: RankedMatrixRow[];
  matrix_wins: MatrixRow[];
}

export interface ForAgainstData {
  df_scores: {
    Team: string;
    'Scored For': number;
    'Scored Against': number;
  }[];
  median_scored_for: number;
  median_scored_against: number;
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
  strength: StrengthData;
  schedule_strength: ScheduleStrengthData;
  for_against: ForAgainstData;
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
