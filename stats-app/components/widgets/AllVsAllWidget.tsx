import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { WidgetSkeleton } from './WidgetSkeleton'
import { ErrorState } from './ErrorState'
import { Explainer } from './Explainer'
import { HeatmapScale, MatrixHeatmap } from './MatrixHeatmap'
import { MatrixRow, useLeagueData } from '@/lib/league-data'
import { formatRecord } from '@/lib/standings'

const SCALE: HeatmapScale = {
  edges: [0.2, 0.35, 0.45, 0.55, 0.65, 0.8],
  edgeLabels: ['20%', '35%', '45%', '55%', '65%', '80%'],
  lowCaption: 'Row team rarely outscores them',
  highCaption: 'Row team usually does',
}

const percent = (rate: number) => `${Math.round(rate * 100)}%`

/** Actual record against an opponent, e.g. "1-0", or "Not played" */
function headToHead(winsRows: MatrixRow[], gamesRows: MatrixRow[], team: string, opponent: string) {
  const wins = winsRows.find(r => r.Team === team)?.[opponent]
  const games = gamesRows.find(r => r.Team === team)?.[opponent]
  if (typeof wins !== 'number' || typeof games !== 'number' || games === 0) return 'Not played'
  return formatRecord(wins, games - wins)
}

interface AllVsAllWidgetProps {
  selectedTeam: string;
}

export function AllVsAllWidget({ selectedTeam }: AllVsAllWidgetProps) {
  const { data: league, isLoading, error } = useLeagueData()

  if (isLoading) return <WidgetSkeleton variant="heatmap" />
  if (error || !league) return <ErrorState />

  const { teams, all_play, wins, games } = league.matchups

  return (
    <Card className="w-full">
      <CardHeader className="space-y-2">
        <CardTitle>Head-to-head by score</CardTitle>
        <CardDescription>
          How often each team (row) outscored each other team (column) in the same period.
        </CardDescription>
        <Explainer>
          <p>
            This compares scores only, as if every team played every other team every period. It shows
            who has really been stronger, whether or not the two have actually met.
          </p>
          <p>
            Blue: the row team usually outscores them. Orange: it rarely does. Hover (or tap) a cell for
            the actual head-to-head record.
          </p>
        </Explainer>
      </CardHeader>
      <CardContent>
        <MatrixHeatmap
          teams={teams}
          matrix={all_play}
          selectedTeam={selectedTeam}
          scale={SCALE}
          formatCell={rate => String(Math.round(rate * 100))}
          formatValue={percent}
          minLabelWidth={22}
          listTitle={team => `How often ${team} outscored each team`}
          detail={(team, opponent) => `Head-to-head: ${headToHead(wins, games, team, opponent)}`}
          tooltip={(team, opponent, rate) => (
            <>
              <div className="font-semibold">{team} vs {opponent}</div>
              <div className="mt-1 text-muted-foreground">
                Outscored them in <span className="font-semibold text-foreground">{percent(rate)}</span> of periods
              </div>
              <div className="text-muted-foreground">
                Head-to-head: <span className="font-semibold text-foreground">{headToHead(wins, games, team, opponent)}</span>
              </div>
            </>
          )}
        />
      </CardContent>
    </Card>
  )
}
