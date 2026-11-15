import { ReactNode, useState } from 'react'
import { ArrowDown } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { WidgetSkeleton } from './WidgetSkeleton'
import { TeamLogo } from './TeamLogo'
import { ErrorState } from './ErrorState'
import { Explainer } from './Explainer'
import { PlayerPeriod, PlayersData, formatFpts, usePlayers } from '@/lib/players'
import { useLeagueData } from '@/lib/league-data'
import { formatPoints } from '@/lib/standings'
import { teamCode } from '@/lib/teams'
import { cn } from '@/lib/utils'

/** Loading, error and "no player data" states shared by the player views. */
function usePlayersView(): { view?: ReactNode; data?: PlayersData } {
  const { data: league, isLoading: leagueLoading, error: leagueError } = useLeagueData()
  const { data, isLoading, error } = usePlayers()
  if (leagueLoading || isLoading) return { view: <WidgetSkeleton variant="list" /> }
  if (leagueError || error || !league) return { view: <ErrorState /> }
  if (!data) {
    return {
      view: (
        <Card className="w-full">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No player data for {league.meta.season} yet.
          </CardContent>
        </Card>
      ),
    }
  }
  return { data }
}

function Intro({ title, children, explainer }: { title: string; children: ReactNode; explainer?: ReactNode }) {
  return (
    <CardHeader className="space-y-2">
      <CardTitle>{title}</CardTitle>
      <CardDescription>{children}</CardDescription>
      {explainer && <Explainer>{explainer}</Explainer>}
    </CardHeader>
  )
}

const games = (n: number) => `${n} game${n === 1 ? '' : 's'}`

// ---------------------------------------------------------------- Leaders

export function PlayerLeadersWidget({ selectedTeam }: { selectedTeam: string }) {
  const { view, data } = usePlayersView()
  if (!data) return view

  return (
    <Card className="w-full">
      <Intro
        title="Season leaders"
        explainer={
          <p>
            Points count only while the player was in a lineup: a bench period adds nothing. <strong>Starts</strong>:
            periods in a lineup; <strong>GP</strong>: the NBA games played in them; <strong>Per game</strong>:
            points per game played. A player traded during the season shows every team they scored for.
          </p>
        }
      >
        The top {data.leaders.length} scorers for their fantasy teams, regular season through {data.meta.periods} periods.
        {selectedTeam && ' Your team’s players are highlighted.'}
      </Intro>
      <CardContent className="px-0 sm:px-6">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-muted-foreground">
                <th className="h-10 w-8 border-b px-2 text-right font-medium">#</th>
                <th className="sticky left-0 z-10 h-10 border-b bg-card px-2 text-left font-medium">Player</th>
                <th className="h-10 border-b px-2 text-right font-medium text-foreground">
                  <span className="inline-flex items-center gap-1">Points<ArrowDown className="h-3 w-3" /></span>
                </th>
                <th className="h-10 border-b px-2 text-right font-medium">Starts</th>
                <th className="h-10 border-b px-2 text-right font-medium">GP</th>
                <th className="h-10 whitespace-nowrap border-b px-2 text-right font-medium">Per game</th>
              </tr>
            </thead>
            <tbody className="[&_tr:last-child_td]:border-0">
              {data.leaders.map((p, i) => {
                const mine = p.teams.includes(selectedTeam)
                return (
                  <tr key={p.player_id} className={cn(mine && 'bg-muted font-semibold')}>
                    <td className="h-11 border-b px-2 text-right text-xs text-muted-foreground">{i + 1}</td>
                    <td className={cn('sticky left-0 z-10 h-11 border-b px-2', mine ? 'bg-muted' : 'bg-card')}>
                      <div className="flex items-center gap-2">
                        <span className="flex shrink-0 -space-x-2">
                          {p.teams.map(t => <TeamLogo key={t} teamName={t} size={22} />)}
                        </span>
                        <div className="min-w-0">
                          <div className="max-w-36 truncate sm:max-w-none">{p.player}</div>
                          <div className="text-xs font-normal text-muted-foreground">
                            {p.teams.map(teamCode).join(' → ')}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="h-11 border-b px-2 text-right font-semibold">{formatPoints(p.points)}</td>
                    <td className="h-11 border-b px-2 text-right">{p.starts}</td>
                    <td className="h-11 border-b px-2 text-right">{p.gp}</td>
                    <td className="h-11 border-b px-2 text-right">{p.gp ? (p.points / p.gp).toFixed(1) : '–'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------- Best periods

function PeriodList({ title, note, rows, selectedTeam }: {
  title: string;
  note: string;
  rows: PlayerPeriod[];
  selectedTeam: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{note}</CardDescription>
      </CardHeader>
      <CardContent className="px-3 sm:px-6">
        <ol className="space-y-1">
          {rows.map((p, i) => (
            <li
              key={`${p.period}-${p.team}-${p.player_id}`}
              className={cn('flex items-center gap-2 rounded-md px-1.5 py-1.5', p.team === selectedTeam && 'bg-muted')}
            >
              <span className="w-5 shrink-0 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
              <TeamLogo teamName={p.team} size={24} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{p.player}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {p.team} · P{p.period} · {games(p.gp)}
                </div>
              </div>
              <span className="shrink-0 text-right text-base font-bold tabular-nums">{formatFpts(p.fpts)}</span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}

export function PlayerPeriodsWidget({ selectedTeam }: { selectedTeam: string }) {
  const { view, data } = usePlayersView()
  if (!data) return view

  return (
    <div className="w-full space-y-4">
      <Card>
        <Intro
          title="Best periods"
          explainer={
            <p>
              A period is half a week (Mon–Thu or Fri–Sun), so a player has 1 to 4 NBA games in it, and the long
              All-Star period has more. The number of games is shown with each score.
            </p>
          }
        >
          The biggest single-period scores by one player, regular season.
          {selectedTeam && ' Your team is highlighted.'}
        </Intro>
      </Card>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <PeriodList
          title="In the lineup"
          note="Points that counted."
          rows={data.best_periods}
          selectedTeam={selectedTeam}
        />
        <PeriodList
          title="Left on the bench"
          note="Big games by players who weren’t in the lineup."
          rows={data.best_bench}
          selectedTeam={selectedTeam}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Teams

type TeamSort = 'points' | 'bench_points' | 'bench_share' | 'top_share'

function SortHeader({ id, sort, onSort, children }: {
  id: TeamSort; sort: TeamSort; onSort: (id: TeamSort) => void; children: ReactNode
}) {
  return (
    <th className="h-10 whitespace-nowrap border-b px-2 text-right font-medium" aria-sort={sort === id ? 'descending' : undefined}>
      <button
        type="button"
        onClick={() => onSort(id)}
        className={cn('inline-flex items-center gap-1 hover:text-foreground', sort === id && 'text-foreground')}
      >
        {children}
        {sort === id && <ArrowDown className="h-3 w-3" />}
      </button>
    </th>
  )
}

export function PlayerTeamsWidget({ selectedTeam }: { selectedTeam: string }) {
  const { view, data } = usePlayersView()
  const [sort, setSort] = useState<TeamSort>('bench_points')
  if (!data) return view

  const rows = data.teams.map(t => ({
    ...t,
    bench_share: t.bench_points / (t.points + t.bench_points || 1),
    top_share: t.top_scorer.points / (t.points || 1),
  })).sort((a, b) => b[sort] - a[sort])

  return (
    <Card className="w-full">
      <Intro
        title="Teams"
        explainer={
          <>
            <p>
              <strong>Bench</strong>: points scored by players on the bench, which didn&apos;t count. Injured reserve
              and minors are left out. <strong>Bench %</strong>: the bench&apos;s share of all the points the
              roster scored. A high number can mean a deep roster or lineups that missed.
            </p>
            <p>
              <strong>Top scorer</strong>: the player with the most points for the team in its lineup, and their share
              of the team&apos;s points.
            </p>
          </>
        }
      >
        Each team&apos;s lineup points, the points left on its bench, and its top scorer. Sort by any number column.
      </Intro>
      <CardContent className="px-0 sm:px-6">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-muted-foreground">
                <th className="sticky left-0 z-10 h-10 border-b bg-card px-2 text-left font-medium">Team</th>
                <SortHeader id="points" sort={sort} onSort={setSort}>Points</SortHeader>
                <SortHeader id="bench_points" sort={sort} onSort={setSort}>Bench</SortHeader>
                <SortHeader id="bench_share" sort={sort} onSort={setSort}>Bench %</SortHeader>
                <th className="h-10 border-b px-2 text-left font-medium">Top scorer</th>
                <SortHeader id="top_share" sort={sort} onSort={setSort}>Share</SortHeader>
              </tr>
            </thead>
            <tbody className="[&_tr:last-child_td]:border-0">
              {rows.map(t => {
                const mine = t.team === selectedTeam
                return (
                  <tr key={t.team} className={cn(mine && 'bg-muted font-semibold')}>
                    <td className={cn('sticky left-0 z-10 h-11 border-b px-2', mine ? 'bg-muted' : 'bg-card')}>
                      <div className="flex items-center gap-2">
                        <TeamLogo teamName={t.team} size={24} className="shrink-0" />
                        <span className="md:hidden">{teamCode(t.team)}</span>
                        <span className="hidden whitespace-nowrap md:inline">{t.team}</span>
                      </div>
                    </td>
                    <td className="h-11 border-b px-2 text-right">{formatPoints(t.points)}</td>
                    <td className="h-11 border-b px-2 text-right">{formatPoints(t.bench_points)}</td>
                    <td className="h-11 border-b px-2 text-right">{(t.bench_share * 100).toFixed(1)}%</td>
                    <td className="h-11 whitespace-nowrap border-b px-2 text-left">
                      {t.top_scorer.player}
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">{formatPoints(t.top_scorer.points)}</span>
                    </td>
                    <td className="h-11 border-b px-2 text-right">{(t.top_share * 100).toFixed(1)}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
