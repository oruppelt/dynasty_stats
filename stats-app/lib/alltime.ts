import { useQuery } from '@tanstack/react-query'
import type { MatrixRow, RecordGame, Streak } from './league-data'

// Shape of /data/alltime.json (pipeline/alltime.py): every season together.
// Regular season only, apart from the titles and playoff finishes.

/** How far a team went in a season's playoffs, best first. "playoffs": an earlier format, round not known. */
export type Finish = 'champion' | 'final' | 'semifinal' | 'quarterfinal' | 'swiss' | 'playoffs' | 'missed'

export const FINISH_LABEL: Record<Finish, string> = {
  champion: 'Champion',
  final: 'Lost the final',
  semifinal: 'Semifinals',
  quarterfinal: 'Quarterfinals',
  swiss: 'Out in the Swiss stage',
  playoffs: 'Playoffs (earlier format)',
  missed: 'Missed the playoffs',
}

export interface SeasonSummary {
  season: string;
  in_progress: boolean;
  /** Null while in progress, and for an earlier format whose champion isn't recorded */
  champion: string | null;
  runner_up: string | null;
  /** The regular season's best team */
  first_seed: string;
  periods: number;
}

/** A team's regular season. */
export interface TeamSeason {
  season: string;
  team: string;
  /** Regular-season rank (win rate, then points for) */
  rank: number;
  games: number;
  wins: number;
  losses: number;
  all_play_wins: number;
  all_play_losses: number;
  luck: number;
  /** Average of score / period average: 1.10 = 10% above the league */
  score_index: number;
  /** Null while the season is in progress */
  finish: Finish | null;
}

/** Career totals (every season, the one in progress too); the playoff counts and ranks are of finished seasons. */
export interface Franchise {
  team: string;
  seasons: number;
  games: number;
  wins: number;
  losses: number;
  all_play_wins: number;
  all_play_losses: number;
  luck: number;
  score_index: number;
  playoffs: number;
  finals: number;
  titles: number;
  best_rank: number | null;
  average_rank: number | null;
}

export type SeasonGame = RecordGame & { season: string }
export type SeasonStreak = Streak & { season: string }

export interface AllTimeRecords {
  highest_scores: SeasonGame[];
  best_vs_average: SeasonGame[];
  worst_vs_average: SeasonGame[];
  blowouts: SeasonGame[];
  unluckiest_losses: SeasonGame[];
  luckiest_wins: SeasonGame[];
  win_streaks: SeasonStreak[];
  losing_streaks: SeasonStreak[];
  period_highs: { team: string; count: number }[];
  /** Finished seasons only */
  best_seasons: TeamSeason[];
  worst_seasons: TeamSeason[];
  best_all_play_seasons: TeamSeason[];
  best_score_index_seasons: TeamSeason[];
  luckiest_seasons: TeamSeason[];
  unluckiest_seasons: TeamSeason[];
}

export interface AllTime {
  /** Newest first */
  seasons: SeasonSummary[];
  franchises: Franchise[];
  team_seasons: TeamSeason[];
  /** Career matrices (null = never met); regular season, and playoff games separately */
  head_to_head: {
    teams: string[];
    wins: MatrixRow[];
    games: MatrixRow[];
    playoff_wins: MatrixRow[];
    playoff_games: MatrixRow[];
  };
  records: AllTimeRecords;
}

export function useAllTime() {
  return useQuery({
    queryKey: ['alltime'],
    queryFn: async () => {
      const response = await fetch('/data/alltime.json')
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      return response.json() as Promise<AllTime>
    },
  })
}

export const winPct = (s: { wins: number; games: number }) => s.wins / (s.games || 1)
export const allPlayPct = (s: { all_play_wins: number; all_play_losses: number }) =>
  s.all_play_wins / (s.all_play_wins + s.all_play_losses || 1)
/** 1.104 → "1.10" */
export const formatIndex = (index: number) => index.toFixed(2)
