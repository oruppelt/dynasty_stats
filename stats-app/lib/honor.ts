import { useQuery } from '@tanstack/react-query'
import type { Finish } from './alltime'

// Shape of /data/honor.json (pipeline/honor.py): each franchise's honor, earned season by season
// from rare achievements and spent on rewards, with its banners, retired jerseys, legends, highlights and rivals.

export type AchievementKind = 'title' | 'final' | 'first_seed' | 'season_high' | 'bottom_three' | 'player_6000' | 'player_16000'
export type RewardKind = 'jersey' | 'rival' | 'moment' | 'motto'

export interface Achievement {
  kind: AchievementKind
  season: string
  points: number
  label: string
  /** The day it happened: the final's last period, the regular season's last, the season high's period, the
   * period a milestone was passed in */
  date?: string | null
  /** title / final: the other finalist, and the series ("2-1") when the bracket has it */
  opponent?: string
  series?: string
  /** season_high */
  score?: number
  period?: number
  /** bottom_three */
  rank?: number
  of?: number
  /** player milestones (with `period`) */
  player_id?: string
  player?: string
}

export interface HonorSeason {
  season: string
  points: number
  /** Honor through this season */
  total: number
  events: Achievement[]
  rank?: number
  wins?: number
  losses?: number
  finish?: Finish | null
}

export interface Reward {
  kind: RewardKind
  season: string
  cost: number
  label: string
  // jersey
  player_id?: string
  player?: string
  points?: number
  starts?: number
  first?: string
  last?: string
  // motto
  text?: string
  // rival
  opponent?: string
  // moment
  title?: string
  trade?: string
  /** Any reward: its picture (/honor/<file>) and a line under it */
  image?: string
  caption?: string
}

export interface Legend {
  player_id: string
  player: string
  points: number
  starts: number
  first: string
  last: string
  seasons: number
  /** Enough points to have his jersey retired */
  eligible: boolean
  retired: boolean
}

export interface Opponent { team: string; games: number; wins: number; losses: number; playoff_games: number }

type Game = { season: string; period: number; score: number; opponent: string; opp_score: number }

export interface FranchiseHonor {
  honor: number
  spent: number
  balance: number
  /** 1 = the most honor (ties share a rank) */
  rank: number
  seasons: HonorSeason[]
  cups: Achievement[]
  motto: string | null
  jerseys: Reward[]
  moments: Reward[]
  declared_rival: string | null
  rewards: Reward[]
  legends: Legend[]
  highlights: {
    best_season?: { season: string; rank: number; wins: number; losses: number; finish: Finish }
    highest_score?: Game
    biggest_win?: Game & { margin: number }
    longest_streak?: { season: string; length: number; start: number; end: number }
    best_player_season?: { season: string; player_id: string; player: string; points: number; starts: number }
  }
  rivals: { most_played?: Opponent; nemesis?: Opponent; favorite?: Opponent }
}

export interface Honor {
  achievements: { kind: AchievementKind; points: number; label: string }[]
  rewards: { kind: RewardKind; cost: number; label: string }[]
  jersey_points: number
  /** Oldest first */
  seasons: string[]
  franchises: Record<string, FranchiseHonor>
}

export function useHonor() {
  return useQuery({
    queryKey: ['honor'],
    queryFn: async () => {
      const response = await fetch('/data/honor.json')
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      return response.json() as Promise<Honor>
    },
  })
}

/** +15, −10 */
export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0')
