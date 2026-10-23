import { useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { WidgetSkeleton } from './WidgetSkeleton'
import { TeamLogo } from './TeamLogo'
import { ErrorState } from './ErrorState'
import { Explainer } from './Explainer'
import { TeamForm, useLeagueData } from '@/lib/league-data'
import { computeStandings, formatPct, ordinal } from '@/lib/standings'
import { teamCode } from '@/lib/teams'
import { cn } from '@/lib/utils'

/** The team's score rank in each recent period; a top finish is filled in. */
function Finishes({ form, topX }: { form: TeamForm; topX: number }) {
  return (
    <span className="flex gap-0.5 sm:gap-1">
      {form.finishes.map(f => (
        <span
          key={f.period}
          title={`Period ${f.period}: ${ordinal(f.rank)}-highest score`}
          className={cn(
            'w-5 shrink-0 rounded text-center text-[10px] font-semibold leading-5 tabular-nums sm:w-6 sm:text-xs sm:leading-6',
            f.rank <= topX ? 'bg-strong text-white' : 'bg-muted text-muted-foreground',
          )}
        >
          {f.rank}
        </span>
      ))}
    </span>
  )
}

export function FormWidget({ selectedTeam }: { selectedTeam: string }) {
  const { data: league, isLoading, error } = useLeagueData()
  const standingsRank = useMemo(
    () => new Map(league ? computeStandings(league.teams).map(s => [s.team, s.rank]) : []),
    [league],
  )

  if (isLoading) return <WidgetSkeleton variant="list" />
  if (error || !league) return <ErrorState />

  const { form } = league
  const maxScore = Math.max(...form.teams.map(t => t.elite_score), 1)
  const shown = form.teams[0]?.finishes.length ?? 0

  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle>Form</CardTitle>
        <CardDescription>
          Who has been scoring near the top of the league lately, after period {league.meta.latest_period}. The
          squares are the team&apos;s score rank in each of the last {shown} periods; blue is a top-{form.top_x} score.
        </CardDescription>
        <Explainer>
          <p>
            <strong>Elite score:</strong> each period, the best score gets {form.top_x} points, the second{' '}
            {form.top_x - 1}, down to 1 for the {ordinal(form.top_x)}. <strong>Top {form.top_x}:</strong> how many
            periods the team had a top-{form.top_x} score. Both count recent periods more: one period back counts{' '}
            {form.decay}, two back {Math.round(form.decay ** 2 * 100) / 100}, and so on, so a hot streak lifts a team
            quickly.
          </p>
          <p>
            <strong>Last {form.recent_periods}:</strong> the all-play win rate over the last {form.recent_periods}{' '}
            periods. The form rank averages the team&apos;s ranks in these three. The standings rank is there to
            compare: a team in form well below its standings rank may be on the way down, and the other way round.
          </p>
        </Explainer>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="w-7 py-2 pl-1 font-medium sm:pl-2">#</th>
              <th className="py-2 font-medium">Team</th>
              <th className="py-2 font-medium">Last {shown}</th>
              <th className="hidden py-2 text-right font-medium md:table-cell">Top {form.top_x}</th>
              <th className="py-2 pl-2 font-medium sm:w-40">Elite score</th>
              <th className="hidden py-2 text-right font-medium sm:table-cell">Last {form.recent_periods}</th>
              <th className="hidden py-2 pr-2 text-right font-medium sm:table-cell">Standings</th>
            </tr>
          </thead>
          <tbody>
            {form.teams.map(t => (
              <tr key={t.team} className={cn('border-b', t.team === selectedTeam && 'bg-muted')}>
                <td className="py-2 pl-1 text-xs tabular-nums text-muted-foreground sm:pl-2">{t.form_rank}</td>
                <td className="py-2 pr-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <TeamLogo teamName={t.team} size={24} className="shrink-0" />
                    <span className="truncate font-medium sm:hidden">{teamCode(t.team)}</span>
                    <span className="hidden truncate font-medium sm:inline">{t.team}</span>
                  </span>
                </td>
                <td className="py-2"><Finishes form={t} topX={form.top_x} /></td>
                <td className="hidden py-2 text-right tabular-nums md:table-cell">
                  {t.top_finishes}<span className="text-muted-foreground"> of {t.periods}</span>
                </td>
                <td className="py-2 pl-2">
                  <span className="flex items-center gap-2">
                    <span className="hidden h-2 flex-1 overflow-hidden rounded-full bg-muted sm:block">
                      <span className="block h-full rounded-full bg-strong" style={{ width: `${(t.elite_score / maxScore) * 100}%` }} />
                    </span>
                    <span className="w-9 text-right font-semibold tabular-nums">{t.elite_score.toFixed(1)}</span>
                  </span>
                </td>
                <td className="hidden py-2 text-right tabular-nums sm:table-cell">{formatPct(t.recent_all_play_pct)}</td>
                <td className="hidden py-2 pr-2 text-right tabular-nums text-muted-foreground sm:table-cell">
                  {ordinal(standingsRank.get(t.team) ?? 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}
