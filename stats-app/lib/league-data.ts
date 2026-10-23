import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSelectedSeason } from './selected-season'

// Shapes of the data files written by pipeline/build_data.py: /data/seasons.json
// (the season list) and /data/seasons/<season>.json (one season's data).

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
  /** Wins the row team would have with the column team's schedule; the diagonal is its actual wins */
  schedule_swap: MatrixRow[];
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

/** A team's form (pipeline/form.py): how often it scores near the top lately. */
export interface TeamForm {
  team: string;
  /** Average of the ranks of the weighted top finishes, elite score and recent all-play */
  form_rank: number;
  /** Periods with a top-`top_x` score, of `periods` */
  top_finishes: number;
  periods: number;
  /** Top finishes, a period n periods back counting decay^n */
  weighted_top_finishes: number;
  /** top_x points for a period's best score down to 1, weighted the same way */
  elite_score: number;
  /** All-play win rate over the last `recent_periods` periods */
  recent_all_play_pct: number;
  /** The team's score rank in each of the latest periods (1 = best), oldest first */
  finishes: { period: number; rank: number }[];
}

export interface Form {
  top_x: number;
  decay: number;
  recent_periods: number;
  /** Best form first */
  teams: TeamForm[];
}

/** A game in the record book, from `team`'s side. */
export interface RecordGame {
  period: number;
  team: string;
  score: number;
  opponent: string;
  opp_score: number;
  /** The average score that period (periods with more NBA games score higher) */
  period_avg: number;
  /** Teams the score beat that period (ties count half), of `others` */
  all_play_wins: number;
  others: number;
}

export interface Streak {
  team: string;
  length: number;
  /** First and last period of the run */
  start: number;
  end: number;
}

/** The record book (pipeline/records.py): top-5 lists, regular season only. */
export interface Records {
  highest_scores: RecordGame[];
  /** Highest score / period average */
  best_vs_average: RecordGame[];
  worst_vs_average: RecordGame[];
  /** By the winner (a tie: the first team by name) */
  blowouts: RecordGame[];
  closest_games: RecordGame[];
  /** Losses whose score beat the most teams */
  unluckiest_losses: RecordGame[];
  /** Wins whose score beat the fewest teams */
  luckiest_wins: RecordGame[];
  win_streaks: Streak[];
  losing_streaks: Streak[];
  /** Periods with the league's top score */
  period_highs: { team: string; count: number }[];
}

/** The season's calendar and the games still to play (from Fantrax; null for data from the sheet). */
export interface Schedule {
  /** Every scoring period, playoffs too; dates are YYYY-MM-DD in the league's time zone */
  periods: { period: number; start: string; end: string }[];
  /** The last regular-season period */
  regular_periods: number;
  /** Regular-season games not played yet, each once. Swiss periods appear only once Fantrax sets them. */
  upcoming: { period: number; team: string; opponent: string }[];
}

export interface LeagueData {
  meta: {
    /** When the data last changed */
    updated_at: string;
    /** e.g. "2025-26" */
    season: string;
    games: number;
    latest_period: number;
  };
  teams: TeamSummary[];
  results: PeriodResult[];
  matchups: Matchups;
  form: Form;
  records: Records;
  /** Null before the playoffs start, and for data from the sheet */
  playoffs: Playoffs | null;
  /** Only for a season with an earlier playoff format (no playoffs block): its playoff games as played */
  playoff_games?: (PlayoffGame & { period: number })[];
  schedule: Schedule | null;
}

/** A season in the season list (pipeline/seasons.json). */
export interface SeasonInfo {
  id: string;
  /** One line about the season, e.g. a shorter regular season */
  note?: string;
  /** "other": before today's playoff format, so there's no playoffs block */
  playoffs?: 'other';
}

/** The seasons with data, newest first, and the one the site opens on. */
export interface SeasonIndex {
  default: string;
  seasons: SeasonInfo[];
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  return response.json()
}

const seasonsQuery = { queryKey: ['seasons'], queryFn: () => fetchJson<SeasonIndex>('/data/seasons.json') }

export function useSeasons() {
  return useQuery(seasonsQuery)
}

/** The season on screen's entry in the season list (its note, its playoff format). */
export function useSeasonInfo(): SeasonInfo | undefined {
  const { data: league } = useLeagueData()
  const { data: seasons } = useSeasons()
  return seasons?.seasons.find(s => s.id === league?.meta.season)
}

/**
 * The selected season's dataset (the default season until one is picked, or
 * when the picked one isn't in the list); one request shared by every
 * component. While another season loads, the previous one stays on screen.
 */
export function useLeagueData() {
  const client = useQueryClient()
  const season = useSelectedSeason(s => s.season)
  return useQuery({
    queryKey: ['league', season],
    queryFn: async () => {
      const index = await client.ensureQueryData(seasonsQuery)
      const id = index.seasons.some(s => s.id === season) ? season : index.default
      return fetchJson<LeagueData>(`/data/seasons/${id}.json`)
    },
    placeholderData: keepPreviousData,
  })
}
