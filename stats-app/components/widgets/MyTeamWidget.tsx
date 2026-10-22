import { useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { WidgetSkeleton } from './WidgetSkeleton'
import { TeamLogo } from './TeamLogo'
import { LeagueData, useLeagueData } from '@/lib/league-data'
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
  const row = league.strength.matrix.find(r => r.Team === team)
  if (!row) return []
  return league.strength.teams
    .filter(opponent => opponent !== team && typeof row[opponent] === 'number' && row[opponent] !== -1)
    .map(opponent => ({ opponent, rate: row[opponent] as number }))
    .sort((a, b) => b.rate - a.rate)
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

export function MyTeamWidget({ selectedTeam }: { selectedTeam: string }) {
  const { data: league, isLoading, error } = useLeagueData()
  const standings = useMemo(() => league ? computeStandings(league.teams) : [], [league])

  if (isLoading) {
    return <WidgetSkeleton variant="list" />;
  }

  if (error || !league) {
    return (
      <Card className="w-full">
        <CardContent className="flex justify-center items-center p-8">
          <div className="text-destructive bg-destructive/10 p-4 rounded-lg">
            Error loading team data: {String(error)}
          </div>
        </CardContent>
      </Card>
    );
  }

  const standing = standings.find(s => s.team === selectedTeam)
  if (!standing) {
    return <TeamChooser teams={league.strength.teams} />
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
    <div className="mx-auto w-full max-w-4xl space-y-4">
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

      {/* Stat tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatTile
          label="All-play record"
          value={`${formatRecord(standing.all_play_wins, standing.all_play_losses)} (${formatPct(standing.all_play_pct)})`}
          detail={`${ordinal(standing.all_play_rank)} of ${teamCount}, as if playing every team every period`}
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

      {/* Recent periods */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent periods</CardTitle>
          <CardDescription>&ldquo;Beat&rdquo; counts the teams its score would have beaten that period.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {recent.map(r => {
              const result = r.win === 1 ? 'W' : r.win === 0 ? 'L' : 'T'
              const others = r.all_play_wins + r.all_play_losses
              return (
                <li key={r.period} className="flex items-center gap-3 py-2 text-sm">
                  <span className="w-8 shrink-0 text-muted-foreground tabular-nums">P{r.period}</span>
                  <span
                    className={cn(
                      'w-6 shrink-0 rounded text-center text-xs font-bold leading-6 text-white',
                      result === 'W' ? 'bg-lucky' : result === 'L' ? 'bg-very-unlucky' : 'bg-neutral',
                    )}
                  >
                    {result}
                  </span>
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
  )
}
