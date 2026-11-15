import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { WidgetSkeleton } from './WidgetSkeleton'
import { ErrorState } from './ErrorState'
import { Explainer } from './Explainer'
import { RecordList, RecordRow, line, ratio } from './RecordsWidget'
import { FINISH_LABEL, SeasonGame, SeasonStreak, TeamSeason, allPlayPct, formatIndex, useAllTime, winPct } from '@/lib/alltime'
import { formatScore } from '@/lib/season'
import { formatCount, formatLuck, formatPct, formatRecord } from '@/lib/standings'

const gameKey = (g: SeasonGame) => `${g.season}-${g.period}-${g.team}`
const seasonKey = (s: TeamSeason) => `${s.season}-${s.team}`
const finish = (s: TeamSeason) => s.finish ? FINISH_LABEL[s.finish].toLowerCase() : ''

function seasonRows(seasons: TeamSeason[], value: (s: TeamSeason) => string, detail: (s: TeamSeason) => string): RecordRow[] {
  return seasons.map(s => ({ key: seasonKey(s), team: s.team, value: value(s), detail: `${s.season} · ${detail(s)}` }))
}

function streakRows(streaks: SeasonStreak[]): RecordRow[] {
  return streaks.map(s => ({
    key: `${s.season}-${s.team}-${s.start}`, team: s.team, value: s.length,
    detail: `${s.season} · periods ${s.start}–${s.end}`,
  }))
}

export function AllTimeRecordsWidget({ selectedTeam }: { selectedTeam: string }) {
  const { data, isLoading, error } = useAllTime()

  if (isLoading) return <WidgetSkeleton variant="list" />
  if (error || !data) return <ErrorState />

  const r = data.records
  const first = data.seasons[data.seasons.length - 1].season
  const inProgress = data.seasons.find(s => s.in_progress)?.season
  const record = (s: TeamSeason) => formatRecord(s.wins, s.losses)

  const lists: { title: string; note: string; rows: RecordRow[] }[] = [
    {
      title: 'Best regular seasons',
      note: 'The highest win rates.',
      rows: seasonRows(r.best_seasons, record, s => `${formatPct(allPlayPct(s))} all-play · ${finish(s)}`),
    },
    {
      title: 'Worst regular seasons',
      note: 'The lowest win rates.',
      rows: seasonRows(r.worst_seasons, record, s => `${formatPct(allPlayPct(s))} all-play · ${formatLuck(s.luck)} luck`),
    },
    {
      title: 'Strongest seasons',
      note: 'The best all-play records: the schedule left out.',
      rows: seasonRows(r.best_all_play_seasons, s => formatPct(allPlayPct(s)), s => `${record(s)} · ${finish(s)}`),
    },
    {
      title: 'Highest-scoring seasons',
      note: 'Scores against the period average, over the season.',
      rows: seasonRows(r.best_score_index_seasons, s => `${formatIndex(s.score_index)}×`, s => `${record(s)} · ${finish(s)}`),
    },
    {
      title: 'Luckiest seasons',
      note: 'The most wins above what the scores earned.',
      rows: seasonRows(r.luckiest_seasons, s => formatLuck(s.luck), s => `${record(s)} (${formatPct(winPct(s))} vs ${formatPct(allPlayPct(s))} all-play)`),
    },
    {
      title: 'Unluckiest seasons',
      note: 'The most wins below what the scores earned.',
      rows: seasonRows(r.unluckiest_seasons, s => formatLuck(s.luck), s => `${record(s)} (${formatPct(winPct(s))} vs ${formatPct(allPlayPct(s))} all-play)`),
    },
    {
      title: 'Best against the period',
      note: 'Single games: the score compared with the period average.',
      rows: r.best_vs_average.map(g => ({
        key: gameKey(g), team: g.team, value: ratio(g),
        detail: `${g.season} P${g.period} · ${formatScore(g.score)} (average ${Math.round(g.period_avg)})`,
      })),
    },
    {
      title: 'Worst against the period',
      note: 'The lowest scores compared with the period average.',
      rows: r.worst_vs_average.map(g => ({
        key: gameKey(g), team: g.team, value: ratio(g),
        detail: `${g.season} P${g.period} · ${formatScore(g.score)} (average ${Math.round(g.period_avg)})`,
      })),
    },
    {
      title: 'Highest scores',
      note: 'Raw points; long periods and newer scoring settings score more.',
      rows: r.highest_scores.map(g => ({
        key: gameKey(g), team: g.team, value: formatScore(g.score),
        detail: `${g.season} P${g.period} vs ${g.opponent} · ${ratio(g)} the average`,
      })),
    },
    {
      title: 'Biggest blowouts',
      note: 'The widest winning margins, in points.',
      rows: r.blowouts.map(g => ({
        key: gameKey(g), team: g.team, value: `+${formatScore(g.score - g.opp_score)}`,
        detail: `${g.season} P${g.period} · beat ${g.opponent} ${line(g)}`,
      })),
    },
    {
      title: 'Unluckiest losses',
      note: 'Losses with a score that beat most of the league.',
      rows: r.unluckiest_losses.map(g => ({
        key: gameKey(g), team: g.team, value: `${formatCount(g.all_play_wins)} of ${g.others}`,
        detail: `${g.season} P${g.period} · lost to ${g.opponent} ${line(g)}`,
      })),
    },
    {
      title: 'Luckiest wins',
      note: 'Wins with a score that beat few teams.',
      rows: r.luckiest_wins.map(g => ({
        key: gameKey(g), team: g.team, value: `${formatCount(g.all_play_wins)} of ${g.others}`,
        detail: `${g.season} P${g.period} · beat ${g.opponent} ${line(g)}`,
      })),
    },
    { title: 'Longest winning streaks', note: 'Wins in a row within a season; a tie ends a streak.', rows: streakRows(r.win_streaks) },
    { title: 'Longest losing streaks', note: 'Losses in a row within a season.', rows: streakRows(r.losing_streaks) },
    {
      title: 'Most top-5 periods',
      note: "Periods with one of the league's 5 best scores, all seasons.",
      rows: r.top5_periods.map(h => ({ key: h.team, team: h.team, value: h.count, detail: `Top 5 in ${h.count} periods` })),
    },
  ]

  return (
    <div className="w-full space-y-4">
      <Card>
        <CardHeader className="space-y-2">
          <CardTitle>All-time records</CardTitle>
          <CardDescription>
            Top 10 lists from every regular season since {first}.{selectedTeam && ' Your team is highlighted.'}
          </CardDescription>
          <Explainer>
            <p>
              Seasons had 30 to 33 periods and the scoring changed over the years, so most lists compare
              scores with the period&apos;s average (2.00× is double it) rather than raw points.
            </p>
            <p>
              The season lists count finished seasons only{inProgress && <> ({inProgress} joins them when it ends)</>};
              the game lists and streaks include every season. Games where Fantrax now shows a 0 (old games
              re-scored with today&apos;s roster rules) are left out of the game lists.
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
