import { useMemo, useState } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { Line, LineCustomSvgLayerProps } from '@nivo/line'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { WidgetSkeleton } from './WidgetSkeleton'
import { TeamLogo } from './TeamLogo'
import { ErrorState } from './ErrorState'
import { LeagueData, useLeagueData } from '@/lib/league-data'
import { formatScore } from '@/lib/season'
import { Standing, computeStandings, formatLuck, formatPct, formatRecord, ordinal } from '@/lib/standings'
import { useChartTheme } from '@/lib/chart-theme'
import { teamLineColor } from '@/lib/nba-team-colors'
import { teamCode } from '@/lib/teams'
import { useElementWidth } from '@/lib/use-element-width'
import { cn } from '@/lib/utils'

const cell = (league: LeagueData, key: 'all_play' | 'wins' | 'games' | 'luck', team: string, opponent: string) => {
  const value = league.matchups[key].find(r => r.Team === team)?.[opponent]
  return typeof value === 'number' ? value : null
}

function TeamSelect({ value, teams, onChange, label }: {
  value: string;
  teams: string[];
  onChange: (team: string) => void;
  label: string;
}) {
  return (
    <label className="flex min-w-0 flex-1 items-center gap-2">
      <TeamLogo key={value} teamName={value} size={28} className="hidden shrink-0 sm:block" />
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm font-medium"
      >
        {teams.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
    </label>
  )
}

/** One stat for both teams; the better side in bold. */
function CompareRow({ label, a, b, better }: { label: string; a: string; b: string; better: 'a' | 'b' | null }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-3 py-2">
      <span className={cn('text-right text-base tabular-nums sm:text-lg', better === 'a' ? 'font-bold' : 'text-muted-foreground')}>{a}</span>
      <span className="text-center text-xs text-muted-foreground sm:text-sm">{label}</span>
      <span className={cn('text-base tabular-nums sm:text-lg', better === 'b' ? 'font-bold' : 'text-muted-foreground')}>{b}</span>
    </div>
  )
}

const compare = (a: number, b: number, higherIsBetter = true): 'a' | 'b' | null =>
  a === b ? null : (a > b) === higherIsBetter ? 'a' : 'b'

interface Series {
  id: string;
  data: { x: number; y: number }[];
}

/** Both teams' scores each period; the periods they met are marked. */
function ScoresChart({ league, a, b, met }: { league: LeagueData; a: string; b: string; met: number[] }) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const { colors, nivoTheme, isDark } = useChartTheme()
  const series: Series[] = [a, b].map(team => ({
    id: team,
    data: league.results.filter(r => r.team === team).sort((x, y) => x.period - y.period).map(r => ({ x: r.period, y: r.score })),
  }))
  const last = league.meta.latest_period
  const step = width < 640 ? 8 : 4
  const ticks = Array.from({ length: last }, (_, i) => i + 1).filter(p => p === 1 || p % step === 0)

  const Lines = ({ series: computed, lineGenerator }: LineCustomSvgLayerProps<Series>) => (
    <g fill="none" pointerEvents="none">
      {computed.map((s, i) => (
        <path
          key={s.id}
          d={lineGenerator(s.data.map(d => d.position)) ?? undefined}
          stroke={teamLineColor(s.id, isDark)}
          strokeWidth={i === 0 ? 3 : 2.5}
          strokeDasharray={i === 0 ? undefined : '6 4'}
        />
      ))}
    </g>
  )

  return (
    <div ref={ref} className="w-full">
      {width > 0 && (
        <Line<Series>
          data={series}
          width={width}
          height={width < 640 ? 260 : 320}
          margin={{ top: 12, right: 12, bottom: 40, left: 44 }}
          theme={nivoTheme}
          xScale={{ type: 'linear', min: 1, max: last, nice: false }}
          yScale={{ type: 'linear', min: 0, max: 'auto' }}
          curve="monotoneX"
          gridXValues={ticks}
          axisBottom={{ tickValues: ticks, tickSize: 0, tickPadding: 8, legend: 'Period', legendPosition: 'middle', legendOffset: 32 }}
          axisLeft={{ tickSize: 0, tickPadding: 8, tickValues: 5 }}
          markers={met.map(p => ({
            axis: 'x' as const, value: p, lineStyle: { stroke: colors.referenceLine, strokeDasharray: '2 3', strokeWidth: 1 },
          }))}
          layers={['grid', 'markers', 'axes', Lines, 'mesh']}
          useMesh
          enableTouchCrosshair
          animate={false}
          tooltip={({ point }) => {
            const period = point.data.x
            const score = (team: string) => series.find(s => s.id === team)?.data.find(d => d.x === period)?.y
            return (
              <div className="w-48 rounded-lg border bg-card p-3 text-sm text-card-foreground shadow-lg">
                <div className="font-semibold">Period {period}{met.includes(period) ? ' · head-to-head' : ''}</div>
                {[a, b].map(team => (
                  <div key={team} className="mt-1 flex justify-between gap-2 text-muted-foreground">
                    <span>{teamCode(team)}</span>
                    <span className="font-semibold text-foreground tabular-nums">{formatScore(score(team) ?? 0)}</span>
                  </div>
                ))}
              </div>
            )
          }}
        />
      )}
    </div>
  )
}

export function RivalryWidget({ selectedTeam }: { selectedTeam: string }) {
  const { data: league, isLoading, error } = useLeagueData()
  const standings = useMemo(() => league ? computeStandings(league.teams) : [], [league])
  const [picked, setPicked] = useState<{ a: string; b: string } | null>(null)
  const { isDark } = useChartTheme()

  if (isLoading) return <WidgetSkeleton variant="list" />
  if (error || !league) return <ErrorState />

  const teams = league.matchups.teams
  // Until two teams are picked: the viewer's team and its latest opponent (else the top two)
  const defaultA = selectedTeam || standings[0]?.team || teams[0]
  const latest = league.results.filter(r => r.team === defaultA).sort((x, y) => y.period - x.period)[0]
  const { a, b } = picked ?? { a: defaultA, b: selectedTeam && latest ? latest.opponent : standings[1]?.team ?? teams[1] }
  const set = (side: 'a' | 'b', team: string) => {
    // Picking the other side's team swaps the two
    if (team === (side === 'a' ? b : a)) setPicked({ a: b, b: a })
    else setPicked({ a, b, [side]: team })
  }

  const sa = standings.find(s => s.team === a) as Standing
  const sb = standings.find(s => s.team === b) as Standing
  const games = league.results.filter(r => r.team === a && r.opponent === b).sort((x, y) => x.period - y.period)
  const wins = cell(league, 'wins', a, b) ?? 0
  const played = cell(league, 'games', a, b) ?? 0
  const rateA = cell(league, 'all_play', a, b) ?? 0
  const rateB = cell(league, 'all_play', b, a) ?? 0
  const luck = cell(league, 'luck', a, b)
  const avg = (s: Standing) => s.points_for / s.games

  return (
    <div className="w-full space-y-4">
      <Card>
        <CardHeader className="space-y-3">
          <div className="space-y-1.5">
            <CardTitle>Rivalry</CardTitle>
            <CardDescription>Any two teams: their games against each other, and who scores more week to week.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <TeamSelect value={a} teams={teams} onChange={t => set('a', t)} label="First team" />
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => setPicked({ a: b, b: a })}
              aria-label="Swap the teams"
            >
              <ArrowLeftRight className="h-4 w-4" />
            </Button>
            <TeamSelect value={b} teams={teams} onChange={t => set('b', t)} label="Second team" />
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-4 p-4 sm:p-6">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div className="flex min-w-0 flex-col items-center gap-1 text-center">
                <TeamLogo key={a} teamName={a} size={56} />
                <span className="w-full truncate text-sm font-semibold">{a}</span>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold tabular-nums sm:text-4xl">
                  {played ? formatRecord(wins, played - wins) : '–'}
                </div>
                <div className="text-xs text-muted-foreground">{played ? 'head-to-head' : 'not played yet'}</div>
              </div>
              <div className="flex min-w-0 flex-col items-center gap-1 text-center">
                <TeamLogo key={b} teamName={b} size={56} />
                <span className="w-full truncate text-sm font-semibold">{b}</span>
              </div>
            </div>
            <div className="divide-y border-t">
              <CompareRow label="Outscored the other" a={`${Math.round(rateA * 100)}%`} b={`${Math.round(rateB * 100)}%`} better={compare(rateA, rateB)} />
              <CompareRow label="Record" a={formatRecord(sa.wins, sa.losses)} b={formatRecord(sb.wins, sb.losses)} better={compare(sa.rank, sb.rank, false)} />
              <CompareRow label="Standings" a={ordinal(sa.rank)} b={ordinal(sb.rank)} better={compare(sa.rank, sb.rank, false)} />
              <CompareRow label="All-play" a={formatPct(sa.all_play_pct)} b={formatPct(sb.all_play_pct)} better={compare(sa.all_play_pct, sb.all_play_pct)} />
              <CompareRow label="Average score" a={formatScore(avg(sa))} b={formatScore(avg(sb))} better={compare(avg(sa), avg(sb))} />
              <CompareRow label="Luck (season)" a={formatLuck(sa.luck)} b={formatLuck(sb.luck)} better={null} />
            </div>
            <p className="text-sm text-muted-foreground">
              &ldquo;Outscored the other&rdquo;: the share of periods each team&apos;s score was higher, whether or not
              they played each other.
              {luck !== null && Math.abs(luck) >= 0.1 && (
                <> In their games, {luck > 0 ? a : b} has won {Math.abs(luck).toFixed(1)} more than the scores earned.</>
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Their games</CardTitle>
            <CardDescription>{played ? 'Every time they met this season.' : 'They haven’t played each other this season.'}</CardDescription>
          </CardHeader>
          {games.length > 0 && (
            <CardContent>
              <ul className="divide-y">
                {games.map(g => {
                  const winner = g.win === 1 ? a : g.win === 0 ? b : null
                  return (
                    <li key={g.period} className="flex items-center gap-3 py-2.5 text-sm sm:text-base">
                      <span className="w-9 shrink-0 text-muted-foreground tabular-nums">P{g.period}</span>
                      {winner ? <TeamLogo teamName={winner} size={24} className="shrink-0" /> : <span className="w-6 shrink-0" />}
                      <span className="min-w-0 flex-1 truncate">{winner ? `${winner} won` : 'Tie'}</span>
                      <span className="font-semibold tabular-nums">{formatScore(g.score)}–{formatScore(g.opp_score)}</span>
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Scores, period by period</CardTitle>
          <CardDescription>
            <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
              <svg width="20" height="4" aria-hidden><line x1="0" y1="2" x2="20" y2="2" stroke={teamLineColor(a, isDark)} strokeWidth="3" /></svg>
              {a}
            </span>
            <span className="ml-4 inline-flex items-center gap-1.5 font-medium text-foreground">
              <svg width="20" height="4" aria-hidden><line x1="0" y1="2" x2="20" y2="2" stroke={teamLineColor(b, isDark)} strokeWidth="2.5" strokeDasharray="6 4" /></svg>
              {b}
            </span>
            {games.length > 0 && <>. Dotted lines: the periods they met.</>}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-2 sm:px-6">
          <ScoresChart league={league} a={a} b={b} met={games.map(g => g.period)} />
        </CardContent>
      </Card>
    </div>
  )
}
