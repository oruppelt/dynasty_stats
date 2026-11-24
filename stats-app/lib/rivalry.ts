import { useQuery } from '@tanstack/react-query'

// Shape of /data/rivalries/<slug>.json (pipeline/rivalry.py): one team's rivalry with every other team, over
// every season, from that team's side ("team" is it, "opponent" the other).

export type Side = 'team' | 'opponent'
export type Stage = 'regular' | 'swiss' | 'knockout' | 'playoffs'

export interface Meeting {
  season: string
  period: number
  stage: Stage
  /** Swiss round n, or the knockout round's name (Final, Semifinals, ...) */
  round?: string
  score: number
  opp_score: number
  /** 1 won, 0 lost, 0.5 tied */
  win: number
}

export interface Streak {
  side: Side
  length: number
  from: { season: string; period: number }
  to: { season: string; period: number }
}

export interface TradeItem {
  kind: 'player' | 'pick' | 'budget'
  label: string
  /** The player, or the one a pick became */
  player_id?: string
  player?: string
  /** Points he scored for the team that got him */
  points?: number
}

export interface RivalryTrade {
  id: string
  date: string
  season: string
  period?: number | null
  /** What the team got from the opponent, and gave it */
  got: TradeItem[]
  gave: TradeItem[]
  got_points: number
  gave_points: number
  /** A trade with more teams: the others */
  others?: string[]
}

export interface PlayerTotal {
  player_id: string
  player: string
  points: number
  games: number
  best: number
}

export interface Rivalry {
  wins: number
  losses: number
  games: number
  playoff_wins: number
  playoff_losses: number
  playoff_games: number
  series: { season: string; round: string; won: boolean; wins: number; losses: number }[]
  points_for: number
  points_against: number
  streak: Streak | null
  longest_streak: Streak | null
  opponent_longest_streak: Streak | null
  records: {
    highest_score?: Meeting & { side: Side }
    biggest_win?: Meeting & { side: Side | null; margin: number }
    closest_game?: Meeting & { side: Side | null; margin: number }
    highest_combined?: Meeting & { combined: number }
  }
  /** Oldest first */
  meetings: Meeting[]
  trades: RivalryTrade[]
  players: {
    /** Lineup points in their games, top five a side */
    team: PlayerTotal[]
    opponent: PlayerTotal[]
    best_game: { side: Side; player_id: string; player: string; points: number; season: string; period: number } | null
    /** Scored for both franchises (any time) */
    both: { player_id: string; player: string; team_points: number; opponent_points: number }[]
    /** How many scored for both (`both` has the top 10) */
    both_count?: number
  }
}

export interface TeamRivalries {
  team: string
  opponents: Record<string, Rivalry>
}

/** The file name for a team (pipeline/rivalry.py `slug`) */
export const rivalrySlug = (team: string) => team.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export function useRivalries(team: string | null | undefined) {
  return useQuery({
    queryKey: ['rivalries', team],
    enabled: !!team,
    queryFn: async () => {
      const response = await fetch(`/data/rivalries/${rivalrySlug(team as string)}.json`)
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      return response.json() as Promise<TeamRivalries>
    },
  })
}

/** "Swiss round 2", "Final", "Playoffs"; null for the regular season */
export function stageLabel(m: Meeting): string | null {
  if (m.stage === 'regular') return null
  return m.round ?? 'Playoffs'
}
