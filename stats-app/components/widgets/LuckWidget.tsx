import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { WidgetSkeleton } from './WidgetSkeleton'
import { ErrorState } from './ErrorState'
import { Explainer } from './Explainer'
import { HeatmapScale, MatrixHeatmap } from './MatrixHeatmap'
import { useLeagueData } from '@/lib/league-data'
import { formatCount, formatLuck, formatRecord } from '@/lib/standings'

const SCALE: HeatmapScale = {
  edges: [-1, -0.5, -0.15, 0.15, 0.5, 1],
  edgeLabels: ['−1', '−0.5', '−0.15', '+0.15', '+0.5', '+1'],
  lowCaption: 'Fewer wins than its scores earned',
  highCaption: 'More wins',
}

// Typographic minus, so "−0.5" and "+0.5" line up
const signed = (luck: number) => formatLuck(luck).replace('-', '−')

interface LuckWidgetProps {
  selectedTeam: string;
}

export function LuckWidget({ selectedTeam }: LuckWidgetProps) {
  const { data: league, isLoading, error } = useLeagueData()

  if (isLoading) return <WidgetSkeleton variant="heatmap" />
  if (error || !league) return <ErrorState />

  const { teams, luck: matrix, wins, games, all_play } = league.matchups
  const winsBy = new Map(wins.map(r => [r.Team, r]))
  const gamesBy = new Map(games.map(r => [r.Team, r]))
  const rateBy = new Map(all_play.map(r => [r.Team, r]))

  const meeting = (team: string, opponent: string) => {
    const wins = (winsBy.get(team)?.[opponent] as number | null) ?? 0
    const games = (gamesBy.get(team)?.[opponent] as number | null) ?? 0
    return { wins, games, record: formatRecord(wins, games - wins) }
  }

  return (
    <Card className="w-full">
      <CardHeader className="space-y-2">
        <CardTitle>Luck by opponent</CardTitle>
        <CardDescription>
          Each team (row) against each opponent (column): the games it actually won, minus the wins its scores earned.
        </CardDescription>
        <Explainer>
          <p>
            &ldquo;Earned&rdquo; uses how often the row team outscores that opponent over the whole season.
            Example: a team that outscores an opponent in 65% of periods and played them twice earned
            1.3 wins. If it won both, that&apos;s +0.7 luck; if it lost both, −1.3.
          </p>
          <p>
            Each row adds up to the team&apos;s luck in the standings, and the whole league adds up to zero:
            one team&apos;s good luck is another&apos;s bad luck. Blank cells: the two haven&apos;t played.
          </p>
        </Explainer>
      </CardHeader>
      <CardContent>
        <MatrixHeatmap
          teams={teams}
          matrix={matrix}
          selectedTeam={selectedTeam}
          scale={SCALE}
          formatCell={luck => signed(luck)}
          formatValue={luck => signed(luck)}
          minLabelWidth={30}
          listTitle={team => `${team}: luck against each opponent`}
          detail={(team, opponent) => {
            const { record, wins } = meeting(team, opponent)
            const luck = matrix.find(r => r.Team === team)?.[opponent] as number
            return `${record}, scores earned ${formatCount(Math.round((wins - luck) * 10) / 10)}`
          }}
          tooltip={(team, opponent, luck) => {
            const { wins, games, record } = meeting(team, opponent)
            const rate = rateBy.get(team)?.[opponent] as number | null
            return (
              <>
                <div className="font-semibold">{team} vs {opponent}</div>
                <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-3 text-muted-foreground">
                  <dt>Head-to-head</dt>
                  <dd className="text-right font-semibold text-foreground tabular-nums">{record}</dd>
                  <dt>Scores earned</dt>
                  <dd className="text-right font-semibold text-foreground tabular-nums">{(wins - luck).toFixed(1)} wins</dd>
                  <dt>Luck</dt>
                  <dd className="text-right font-semibold text-foreground tabular-nums">{signed(luck)}</dd>
                </dl>
                {rate !== null && rate !== undefined && (
                  <div className="mt-2 border-t pt-2 text-xs text-muted-foreground">
                    Outscores them in {Math.round(rate * 100)}% of periods, and they met{' '}
                    {games === 1 ? 'once' : games === 2 ? 'twice' : `${games} times`}.
                  </div>
                )}
              </>
            )
          }}
        />
      </CardContent>
    </Card>
  )
}
