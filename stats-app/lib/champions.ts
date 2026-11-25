import { useQuery } from '@tanstack/react-query'

// Shape of /data/champions.json (pipeline/champions.py). A player has a ring for a season when they scored
// (lineup points above 0, regular season or playoffs) for that season's champion.

/** A player on a champion's roster: what they did for it that season */
export interface TitlePlayer {
  player_id: string;
  player: string;
  points: number;
  playoff_points: number;
  /** Points in the final's periods */
  finals_points: number;
  starts: number;
  playoff_starts: number;
  gp: number;
  /** Salary the champion paid (share of the regular season on its roster) */
  salary: number;
}

export interface Title {
  season: string;
  champion: string;
  runner_up: string | null;
  final_periods: number[];
  /** Regular-season points first */
  players: TitlePlayer[];
}

export interface RingLeader {
  player_id: string;
  player: string;
  rings: number;
  finals_lost: number;
  titles: { season: string; team: string }[];
  lost: { season: string; team: string }[];
  /** For the champions, in their title seasons */
  points: number;
  playoff_points: number;
  starts: number;
  gp: number;
  salary: number;
  /** Every final, won or lost */
  finals_points: number;
}

export interface Champions {
  /** Newest first */
  seasons: Title[];
  /** By rings, then finals reached, then finals points */
  players: RingLeader[];
  /** Every player with a ring */
  ring_holders: number;
}

export function useChampions() {
  return useQuery({
    queryKey: ['champions'],
    queryFn: async () => {
      const response = await fetch('/data/champions.json')
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      return response.json() as Promise<Champions>
    },
  })
}
