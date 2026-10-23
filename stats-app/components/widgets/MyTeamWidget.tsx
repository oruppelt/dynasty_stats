import { useMemo } from 'react'
import { ArrowRight } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { WidgetSkeleton } from './WidgetSkeleton'
import { TeamLogo } from './TeamLogo'
import { ErrorState } from './ErrorState'
import { LeagueData, useLeagueData } from '@/lib/league-data'
import { formatScore, periodRecap, recapHighlights } from '@/lib/season'
import { useSelectedTeam } from '@/lib/selected-team'
import {
  computeStandings,
  formatCount,
  formatLuck,
  formatPct,
  formatPoints,
  formatRecord,
  luckColor,
  ordinal,
} from '@/lib/standings'
import { cn } from '@/lib/utils'

const RECENT_PERIODS = 5
const OPPONENTS_SHOWN = 3

function luckSentence(luck: number): string {
  const amount = Math.abs(luck).toFixed(1)
  if (luck >= 0.5) return `Won ${amount} more games than their scores earned`
  if (luck <= -0.5) return `Won ${amount} fewer games than their scores earned`
  return 'Record matches their scores'
}

/** Share of periods the team outscored each opponent (all-play), best first. */
function opponentsByWinRate(league: LeagueData, team: string) {
  const row = league.matchups.all_play.find(r => r.Team === team)
  if (!row) return []
  return league.matchups.teams
    .filter(opponent => opponent !== team && typeof row[opponent] === 'number')
    .map(opponent => ({ opponent, rate: row[opponent] as number }))
    .sort((a, b) => b.rate - a.rate)
}

function ResultBadge({ win }: { win: number }) {
  const result = win === 1 ? 'W' : win === 0 ? 'L' : 'T'
  return (
    <span
      className={cn(
        'w-6 shrink-0 rounded text-center text-xs font-bold leading-6 text-white',
        result === 'W' ? 'bg-lucky' : result === 'L' ? 'bg-very-unlucky' : 'bg-neutral',
      )}
    >
      {result}
    </span>
  )
}

/** The team's game in the latest period, its place in that period, and a way into the full recap. */
function LatestPeriod({ league, team, onOpenRecap }: {
  league: LeagueData;
  team: string;
  onOpenRecap?: (period: number) => void;
}) {
  const period = league.meta.latest_period
  const rows = league.results.filter(r => r.period === period)
  const mine = rows.find(r => r.team === team)
  if (!mine) return null

  const highlights = recapHighlights(periodRecap(rows), team)
  const scoreRank = 1 + rows.filter(r => r.score > mine.score).length
  const place = scoreRank === 1 ? 'The highest' : scoreRank === rows.length ? 'The lowest' : `The ${ordinal(scoreRank)}-highest`
  const verb = mine.win === 1 ? 'Beat' : mine.win === 0 ? 'Lost to' : 'Tied'

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-2">
        <div className="space-y-1.5">
          <CardTitle className="text-lg">Period {period}</CardTitle>
          <CardDescription>The latest scoring period</CardDescription>
        </div>
        {onOpenRecap && (
          <Button variant="outline" size="sm" className="h-9 shrink-0 gap-1.5" onClick={() => onOpenRecap(period)}>
            Full recap <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <ResultBadge win={mine.win} />
          <TeamLogo teamName={mine.opponent} size={28} className="shrink-0" />
          <div className="min-w-0">
            <div className="truncate">{verb} {mine.opponent}</div>
            <div className="text-lg font-semibold tabular-nums">
              {formatScore(mine.score)}–{formatScore(mine.opp_score)}
            </div>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {place} score of {rows.length}; it would have
          beaten {formatCount(mine.all_play_wins)} of {mine.all_play_wins + mine.all_play_losses} teams.
        </p>
        {highlights.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {highlights.map(h => (
              <li key={h} className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">{h}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function StatTile({ label, value, detail, className }: {
  label: string;
  value: string;
  detail?: string;
  className?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className={cn('mt-1 text-2xl font-bold tabular-nums', className)}>{value}</div>
        {detail && <div className="mt-1 text-sm text-muted-foreground">{detail}</div>}
      </CardContent>
    </Card>
  )
}

function TeamChooser({ teams }: { teams: string[] }) {
  const setTeam = useSelectedTeam(state => state.setTeam)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pick your team</CardTitle>
        <CardDescription>
          See its record, luck and recent periods. You can change it any time at the top of the page.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {teams.map(team => (
            <button
              key={team}
              type="button"
              onClick={() => setTeam(team)}
              className="flex items-center gap-2 rounded-lg border p-2 text-left text-sm transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <TeamLogo teamName={team} size={28} className="shrink-0" />
              <span className="min-w-0 truncate">{team}</span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export function MyTeamWidget({ selectedTeam, onOpenRecap }: {
  selectedTeam: string;
  /** Opens the Recap tab on a period */
  onOpenRecap?: (period: number) => void;
}) {
  const { data: league, isLoading, error } = useLeagueData()
  const standings = useMemo(() => league ? computeStandings(league.teams) : [], [league])

  if (isLoading) {
    return <WidgetSkeleton variant="list" />;
  }

  if (error || !league) return <ErrorState />

  const standing = standings.find(s => s.team === selectedTeam)
  if (!standing) {
    return <TeamChooser teams={league.matchups.teams} />
  }

  const teamCount = standings.length
  const recent = league.results
    .filter(r => r.team === selectedTeam)
    .sort((a, b) => b.period - a.period)
    .slice(0, RECENT_PERIODS)
  const opponents = opponentsByWinRate(league, selectedTeam)
  const easiest = opponents.slice(0, OPPONENTS_SHOWN)
  const toughest = opponents.slice(-OPPONENTS_SHOWN).reverse()

  return (
    <div className="w-full space-y-4">
      {/* Hero */}
      <Card>
        <CardContent className="flex items-center gap-4 p-4 sm:p-6">
          <TeamLogo key={selectedTeam} teamName={selectedTeam} size={64} className="shrink-0" />
          <div className="min-w-0">
            <div className="truncate text-xl font-bold sm:text-2xl">{selectedTeam}</div>
            <div className="text-muted-foreground">
              <span className="text-lg font-semibold text-foreground tabular-nums">
                {formatRecord(standing.wins, standing.losses)}
              </span>
              {' · '}{ordinal(standing.rank)} of {teamCount}
            </div>
          </div>
        </CardContent>
      </Card>

      <LatestPeriod league={league} team={selectedTeam} onOpenRecap={onOpenRecap} />

      {/* Stat tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="All-play record"
          value={formatRecord(standing.all_play_wins, standing.all_play_losses)}
          detail={`${formatPct(standing.all_play_pct)}, ${ordinal(standing.all_play_rank)} of ${teamCount}, as if playing every team every period`}
        />
        <StatTile
          label="Luck"
          value={`${formatLuck(standing.luck)} wins`}
          detail={luckSentence(standing.luck)}
          className={luckColor(standing.luck)}
        />
        <StatTile
          label="Points for"
          value={formatPoints(standing.points_for)}
          detail={`${ordinal(standing.points_for_rank)} most in the league`}
        />
        <StatTile
          label="Points against"
          value={formatPoints(standing.points_against)}
          detail={`${ordinal(standing.points_against_rank)} most in the league`}
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      {/* Recent periods */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent periods</CardTitle>
          <CardDescription>&ldquo;Beat&rdquo; counts the teams its score would have beaten that period.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {recent.map(r => {
              const others = r.all_play_wins + r.all_play_losses
              return (
                <li key={r.period} className="flex items-center gap-3 py-2 text-sm">
                  <span className="w-8 shrink-0 text-muted-foreground tabular-nums">P{r.period}</span>
                  <ResultBadge win={r.win} />
                  <div className="min-w-0 flex-1">
                    <div className="tabular-nums">
                      {r.score.toFixed(1)}–{r.opp_score.toFixed(1)}
                    </div>
                    <div className="truncate text-muted-foreground">vs {r.opponent}</div>
                  </div>
                  <span className="shrink-0 text-right text-muted-foreground tabular-nums">
                    Beat {formatCount(r.all_play_wins)} of {others}
                  </span>
                </li>
              )
            })}
          </ul>
        </CardContent>
      </Card>

      {/* Opponents */}
      {opponents.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
          {[
            { title: 'Easiest opponents', list: easiest },
            { title: 'Toughest opponents', list: toughest },
          ].map(({ title, list }) => (
            <Card key={title}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">{title}</CardTitle>
                <CardDescription>Share of periods it outscored them</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {list.map(({ opponent, rate }) => (
                    <li key={opponent} className="flex items-center gap-2 text-sm">
                      <TeamLogo teamName={opponent} size={24} className="shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{opponent}</span>
                      <span className="font-semibold tabular-nums">{Math.round(rate * 100)}%</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      </div>
    </div>
  )
}
