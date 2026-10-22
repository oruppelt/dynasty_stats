import { NivoScheduleHeatMap } from './NivoScheduleHeatMap'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { WidgetSkeleton } from './WidgetSkeleton'
import { useLeagueData } from '@/lib/league-data'

interface ScheduleStrengthWidgetProps {
  selectedTeam: string;
}

export function ScheduleStrengthWidget({ selectedTeam }: ScheduleStrengthWidgetProps) {
  const { data: league, isLoading, error } = useLeagueData()
  const data = league?.schedule_strength

  if (isLoading) {
    return <WidgetSkeleton variant="heatmap" />;
  }

  if (error) {
    return (
      <Card className="w-full">
        <CardContent className="flex justify-center items-center p-8">
          <div className="text-destructive bg-destructive/10 p-4 rounded-lg">
            Error loading schedule strength data: {String(error)}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data?.matrix) {
    return (
      <Card className="w-full">
        <CardContent className="flex justify-center items-center p-8">
          <div className="text-muted-foreground">No schedule strength data available</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Schedule Strength Analysis</CardTitle>
        <CardDescription>
          Visualization of opponent difficulty throughout the season. Darker colors indicate tougher matchups.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <NivoScheduleHeatMap
          teams={data.teams}
          matrix={data.matrix}
          maxValue={1.5}
          minValue={-1.5}
          selectedTeam={selectedTeam}
        />
      </CardContent>
    </Card>
  )
}

