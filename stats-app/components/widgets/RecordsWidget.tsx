import { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { WidgetSkeleton } from './WidgetSkeleton'
import { TeamLogo } from './TeamLogo'
import { ErrorState } from './ErrorState'
import { Explainer } from './Explainer'
import { RecordGame, Streak, useLeagueData } from '@/lib/league-data'
import { formatScore } from '@/lib/season'
import { formatCount } from '@/lib/standings'
import { cn } from '@/lib/utils'

interface Row {
  key: string;
  team: string;
  value: ReactNode;
  detail: ReactNode;
}

const ratio = (g: RecordGame) => `${(g.score / g.period_avg).toFixed(2)}×`
const line = (g: RecordGame) => `${formatScore(g.score)}–${formatScore(g.opp_score)}`
const gameKey = (g: RecordGame) => `${g.period}-${g.team}`

function RecordList({ title, note, rows, selectedTeam }: {
  title: string;
  note: string;
  rows: Row[];
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
          {rows.map((r, i) => (
            <li
              key={r.key}
              className={cn('flex items-center gap-2 rounded-md px-1.5 py-1.5', r.team === selectedTeam && 'bg-muted')}
            >
              <span className="w-4 shrink-0 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
              <TeamLogo teamName={r.team} size={24} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{r.team}</div>
                <div className="text-xs text-muted-foreground">{r.detail}</div>
              </div>
              <span className="shrink-0 text-right text-base font-bold tabular-nums">{r.value}</span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}

export function RecordsWidget({ selectedTeam }: { selectedTeam: string }) {
  const { data: league, isLoading, error } = useLeagueData()

  if (isLoading) return <WidgetSkeleton variant="list" />
  if (error || !league) return <ErrorState />

  const { records, meta } = league
  // A streak that reaches the latest period is still going, until the playoffs start
  const ongoing = (s: Streak) => s.end === meta.latest_period && !league.playoffs?.swiss.rounds.length
  const streakRows = (streaks: Streak[]): Row[] => streaks.map(s => ({
    key: `${s.team}-${s.start}`,
    team: s.team,
    value: s.length,
    detail: <>Periods {s.start}–{s.end}{ongoing(s) && <span className="font-semibold text-foreground"> · still going</span>}</>,
  }))

  const lists: { title: string; note: string; rows: Row[] }[] = [
    {
      title: 'Highest scores',
      note: 'The biggest scores of the season.',
      rows: records.highest_scores.map(g => ({
        key: gameKey(g), team: g.team, value: formatScore(g.score),
        detail: `P${g.period} vs ${g.opponent} · ${ratio(g)} the period average`,
      })),
    },
    {
      title: 'Best against the period',
      note: 'Scores compared with the period average.',
      rows: records.best_vs_average.map(g => ({
        key: gameKey(g), team: g.team, value: ratio(g),
        detail: `${formatScore(g.score)} in P${g.period} (average ${Math.round(g.period_avg)})`,
      })),
    },
    {
      title: 'Worst against the period',
      note: 'The lowest scores compared with the period average.',
      rows: records.worst_vs_average.map(g => ({
        key: gameKey(g), team: g.team, value: ratio(g),
        detail: `${formatScore(g.score)} in P${g.period} (average ${Math.round(g.period_avg)})`,
      })),
    },
    {
      title: 'Biggest blowouts',
      note: 'The widest winning margins.',
      rows: records.blowouts.map(g => ({
        key: gameKey(g), team: g.team, value: `+${formatScore(g.score - g.opp_score)}`,
        detail: `Beat ${g.opponent} ${line(g)} · P${g.period}`,
      })),
    },
    {
      title: 'Closest games',
      note: 'The narrowest margins.',
      rows: records.closest_games.map(g => ({
        key: gameKey(g), team: g.team,
        value: g.score === g.opp_score ? 'Tie' : `+${formatScore(g.score - g.opp_score)}`,
        detail: `${g.score === g.opp_score ? 'Tied' : 'Beat'} ${g.opponent} ${line(g)} · P${g.period}`,
      })),
    },
    {
      title: 'Unluckiest losses',
      note: 'Losses with a score that beat most of the league that period.',
      rows: records.unluckiest_losses.map(g => ({
        key: gameKey(g), team: g.team, value: `${formatCount(g.all_play_wins)} of ${g.others}`,
        detail: `Lost to ${g.opponent} ${line(g)} · P${g.period}`,
      })),
    },
    {
      title: 'Luckiest wins',
      note: 'Wins with a score that beat few teams that period.',
      rows: records.luckiest_wins.map(g => ({
        key: gameKey(g), team: g.team, value: `${formatCount(g.all_play_wins)} of ${g.others}`,
        detail: `Beat ${g.opponent} ${line(g)} · P${g.period}`,
      })),
    },
    {
      title: 'Longest winning streaks',
      note: 'Wins in a row; a tie ends a streak.',
      rows: streakRows(records.win_streaks),
    },
    {
      title: 'Longest losing streaks',
      note: 'Losses in a row; a tie ends a streak.',
      rows: streakRows(records.losing_streaks),
    },
    {
      title: 'Most period highs',
      note: "Periods with the league's top score.",
      rows: records.period_highs.map(h => ({
        key: h.team, team: h.team, value: h.count,
        detail: `Top score in ${h.count} of ${meta.latest_period} periods`,
      })),
    },
  ]

  return (
    <div className="w-full space-y-4">
      <Card>
        <CardHeader className="space-y-2">
          <CardTitle>Record book</CardTitle>
          <CardDescription>
            The season&apos;s standout games and streaks, regular season through period {meta.latest_period}.
            {selectedTeam && ' Your team is highlighted.'}
          </CardDescription>
          <Explainer>
            <p>
              Some periods have many more NBA games than others, so their scores run higher (the long All-Star
              period scores the most). &ldquo;Against the period&rdquo; divides a score by that period&apos;s
              average: 2.00× is double the average.
            </p>
            <p>
              <strong>Unluckiest losses</strong> and <strong>luckiest wins</strong> count the teams the score beat
              that period: &ldquo;25 of 29&rdquo; means it beat 25 of the other 29 teams&apos; scores.
            </p>
          </Explainer>
        </CardHeader>
      </Card>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {lists.map(l => <RecordList key={l.title} {...l} selectedTeam={selectedTeam} />)}
      </div>
    </div>
  )
}
