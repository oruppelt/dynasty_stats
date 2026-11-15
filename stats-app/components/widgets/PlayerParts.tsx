import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { TeamLogo } from './TeamLogo'
import { PlayerPeriod, formatFpts, usePlayers } from '@/lib/players'
import { formatPoints, ordinal } from '@/lib/standings'
import { cn } from '@/lib/utils'

// Player cards for other views: My Team's players and the recap's players of the period.
// Both show nothing while the player data loads, or when the season has none.

const games = (n: number) => `${n} game${n === 1 ? '' : 's'}`

/** My Team: the team's top scorers this season, its best player period and its bench. */
export function YourPlayers({ team }: { team: string }) {
  const { data } = usePlayers()
  const mine = data?.teams.find(t => t.team === team)
  if (!data || !mine) return null

  const benchRank = [...data.teams].sort((a, b) => b.bench_points - a.bench_points).findIndex(t => t.team === team) + 1
  const best = mine.best_period
  const latest = data.periods[data.periods.length - 1]
  const latestTop = latest?.team_top[team]

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Your players</CardTitle>
        <CardDescription>Your top scorers this season: points while in your lineup.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="divide-y">
          {mine.top_players.map((p, i) => (
            <li key={p.player_id} className="flex items-center gap-3 py-2 text-sm sm:text-base">
              <span className="w-4 shrink-0 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{p.player}</div>
                <div className="text-xs text-muted-foreground">
                  {p.starts} starts · {p.gp ? (p.points / p.gp).toFixed(1) : '–'} per game
                </div>
              </div>
              <span className="shrink-0 font-semibold tabular-nums">{formatPoints(p.points)}</span>
            </li>
          ))}
        </ol>
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">Best period:</span> {best.player},{' '}
            {formatFpts(best.fpts)} in P{best.period} ({games(best.gp)})
          </li>
          {latestTop && (
            <li>
              <span className="font-medium text-foreground">P{latest.period}:</span> {latestTop.player} led with{' '}
              {formatFpts(latestTop.fpts)}
            </li>
          )}
          <li>
            <span className="font-medium text-foreground">Bench:</span> {formatPoints(mine.bench_points)} points
            left on it, the {ordinal(benchRank)} most
          </li>
        </ul>
      </CardContent>
    </Card>
  )
}

function PlayerRow({ p, mine }: { p: PlayerPeriod; mine: boolean }) {
  return (
    <li className={cn('flex items-center gap-2 rounded-md px-1.5 py-1.5', mine && 'bg-muted')}>
      <TeamLogo teamName={p.team} size={24} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{p.player}</div>
        <div className="truncate text-xs text-muted-foreground">{p.team} · {games(p.gp)}</div>
      </div>
      <span className="shrink-0 font-bold tabular-nums">{formatFpts(p.fpts)}</span>
    </li>
  )
}

/** Recap: the period's best players, the best bench games and the viewer's top scorer. */
export function PeriodPlayersCard({ period, selectedTeam }: { period: number; selectedTeam: string }) {
  const { data } = usePlayers()
  const players = data?.periods.find(p => p.period === period)
  if (!players) return null
  const yours = selectedTeam ? players.team_top[selectedTeam] : undefined

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Players of the period</CardTitle>
        <CardDescription>
          The period&apos;s biggest scores, and the best games left on a bench.
          {yours && <> Your top scorer: <span className="font-medium text-foreground">{yours.player}, {formatFpts(yours.fpts)}</span> ({games(yours.gp)}).</>}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
        <div>
          <div className="mb-1 text-sm font-semibold">In a lineup</div>
          <ol className="space-y-1">
            {players.best.map(p => <PlayerRow key={`${p.team}-${p.player_id}`} p={p} mine={p.team === selectedTeam} />)}
          </ol>
        </div>
        {players.bench.length > 0 && (
          <div>
            <div className="mb-1 text-sm font-semibold">On the bench</div>
            <ol className="space-y-1">
              {players.bench.map(p => <PlayerRow key={`${p.team}-${p.player_id}`} p={p} mine={p.team === selectedTeam} />)}
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
