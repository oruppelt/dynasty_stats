import { useMemo, useState } from 'react'
import { Trophy } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { WidgetSkeleton } from './WidgetSkeleton'
import { TeamLogo } from './TeamLogo'
import { ErrorState } from './ErrorState'
import { Explainer } from './Explainer'
import { PlayoffGame, Playoffs, Series, SwissStanding, useLeagueData } from '@/lib/league-data'
import { SwissResult, bracketOrder, swissResults } from '@/lib/playoffs'
import { formatScore } from '@/lib/season'
import { teamCode } from '@/lib/teams'
import { cn } from '@/lib/utils'

const mine = (selected: string, ...teams: string[]) => !!selected && teams.includes(selected)

function Champion({ playoffs }: { playoffs: Playoffs }) {
  const final = playoffs.knockout.at(-1)?.series[0]
  if (!playoffs.champion || !final) return null
  const i = final.teams.indexOf(playoffs.champion)
  const runnerUp = final.teams[1 - i]
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4 sm:p-6">
        <TeamLogo teamName={playoffs.champion} size={56} className="shrink-0" />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <Trophy className="h-4 w-4 text-rank-gold" />
            Champions
          </div>
          <div className="truncate text-xl font-bold sm:text-2xl">{playoffs.champion}</div>
          <div className="text-sm text-muted-foreground">
            Seed {final.seeds[i]}; beat {runnerUp} {final.wins[i]}–{final.wins[1 - i]} in the final
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function SeriesCard({ series, selectedTeam }: { series: Series; selectedTeam: string }) {
  return (
    <div className={cn('rounded-lg border p-3', mine(selectedTeam, ...series.teams) && 'bg-muted')}>
      {series.teams.map((team, i) => {
        const lost = series.winner !== null && series.winner !== team
        return (
          <div key={team} className={cn('flex items-center gap-2 py-1', lost && 'text-muted-foreground')}>
            <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{series.seeds[i]}</span>
            <TeamLogo teamName={team} size={24} className="shrink-0" />
            <span className={cn('min-w-0 flex-1 truncate', series.winner === team && 'font-semibold')}>{team}</span>
            <span className={cn('text-lg tabular-nums', series.winner === team && 'font-bold')}>{series.wins[i]}</span>
          </div>
        )
      })}
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 border-t pt-1.5 text-xs text-muted-foreground tabular-nums">
        {series.games.map(g => {
          // Scores in the series' team order
          const [a, b] = g.team === series.teams[0] ? [g.score, g.opp_score] : [g.opp_score, g.score]
          return <span key={g.period}>P{g.period}: {formatScore(a)}–{formatScore(b)}</span>
        })}
      </div>
    </div>
  )
}

function Knockout({ playoffs, selectedTeam }: { playoffs: Playoffs; selectedTeam: string }) {
  const rounds = bracketOrder(playoffs)
  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle>Knockout</CardTitle>
        <CardDescription>Best of 3 periods. Seeds are the regular-season ranks.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-4">
          {playoffs.knockout.map((round, r) => (
            <div key={round.round} className="flex flex-col">
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{round.name}</h3>
              {/* Spread out so each series sits level with the two it follows */}
              <div className="flex flex-1 flex-col justify-around gap-3">
                {rounds[r].map(s => <SeriesCard key={s.teams.join('|')} series={s} selectedTeam={selectedTeam} />)}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function ResultChip({ result }: { result: SwissResult }) {
  const label = result.win === 1 ? 'W' : result.win === 0 ? 'L' : 'T'
  return (
    <span
      title={`Round ${result.round}: ${label === 'W' ? 'beat' : label === 'L' ? 'lost to' : 'tied'} ${result.opponent} ${formatScore(result.score)}–${formatScore(result.oppScore)}`}
      className={cn(
        'w-5 shrink-0 rounded text-center text-xs font-bold leading-5 text-white sm:w-6 sm:leading-6',
        label === 'W' ? 'bg-lucky' : label === 'L' ? 'bg-very-unlucky' : 'bg-neutral',
      )}
    >
      {label}
    </span>
  )
}

const STATUS_LABEL: Record<SwissStanding['status'], string> = { through: 'Through', out: 'Out', playing: 'Playing' }

function SwissTable({ playoffs, selectedTeam }: { playoffs: Playoffs; selectedTeam: string }) {
  const results = useMemo(() => swissResults(playoffs), [playoffs])
  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle>Swiss stage</CardTitle>
        <CardDescription>The top 16 play until they have 3 wins (through to the knockout) or 3 losses (out).</CardDescription>
        <Explainer>
          <p>
            Round 1 pairs seed 1 with 16, 2 with 15, and so on. After that, teams with the same record play
            each other, the best seed against the worst. Seeds are the regular-season ranks; they also set the
            knockout bracket, whatever the Swiss record.
          </p>
          <p>Hover (or tap) a result for the opponent and score.</p>
        </Explainer>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <ul>
          {playoffs.swiss.standings.map(t => (
            <li
              key={t.team}
              className={cn(
                'flex items-center gap-1.5 border-b px-1 py-2 text-sm sm:gap-2 sm:px-2',
                mine(selectedTeam, t.team) && 'rounded-md border-transparent bg-muted',
              )}
            >
              <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{t.seed}</span>
              <TeamLogo teamName={t.team} size={24} className="shrink-0" />
              <span className={cn('min-w-0 flex-1 truncate', t.status === 'out' && 'text-muted-foreground')}>
                <span className="sm:hidden">{teamCode(t.team)}</span>
                <span className="hidden sm:inline">{t.team}</span>
              </span>
              {/* One slot per round, so each round lines up down the table */}
              <span className="flex gap-0.5 sm:gap-1">
                {playoffs.swiss.rounds.map(({ round }) => {
                  const result = results.get(t.team)?.find(r => r.round === round)
                  return result ? <ResultChip key={round} result={result} /> : <span key={round} className="w-5 shrink-0 sm:w-6" />
                })}
              </span>
              <span className="w-9 shrink-0 text-right font-semibold tabular-nums">{t.wins}–{t.losses}</span>
              <span
                className={cn(
                  'w-12 shrink-0 text-right text-xs font-medium sm:w-16',
                  t.status === 'through' ? 'text-success' : 'text-muted-foreground',
                )}
              >
                {STATUS_LABEL[t.status]}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function GameRow({ game, selectedTeam }: { game: PlayoffGame; selectedTeam: string }) {
  const sides = [
    { team: game.team, score: game.score, won: game.score > game.opp_score },
    { team: game.opponent, score: game.opp_score, won: game.opp_score > game.score },
  ]
  return (
    <li
      className={cn(
        'space-y-1.5 border-b px-2 py-2 text-sm',
        mine(selectedTeam, game.team, game.opponent) && 'rounded-md border-transparent bg-muted',
      )}
    >
      {sides.map(s => (
        <div key={s.team} className={cn('flex items-center gap-2', !s.won && 'text-muted-foreground')}>
          <TeamLogo teamName={s.team} size={24} className="shrink-0" />
          <span className={cn('min-w-0 flex-1 truncate', s.won && 'font-semibold')}>{s.team}</span>
          <span className={cn('tabular-nums', s.won && 'font-semibold')}>{formatScore(s.score)}</span>
        </div>
      ))}
    </li>
  )
}

function SwissRounds({ playoffs, selectedTeam }: { playoffs: Playoffs; selectedTeam: string }) {
  const rounds = playoffs.swiss.rounds
  const [picked, setPicked] = useState<number | null>(null)
  const round = rounds.find(r => r.round === picked) ?? rounds[rounds.length - 1]
  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle className="text-lg">Swiss games</CardTitle>
          <CardDescription>Round {round.round} was period {round.period}.</CardDescription>
        </div>
        <div className="inline-flex rounded-md bg-muted p-1 text-sm" role="group" aria-label="Swiss round">
          {rounds.map(r => (
            <button
              key={r.round}
              type="button"
              onClick={() => setPicked(r.round)}
              aria-pressed={r.round === round.round}
              className={cn(
                'rounded-sm px-3 py-1 font-medium text-muted-foreground',
                r.round === round.round && 'bg-background text-foreground shadow-xs',
              )}
            >
              {r.round}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <ul className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
          {round.games.map(g => <GameRow key={g.team} game={g} selectedTeam={selectedTeam} />)}
        </ul>
      </CardContent>
    </Card>
  )
}

export function PlayoffsWidget({ selectedTeam }: { selectedTeam: string }) {
  const { data: league, isLoading, error } = useLeagueData()

  if (isLoading) return <WidgetSkeleton variant="list" />
  if (error || !league) return <ErrorState />

  const { playoffs } = league
  if (!playoffs) {
    return (
      <Card>
        <CardHeader className="space-y-2">
          <CardTitle>Playoffs</CardTitle>
          <CardDescription>
            The playoffs start after the regular season. The top 16 play a Swiss stage, then the 8 teams
            through play a knockout, best of 3 periods per round.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="w-full space-y-4">
      <Champion playoffs={playoffs} />
      {playoffs.knockout.length > 0 && <Knockout playoffs={playoffs} selectedTeam={selectedTeam} />}
      <SwissTable playoffs={playoffs} selectedTeam={selectedTeam} />
      <SwissRounds playoffs={playoffs} selectedTeam={selectedTeam} />
    </div>
  )
}
