import type { LeagueData } from './league-data'

const MONTH = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' })

function parts(date: string) {
  const d = new Date(`${date}T00:00:00Z`)
  return { month: MONTH.format(d), day: d.getUTCDate() }
}

/** A period's days, e.g. "Oct 20–23" or "Oct 31–Nov 3"; null without a schedule. */
export function periodDates(league: LeagueData, period: number): string | null {
  const p = league.schedule?.periods.find(p => p.period === period)
  if (!p) return null
  const start = parts(p.start)
  const end = parts(p.end)
  return start.month === end.month
    ? `${start.month} ${start.day}–${end.day}`
    : `${start.month} ${start.day}–${end.month} ${end.day}`
}

export interface UpcomingGame {
  period: number;
  /** Null when not set yet (the Swiss periods are paired one at a time) */
  opponent: string | null;
  /** The period is under way (the first game, once its period has started) */
  now: boolean;
}

/** The team's next regular-season games, the period in progress first. */
export function upcomingGames(league: LeagueData, team: string, count: number): UpcomingGame[] {
  const schedule = league.schedule
  if (!schedule) return []
  const today = new Date().toLocaleDateString('en-CA')  // YYYY-MM-DD, local time
  const games: UpcomingGame[] = []
  for (let period = league.meta.latest_period + 1; period <= schedule.regular_periods && games.length < count; period++) {
    const game = schedule.upcoming.find(g => g.period === period && (g.team === team || g.opponent === team))
    const dates = schedule.periods.find(p => p.period === period)
    games.push({
      period,
      opponent: game ? (game.team === team ? game.opponent : game.team) : null,
      now: games.length === 0 && Boolean(dates && dates.start <= today),
    })
  }
  return games
}
