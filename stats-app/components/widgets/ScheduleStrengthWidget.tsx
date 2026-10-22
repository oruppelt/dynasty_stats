import { useQuery } from '@tanstack/react-query'
import { useLogger } from '@/lib/logger'
import { useEffect } from 'react'
import { NivoScheduleHeatMap } from './NivoScheduleHeatMap'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { WidgetSkeleton } from './WidgetSkeleton'

interface StrengthData {
  teams: string[];
  matrix: {
    'Team1 ': string;
    Strength: number;
    Rank: number;
    [key: string]: number | string;
  }[];
  matrix_wins: {
    'Team1 ': string;
    [key: string]: number | string;
  }[];
}

interface ScheduleStrengthWidgetProps {
  selectedTeam: string;
}

export function ScheduleStrengthWidget({ selectedTeam }: ScheduleStrengthWidgetProps) {
  const logger = useLogger('ScheduleStrengthWidget');
  
  useEffect(() => {
    logger.info('ScheduleStrengthWidget mounted', { selectedTeam });
    return () => logger.info('ScheduleStrengthWidget unmounted');
  }, [logger, selectedTeam]);

  const { data, isLoading, error } = useQuery<StrengthData>({
    queryKey: ['schedule_strength'],
    queryFn: async () => {
      logger.info('Fetching schedule strength data');
      const response = await fetch('/api/schedule_strength')
      if (!response.ok) {
        const errorMsg = `HTTP ${response.status}: ${response.statusText}`;
        logger.error('Failed to fetch schedule strength data', { status: response.status, statusText: response.statusText });
        throw new Error(errorMsg);
      }
      const data = await response.json()
      if (!data.matrix) {
        logger.error('No matrix data in schedule strength response');
        throw new Error('No matrix data in response')
      }
      logger.info('Schedule strength data received', { 
        teamsCount: data?.teams?.length, 
        matrixCount: data?.matrix?.length 
      });
      return data
    }
  })

  if (isLoading) {
    logger.info('Loading schedule strength data');
    return <WidgetSkeleton variant="heatmap" />;
  }

  if (error) {
    logger.error('Error loading schedule strength data', undefined, error as Error);
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
    logger.warn('No schedule strength matrix data available');
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

