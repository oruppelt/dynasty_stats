import { useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { WidgetSkeleton } from './WidgetSkeleton'
import { ErrorState } from './ErrorState'
import { Explainer } from './Explainer'
import { SeasonLines, TeamSeries } from './SeasonLines'
import { TeamLogo } from './TeamLogo'
import { useChartTheme } from '@/lib/chart-theme'
import { useLeagueData } from '@/lib/league-data'
import { teamLineColor } from '@/lib/nba-team-colors'
import { standingsByPeriod } from '@/lib/season'
import { Standing, formatLuck, formatPct, formatRecord, luckColor, ordinal } from '@/lib/standings'
import { teamCode } from '@/lib/teams'
import { cn } from '@/lib/utils'

type RankBy = 'standings' | 'allplay'

const RANK_BY: Record<RankBy, { label: string; rank: (s: Standing) => number }> = {
  standings: { label: 'Standings', rank: s => s.rank },
  allplay: { label: 'All-play', rank: s => s.all_play_rank },
}

function series(byPeriod: Map<number, Standing[]>, value: (s: Standing) => number): TeamSeries[] {
  const teams = new Map<string, TeamSeries>()
  for (const [period, standings] of byPeriod) {
    for (const s of standings) {
      const t = teams.get(s.team) ?? { id: s.team, data: [] }
      t.data.push({ x: period, y: value(s) })
      teams.set(s.team, t)
    }
  }
  return [...teams.values()]
}

/** Whole-number ticks from `min` to `max`, every `step`. */
function ticks(min: number, max: number, step: number): number[] {
  const out: number[] = []
  for (let v = min; v <= max; v += step) out.push(v)
  return out
}

const signed = (luck: number) => formatLuck(luck).replace('-', '−')

/** Quick picks by current standings position */
const PRESETS: { label: string; ranks: (rank: number) => boolean }[] = [
  { label: 'Top 8', ranks: r => r <= 8 },
  { label: 'Top 16', ranks: r => r <= 16 },
  { label: '17–30', ranks: r => r > 16 },
  { label: 'All', ranks: () => true },
  { label: 'None', ranks: () => false },
]
const DEFAULT_PRESET = PRESETS[0]

function TeamPicker({ standings, shown, onChange, selectedTeam }: {
  standings: Standing[]
  shown: Set<string>
  onChange: (shown: Set<string>) => void
  selectedTeam: string
}) {
  const { isDark } = useChartTheme()
  const toggle = (team: string) => {
    const next = new Set(shown)
    if (next.has(team)) next.delete(team)
    else next.add(team)
    onChange(next)
  }
  return (
    <Card>
      <CardHeader className="space-y-3 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="text-lg">Teams in color</CardTitle>
            <CardDescription>
              For both charts below, in standings order. {selectedTeam ? 'Your team is always in color.' : ''}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick picks">
            {PRESETS.map(p => (
              <button
                key={p.label}
                type="button"
                onClick={() => onChange(new Set(standings.filter(s => p.ranks(s.rank)).map(s => s.team)))}
                className="rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-5 gap-1 sm:grid-cols-6 md:grid-cols-10" role="group" aria-label="Teams in color">
          {standings.map(s => {
            const on = shown.has(s.team) || s.team === selectedTeam
            return (
              <button
                key={s.team}
                type="button"
                title={s.team}
                onClick={() => toggle(s.team)}
                disabled={s.team === selectedTeam}
                aria-pressed={on}
                className={cn(
                  'flex items-center gap-1 rounded-md border px-1 py-1 text-xs font-semibold tabular-nums transition-colors sm:gap-1.5 sm:px-1.5',
                  on ? 'bg-muted text-foreground' : 'border-transparent text-muted-foreground opacity-60 hover:opacity-100',
                )}
                style={on ? { borderColor: teamLineColor(s.team, isDark), borderWidth: 2 } : undefined}
              >
                <TeamLogo teamName={s.team} size={18} className="shrink-0" />
                {teamCode(s.team)}
              </button>
            )
          })}
        </div>
      </CardHeader>
    </Card>
  )
}

function Toggle({ value, onChange }: { value: RankBy; onChange: (v: RankBy) => void }) {
  return (
    <div className="inline-flex rounded-md bg-muted p-1 text-sm" role="group" aria-label="Rank by">
      {(Object.keys(RANK_BY) as RankBy[]).map(v => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={cn(
            'rounded-sm px-3 py-1 font-medium text-muted-foreground',
            value === v && 'bg-background text-foreground shadow-xs',
          )}
        >
          {RANK_BY[v].label}
        </button>
      ))}
    </div>
  )
}

export function SeasonWidget({ selectedTeam }: { selectedTeam: string }) {
  const { data: league, isLoading, error } = useLeagueData()
  const [rankBy, setRankBy] = useState<RankBy>('standings')
  // null: the default pick, by the latest standings
  const [picked, setPicked] = useState<Set<string> | null>(null)
  const byPeriod = useMemo(() => league ? standingsByPeriod(league.results) : new Map<number, Standing[]>(), [league])
  const lookup = useMemo(() => {
    const map = new Map<string, Standing>()
    for (const [period, standings] of byPeriod) for (const s of standings) map.set(`${period}|${s.team}`, s)
    return map
  }, [byPeriod])
  const rankSeries = useMemo(() => series(byPeriod, RANK_BY[rankBy].rank), [byPeriod, rankBy])
  const luckSeries = useMemo(() => series(byPeriod, s => s.luck), [byPeriod])

  if (isLoading) return <WidgetSkeleton variant="chart" />
  if (error || !league) return <ErrorState />

  const teamCount = league.teams.length
  const latest = [...byPeriod.values()].at(-1) ?? []
  const shown = picked ?? new Set(latest.filter(s => DEFAULT_PRESET.ranks(s.rank)).map(s => s.team))
  const luckValues = luckSeries.flatMap(s => s.data.map(d => d.y))
  const luckMin = Math.floor(Math.min(...luckValues, 0) / 2) * 2
  const luckMax = Math.ceil(Math.max(...luckValues, 0) / 2) * 2
  const hint = selectedTeam ? '' : ' Pick your team at the top to highlight it.'

  return (
    <div className="w-full space-y-4">
      <TeamPicker standings={latest} shown={shown} onChange={setPicked} selectedTeam={selectedTeam} />
      <Card>
        <CardHeader className="space-y-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1.5">
              <CardTitle>Rank over the season</CardTitle>
              <CardDescription>
                Each line is a team&apos;s place after every period; 1st is at the top. Hover any line to see the team.{hint}
              </CardDescription>
            </div>
            <Toggle value={rankBy} onChange={setRankBy} />
          </div>
          <Explainer>
            <p>
              <strong>Standings</strong> ranks by win rate, then points for, as in the Standings tab.{' '}
              <strong>All-play</strong> ranks by the all-play record: how often a team outscored every other
              team, which leaves the schedule out. A team well above its all-play line has been lucky.
            </p>
          </Explainer>
        </CardHeader>
        <CardContent className="px-2 sm:px-6">
          <SeasonLines
            series={rankSeries}
            selectedTeam={selectedTeam}
            shown={shown}
            yScale={{ type: 'linear', min: 1, max: teamCount, reverse: true, nice: false }}
            yTicks={[1, ...ticks(5, teamCount, 5)]}
            formatY={String}
            yLegend="Rank"
            tooltip={(team, period) => {
              const s = lookup.get(`${period}|${team}`)!
              return (
                <>
                  <div className="font-semibold">{team}</div>
                  <div className="text-muted-foreground">After period {period}</div>
                  <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-3 text-muted-foreground">
                    <dt>Standings</dt>
                    <dd className="text-right tabular-nums">
                      <span className="font-semibold text-foreground">{ordinal(s.rank)}</span> {formatRecord(s.wins, s.losses)}
                    </dd>
                    <dt>All-play</dt>
                    <dd className="text-right tabular-nums">
                      <span className="font-semibold text-foreground">{ordinal(s.all_play_rank)}</span> {formatPct(s.all_play_pct)}
                    </dd>
                  </dl>
                </>
              )
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-2">
          <CardTitle>Luck over the season</CardTitle>
          <CardDescription>
            Each team&apos;s luck so far, in wins: above the dashed line it has won more than its scores earned.{hint}
          </CardDescription>
          <Explainer>
            <p>
              Luck is the same number as in the standings, worked out with only the games played up to
              that period. Its last point is the team&apos;s current luck. Luck often evens out over a
              season, so a line drifting back toward zero is normal.
            </p>
          </Explainer>
        </CardHeader>
        <CardContent className="px-2 sm:px-6">
          <SeasonLines
            series={luckSeries}
            selectedTeam={selectedTeam}
            shown={shown}
            yScale={{ type: 'linear', min: luckMin, max: luckMax, nice: false }}
            yTicks={ticks(luckMin, luckMax, 2)}
            formatY={v => v === 0 ? '0' : `${v > 0 ? '+' : '−'}${Math.abs(v)}`}
            yLegend="Luck (wins)"
            baseline={0}
            tooltip={(team, period, luck) => (
              <>
                <div className="font-semibold">{team}</div>
                <div className="text-muted-foreground">
                  After period {period}:{' '}
                  <span className={cn('font-semibold', luckColor(luck))}>{signed(luck)} wins</span>
                </div>
              </>
            )}
          />
        </CardContent>
      </Card>
    </div>
  )
}
