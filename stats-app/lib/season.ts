import type { PeriodResult, TeamSummary } from './league-data'
import { Standing, computeStandings } from './standings'

/** Results grouped by scoring period, in period order. */
export function resultsByPeriod(results: PeriodResult[]): Map<number, PeriodResult[]> {
  const byPeriod = new Map<number, PeriodResult[]>()
  for (const r of [...results].sort((a, b) => a.period - b.period)) {
    byPeriod.set(r.period, [...(byPeriod.get(r.period) ?? []), r])
  }
  return byPeriod
}

/** Teams a score outscored that period, as a share of the other teams. */
export function allPlayPct(r: PeriodResult): number {
  const others = r.all_play_wins + r.all_play_losses
  return others ? r.all_play_wins / others : 0
}

/** The standings as they stood after each period (same order rules as the season table). */
export function standingsByPeriod(results: PeriodResult[]): Map<number, Standing[]> {
  const totals = new Map<string, TeamSummary>()
  const byPeriod = new Map<number, Standing[]>()
  for (const [period, rows] of resultsByPeriod(results)) {
    for (const r of rows) {
      const t = totals.get(r.team) ?? {
        team: r.team, games: 0, wins: 0, losses: 0, all_play_wins: 0, all_play_losses: 0,
        points_for: 0, points_against: 0, luck: 0,
      }
      totals.set(r.team, {
        ...t,
        games: t.games + 1,
        wins: t.wins + r.win,
        losses: t.losses + 1 - r.win,
        all_play_wins: t.all_play_wins + r.all_play_wins,
        all_play_losses: t.all_play_losses + r.all_play_losses,
        points_for: t.points_for + r.score,
        points_against: t.points_against + r.opp_score,
        luck: r.luck_to_date,
      })
    }
    byPeriod.set(period, computeStandings([...totals.values()]))
  }
  return byPeriod
}

/** One game of a period: the higher score first (a tie keeps the sheet's order). */
export interface Game {
  winner: PeriodResult;
  loser: PeriodResult;
  margin: number;
}

export interface Recap {
  games: Game[];
  top: PeriodResult;
  lowest: PeriodResult;
  /** A loss whose score beat the most teams */
  unluckiestLoss?: PeriodResult;
  /** A win whose score beat the fewest teams */
  luckiestWin?: PeriodResult;
  blowout: Game;
  closest: Game;
}

export function periodRecap(rows: PeriodResult[]): Recap {
  const games = rows
    .filter(r => r.win > 0.5 || (r.win === 0.5 && r.team < r.opponent))
    .map(winner => {
      const loser = rows.find(r => r.team === winner.opponent)!
      return { winner, loser, margin: winner.score - loser.score }
    })
    .sort((a, b) => b.winner.score - a.winner.score)
  const byScore = [...rows].sort((a, b) => b.score - a.score)
  const losses = rows.filter(r => r.win === 0).sort((a, b) => b.all_play_wins - a.all_play_wins)
  const wins = rows.filter(r => r.win === 1).sort((a, b) => a.all_play_wins - b.all_play_wins)
  const byMargin = [...games].sort((a, b) => b.margin - a.margin)
  return {
    games,
    top: byScore[0],
    lowest: byScore[byScore.length - 1],
    unluckiestLoss: losses[0],
    luckiestWin: wins[0],
    blowout: byMargin[0],
    closest: byMargin[byMargin.length - 1],
  }
}

/** A period's score, one decimal: 1234.5 → "1,234.5" */
export function formatScore(score: number): string {
  return score.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/** The recap highlights a team made that period, e.g. ["Top score", "Closest game"]. */
export function recapHighlights(recap: Recap, team: string): string[] {
  const inGame = (g: Game) => g.winner.team === team || g.loser.team === team
  return [
    recap.top.team === team && 'Top score',
    recap.lowest.team === team && 'Lowest score',
    recap.unluckiestLoss?.team === team && 'Unluckiest loss',
    recap.luckiestWin?.team === team && 'Luckiest win',
    inGame(recap.blowout) && 'Biggest blowout',
    inGame(recap.closest) && 'Closest game',
  ].filter((h): h is string => Boolean(h))
}
