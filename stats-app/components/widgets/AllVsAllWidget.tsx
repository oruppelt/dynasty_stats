import { NivoHeatMap } from './NivoHeatMap'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { WidgetSkeleton } from './WidgetSkeleton'
import { useLeagueData } from '@/lib/league-data'

interface AllVsAllWidgetProps {
  selectedTeam: string;
}

export function AllVsAllWidget({ selectedTeam }: AllVsAllWidgetProps) {
  const { data: league, isLoading, error } = useLeagueData()
  const data = league?.strength

  if (isLoading) {
    return <WidgetSkeleton variant="heatmap" />;
  }

  if (error) {
    return (
      <Card className="w-full">
        <CardContent className="flex items-center justify-center p-8">
          <div className="text-destructive bg-destructive/10 p-4 rounded-lg">
            Error loading heatmap data
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data?.matrix) {
    return (
      <Card className="w-full">
        <CardContent className="flex items-center justify-center p-8">
          <div className="text-muted-foreground">No heatmap data available</div>
        </CardContent>
      </Card>
    );
  }

  const maxWinRate = data.metadata.maxWinRate
  const minWinRate = data.metadata.minWinRate

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Team Win Rates - All vs All</CardTitle>
        <CardDescription>
          Head-to-head win rate matrix showing how each team performs against every other team
        </CardDescription>
      </CardHeader>
      <CardContent>
        <NivoHeatMap
          teams={data.teams}
          matrix={data.matrix}
          matrix_wins={data.matrix_wins}
          matrix_games={data.matrix_games}
          maxValue={maxWinRate}
          minValue={minWinRate}
          selectedTeam={selectedTeam}
        />
      </CardContent>
    </Card>
  )
}

