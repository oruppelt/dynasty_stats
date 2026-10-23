import { Playoffs, Series } from './league-data'

// Helpers for the Playoffs view. Rules in LEAGUE.md; the data comes from
// pipeline/playoffs.py.

export interface SwissResult {
  round: number;
  opponent: string;
  score: number;
  oppScore: number;
  /** 1, 0.5 (tie) or 0 */
  win: number;
}

/** Each team's Swiss games in round order, from its own side. */
export function swissResults(playoffs: Playoffs): Map<string, SwissResult[]> {
  const byTeam = new Map<string, SwissResult[]>()
  const add = (team: string, result: SwissResult) => byTeam.set(team, [...(byTeam.get(team) ?? []), result])
  for (const { round, games } of playoffs.swiss.rounds) {
    for (const g of games) {
      const win = g.score > g.opp_score ? 1 : g.score < g.opp_score ? 0 : 0.5
      add(g.team, { round, opponent: g.opponent, score: g.score, oppScore: g.opp_score, win })
      add(g.opponent, { round, opponent: g.team, score: g.opp_score, oppScore: g.score, win: 1 - win })
    }
  }
  return byTeam
}

/**
 * Knockout series in bracket order, so that each series sits next to the one
 * whose winner it meets next: 1v8, 4v5, 2v7, 3v6 in the quarterfinals.
 * The bracket ranks the teams through by their regular-season seed.
 */
export function bracketOrder(playoffs: Playoffs): Series[][] {
  const through = playoffs.swiss.standings
    .filter(t => t.status === 'through')
    .sort((a, b) => a.seed - b.seed)
    .map(t => t.team)
  // Top half: ranks 1 (with 8) and 4 (with 5); bottom half: 2 and 3
  const slotOfRank = [0, 2, 3, 1]
  const slot = new Map<string, number>()
  through.forEach((team, i) => {
    const rank = Math.min(i, through.length - 1 - i)
    slot.set(team, slotOfRank[rank] ?? rank)
  })
  const key = (s: Series) => Math.min(...s.teams.map(t => slot.get(t) ?? Infinity))
  return playoffs.knockout.map(round => [...round.series].sort((a, b) => key(a) - key(b)))
}

