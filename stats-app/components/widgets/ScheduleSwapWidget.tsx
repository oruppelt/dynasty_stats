import { useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { WidgetSkeleton } from './WidgetSkeleton'
import { TeamLogo } from './TeamLogo'
import { ErrorState } from './ErrorState'
import { Explainer } from './Explainer'
import { HeatmapScale, MatrixHeatmap } from './MatrixHeatmap'
import { LeagueData, MatrixRow, useLeagueData } from '@/lib/league-data'
import { formatLuck, formatRecord, luckColor } from '@/lib/standings'
import { cn } from '@/lib/utils'

const SCALE: HeatmapScale = {
  edges: [-3, -1.5, -0.5, 0.5, 1.5, 3],
  edgeLabels: ['−3', '−1.5', '−0.5', '+0.5', '+1.5', '+3'],
  lowCaption: 'Fewer wins with that schedule',
  highCaption: 'More wins',
}

const signed = (n: number) => formatLuck(n).replace('-', '−')

/** Each team's wins with each other schedule, minus its actual wins (null on the diagonal). */
function swapDeltas(league: LeagueData): MatrixRow[] {
  const actual = new Map(league.teams.map(t => [t.team, t.wins]))
  return league.matchups.schedule_swap.map(row => {
    const out: MatrixRow = { Team: row.Team }
    for (const owner of league.matchups.teams) {
      const wins = row[owner]
      out[owner] = owner === row.Team || typeof wins !== 'number' ? null : wins - actual.get(row.Team)!
    }
    return out
  })
}

/** A bar from the middle: right for more wins, left for fewer. */
function DeltaBar({ delta, max }: { delta: number; max: number }) {
  const width = `${Math.min(Math.abs(delta) / max, 1) * 50}%`
  return (
    <span className="relative hidden h-2 w-24 shrink-0 rounded-full bg-muted sm:block">
      <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
      <span
        className={cn('absolute inset-y-0 rounded-full', delta >= 0 ? 'left-1/2 bg-lucky' : 'right-1/2 bg-very-unlucky')}
        style={{ width }}
      />
    </span>
  )
}

function TeamSchedules({ league, team, onTeam }: { league: LeagueData; team: string; onTeam: (team: string) => void }) {
  const row = league.matchups.schedule_swap.find(r => r.Team === team)
  const games = new Map(league.teams.map(t => [t.team, t.games]))
  const actual = league.teams.find(t => t.team === team)?.wins ?? 0
  const list = league.matchups.teams
    .map(owner => ({ owner, wins: row?.[owner] as number, games: games.get(owner) ?? 0 }))
    .filter(s => typeof s.wins === 'number')
    .sort((a, b) => b.wins - a.wins || (a.owner === team ? -1 : b.owner === team ? 1 : 0))
  const max = Math.max(...list.map(s => Math.abs(s.wins - actual)), 1)
  const best = list[0]

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-lg">With another team&apos;s schedule</CardTitle>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Team</span>
            <select
              value={team}
              onChange={e => onTeam(e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm font-medium"
            >
              {league.matchups.teams.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </div>
        <CardDescription>
          {team}&apos;s scores against the opponents another team actually faced, period by period.
          {best && best.owner !== team && (
            <> Best fit: {best.owner}&apos;s schedule, {formatRecord(best.wins, best.games - best.wins)} ({signed(best.wins - actual)}).</>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-3 sm:px-6">
        <ol className="divide-y">
          {list.map(s => {
            const delta = s.wins - actual
            const own = s.owner === team
            return (
              <li key={s.owner} className={cn('flex items-center gap-2 px-1.5 py-1.5 text-sm', own && 'rounded-md bg-muted font-semibold')}>
                <TeamLogo teamName={s.owner} size={22} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate">{own ? 'Own schedule' : s.owner}</span>
                <DeltaBar delta={delta} max={max} />
                <span className="w-[4.5rem] shrink-0 text-right font-semibold tabular-nums">{formatRecord(s.wins, s.games - s.wins)}</span>
                <span className={cn('w-10 shrink-0 text-right tabular-nums', own ? 'text-muted-foreground' : luckColor(delta))}>
                  {own ? '' : signed(delta)}
                </span>
              </li>
            )
          })}
        </ol>
      </CardContent>
    </Card>
  )
}

/** How every other team does with each schedule, on average: the easiest schedules first. */
function ScheduleDifficulty({ deltas, teams, selectedTeam }: { deltas: MatrixRow[]; teams: string[]; selectedTeam: string }) {
  const list = teams
    .map(owner => {
      const values = deltas.map(r => r[owner]).filter((v): v is number => typeof v === 'number')
      return { owner, average: values.reduce((a, b) => a + b, 0) / (values.length || 1) }
    })
    .sort((a, b) => b.average - a.average)
  const max = Math.max(...list.map(s => Math.abs(s.average)), 0.5)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Easiest and hardest schedules</CardTitle>
        <CardDescription>
          The wins the other 29 teams would gain (or lose), on average, with each team&apos;s schedule. Easiest first.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-3 sm:px-6">
        <ol className="divide-y">
          {list.map((s, i) => (
            <li key={s.owner} className={cn('flex items-center gap-2 px-1.5 py-1.5 text-sm', s.owner === selectedTeam && 'rounded-md bg-muted')}>
              <span className="w-5 shrink-0 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
              <TeamLogo teamName={s.owner} size={22} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">{s.owner}</span>
              <DeltaBar delta={s.average} max={max} />
              <span className={cn('w-10 shrink-0 text-right font-semibold tabular-nums', luckColor(s.average))}>{signed(s.average)}</span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}

export function ScheduleSwapWidget({ selectedTeam }: { selectedTeam: string }) {
  const { data: league, isLoading, error } = useLeagueData()
  const [picked, setPicked] = useState<string | null>(null)
  const deltas = useMemo(() => league ? swapDeltas(league) : [], [league])

  if (isLoading) return <WidgetSkeleton variant="list" />
  if (error || !league) return <ErrorState />

  const teams = league.matchups.teams
  const team = picked ?? (selectedTeam || teams[0])
  const swap = new Map(league.matchups.schedule_swap.map(r => [r.Team, r]))
  const games = new Map(league.teams.map(t => [t.team, t.games]))
  const record = (team: string, owner: string) => {
    const wins = swap.get(team)?.[owner] as number
    return formatRecord(wins, (games.get(owner) ?? 0) - wins)
  }

  return (
    <div className="w-full space-y-4">
      <Card>
        <CardHeader className="space-y-2">
          <CardTitle>What if you had their schedule?</CardTitle>
          <CardDescription>
            Your scores stay the same; only the opponents change. It shows how much of a record is down to the schedule.
          </CardDescription>
          <Explainer>
            <p>
              Each period, a team&apos;s score is set against the score of the opponent the other team actually
              faced. When that opponent is the team itself, it plays the other team instead. A tie counts as half
              a win.
            </p>
            <p>
              A schedule is easy when its opponents happened to score low in the periods they were met. This is
              the same idea as luck, seen from the schedule&apos;s side.
            </p>
          </Explainer>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <TeamSchedules league={league} team={team} onTeam={setPicked} />
        <ScheduleDifficulty deltas={deltas} teams={teams} selectedTeam={selectedTeam} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Every team, every schedule</CardTitle>
          <CardDescription>
            Each team (row) with each team&apos;s schedule (column): wins gained or lost against its actual record.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MatrixHeatmap
            teams={teams}
            matrix={deltas}
            selectedTeam={selectedTeam}
            scale={SCALE}
            formatCell={d => signed(d)}
            formatValue={d => signed(d)}
            minLabelWidth={30}
            listTitle={team => `${team} with each schedule`}
            detail={(team, owner) => `${record(team, owner)} with ${owner}'s schedule`}
            tooltip={(team, owner, delta) => (
              <>
                <div className="font-semibold">{team} with {owner}&apos;s schedule</div>
                <div className="mt-1 text-muted-foreground">
                  <span className="font-semibold text-foreground tabular-nums">{record(team, owner)}</span>
                  {' '}instead of {record(team, team)} ({signed(delta)})
                </div>
              </>
            )}
          />
        </CardContent>
      </Card>
    </div>
  )
}
