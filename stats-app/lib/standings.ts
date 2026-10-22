import type { TeamSummary } from './league-data'

export interface Standing extends TeamSummary {
  /** Standings position: most wins, then most points for */
  rank: number
  all_play_pct: number
  all_play_rank: number
  points_for_rank: number
  points_against_rank: number
}

/** 1-based rank of each value, highest first; equal values share a rank. */
function rankDescending(values: number[]): number[] {
  return values.map(v => values.filter(other => other > v).length + 1)
}

export function computeStandings(teams: TeamSummary[]): Standing[] {
  const sorted = [...teams].sort((a, b) => b.wins - a.wins || b.points_for - a.points_for)
  const allPlayPct = sorted.map(t => t.all_play_wins / (t.all_play_wins + t.all_play_losses))
  const allPlayRank = rankDescending(allPlayPct)
  const pfRank = rankDescending(sorted.map(t => t.points_for))
  const paRank = rankDescending(sorted.map(t => t.points_against))

  return sorted.map((t, i) => ({
    ...t,
    rank: i + 1,
    all_play_pct: allPlayPct[i],
    all_play_rank: allPlayRank[i],
    points_for_rank: pfRank[i],
    points_against_rank: paRank[i],
  }))
}

/** 1 → "1st", 22 → "22nd" */
export function ordinal(n: number): string {
  const suffix = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (suffix[(v - 20) % 10] || suffix[v] || suffix[0])
}

/** Wins and losses can be halves (a tie counts half each way). */
export function formatCount(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

export function formatRecord(wins: number, losses: number): string {
  return `${formatCount(wins)}-${formatCount(losses)}`
}

/** 0.8297 → ".830" (1 → "1.000") */
export function formatPct(pct: number): string {
  return pct.toFixed(3).replace(/^0/, '')
}

export function formatPoints(points: number): string {
  return Math.round(points).toLocaleString()
}

export function formatLuck(luck: number): string {
  return `${luck > 0 ? '+' : ''}${luck.toFixed(1)}`
}

/** Text color for a luck value; within ±0.5 wins counts as neutral. */
export function luckColor(luck: number): string {
  if (luck >= 0.5) return 'text-lucky'
  if (luck <= -0.5) return 'text-very-unlucky'
  return 'text-muted-foreground'
}
