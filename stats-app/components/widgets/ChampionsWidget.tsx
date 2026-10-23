import { Trophy } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { WidgetSkeleton } from './WidgetSkeleton'
import { TeamLogo } from './TeamLogo'
import { ErrorState } from './ErrorState'
import { SeasonSummary, useAllTime } from '@/lib/alltime'
import { cn } from '@/lib/utils'

function SeasonRow({ s, selectedTeam }: { s: SeasonSummary; selectedTeam: string }) {
  const mine = [s.champion, s.runner_up, s.first_seed].includes(selectedTeam)
  return (
    <li className={cn('flex items-center gap-3 rounded-md px-2 py-2.5', mine && 'bg-muted')}>
      <span className="w-16 shrink-0 text-sm font-semibold tabular-nums">{s.season}</span>
      {s.champion ? (
        <TeamLogo teamName={s.champion} size={36} className="shrink-0" />
      ) : (
        <span className="h-9 w-9 shrink-0 rounded-full bg-muted" />
      )}
      <div className="min-w-0 flex-1">
        <div className={cn('flex items-center gap-1.5 truncate font-semibold', !s.champion && 'font-normal text-muted-foreground')}>
          {s.champion && <Trophy className="h-4 w-4 shrink-0 text-rank-gold" />}
          <span className="truncate">
            {s.champion ?? (s.in_progress ? 'In progress' : 'Champion not recorded (earlier format)')}
          </span>
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {s.runner_up && <>Beat {s.runner_up} in the final · </>}
          Best regular season: {s.first_seed}
        </div>
      </div>
    </li>
  )
}

export function ChampionsWidget({ selectedTeam }: { selectedTeam: string }) {
  const { data, isLoading, error } = useAllTime()

  if (isLoading) return <WidgetSkeleton variant="list" />
  if (error || !data) return <ErrorState />

  const cabinet = data.franchises
    .filter(f => f.finals > 0)
    .sort((a, b) => b.titles - a.titles || b.finals - a.finals || b.playoffs - a.playoffs || a.team.localeCompare(b.team))
  const first = data.seasons[data.seasons.length - 1].season
  // Earlier formats: no final in the data
  const noFinal = data.seasons.filter(s => !s.in_progress && !s.runner_up).map(s => s.season).reverse()

  return (
    <div className="grid w-full grid-cols-1 items-start gap-4 lg:grid-cols-[3fr_2fr]">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Champions</CardTitle>
          <CardDescription>Every season since {first}, newest first.</CardDescription>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          <ol className="divide-y">
            {data.seasons.map(s => <SeasonRow key={s.season} s={s} selectedTeam={selectedTeam} />)}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Finals</CardTitle>
          <CardDescription>Titles and finals reached, then playoff appearances.</CardDescription>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          <ol className="divide-y">
            {cabinet.map(f => (
              <li key={f.team} className={cn('flex items-center gap-2 px-1.5 py-2 text-sm', f.team === selectedTeam && 'rounded-md bg-muted')}>
                <TeamLogo teamName={f.team} size={24} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate font-medium">{f.team}</span>
                <span className="flex shrink-0 gap-0.5" aria-label={`${f.titles} titles`}>
                  {Array.from({ length: f.titles }, (_, i) => <Trophy key={i} className="h-4 w-4 text-rank-gold" />)}
                </span>
                <span className="w-16 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                  {f.finals} final{f.finals === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ol>
          {noFinal.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              {noFinal.join(' and ')} had an earlier playoff format, so their finals aren&apos;t counted here.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
