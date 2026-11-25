import { useQueries, useQuery } from '@tanstack/react-query'

// Shape of /data/draft/index.json and /data/draft/<season>.json (pipeline/draft.py).

/** What a pick is measured by: the average salary after the rookie deal (drafts whose 4th season has started), or
 * regular-season points on any roster (lineup or bench) for the newer ones */
export type DraftMetric = 'salary' | 'points'

/** A drafted player's season: on every team's roster, lineup points and starts */
export interface DraftSeason {
  season: string;
  teams: string[];
  contract: string;
  salary: number;
  points: number;
  playoff_points: number;
  starts: number;
  playoff_starts: number;
}

export interface DraftPick {
  season: string;
  round: number;
  /** Overall */
  pick: number;
  /** In the round */
  slot: number;
  /** Today's name */
  team: string;
  player_id: string | null;
  player: string | null;
  /** The draft that took the player before (not counted) */
  redraft: string | null;
  /** Lineup points in the regular season, the rookie deal's 3 seasons */
  rookie_points: number;
  /** Lineup points in the regular season, every season since */
  points: number;
  playoff_points: number;
  starts: number;
  playoff_starts: number;
  /** Salary paid, every team */
  earned: number;
  /** Average salary after the rookie deal; 0 when nobody signed him */
  salary_after: number;
  seasons_after: number;
  /** Lineup points (playoffs too) for the team that drafted him */
  team_points: number;
  history: DraftSeason[];
  metric: DraftMetric;
  /** Null for an unused pick or a re-drafted player */
  value: number | null;
  /** What the slot usually gives */
  expected: number | null;
  vs_slot: number | null;
  /** vs_slot in average first-round picks */
  score: number | null;
}

export interface Draft {
  season: string;
  metric: DraftMetric;
  in_progress: boolean;
  rookie_deal_over: boolean;
  picks: DraftPick[];
}

export interface PickRef {
  season: string;
  pick: number;
  player_id: string;
  player: string;
  score: number;
}

export interface Drafter {
  team: string;
  picks: number;
  first_round: number;
  /** The picks' scores added up */
  score: number;
  per_pick: number;
  /** Picks above their slot */
  hits: number;
  best: PickRef;
  worst: PickRef;
  /** Lineup points (playoffs too) for this team */
  team_points: number;
  /** Every lineup point its picks scored, any team */
  points: number;
  kept: number | null;
}

export interface DraftIndex {
  /** Newest first */
  drafts: Omit<Draft, 'picks'>[];
  /** The draft in progress left out */
  teams: Drafter[];
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  return response.json() as Promise<T>
}

export function useDraftIndex() {
  return useQuery({ queryKey: ['draft'], queryFn: () => getJson<DraftIndex>('/data/draft/index.json') })
}

/** The drafts asked for (one request each, cached) */
export function useDrafts(seasons: string[]) {
  return useQueries({
    queries: seasons.map(s => ({ queryKey: ['draft', s], queryFn: () => getJson<Draft>(`/data/draft/${s}.json`) })),
    combine: results => ({
      drafts: results.map(r => r.data).filter((d): d is Draft => !!d),
      isLoading: results.some(r => r.isLoading),
      error: results.find(r => r.error)?.error,
    }),
  })
}
