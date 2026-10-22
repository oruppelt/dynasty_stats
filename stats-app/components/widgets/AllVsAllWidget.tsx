import { useQuery } from '@tanstack/react-query'
import { NivoHeatMap } from './NivoHeatMap'
import { useLogger } from '@/lib/logger'
import { useEffect } from 'react'
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
  // Number of head-to-head games per pair (absent in older snapshots)
  matrix_games?: {
    'Team1 ': string;
    [key: string]: number | string;
  }[];
  metadata?: {
    maxWinRate: number;
    minWinRate: number;
  };
}

interface AllVsAllWidgetProps {
  selectedTeam: string;
}

export function AllVsAllWidget({ selectedTeam }: AllVsAllWidgetProps) {
  const logger = useLogger('AllVsAllWidget');
  
  useEffect(() => {
    logger.info('AllVsAllWidget mounted', { selectedTeam });
    return () => logger.info('AllVsAllWidget unmounted');
  }, [logger, selectedTeam]);

  const { data, isLoading, error } = useQuery<StrengthData>({
    queryKey: ['strength'],
    queryFn: async () => {
      logger.info('Fetching strength data for heatmap');
      const response = await fetch('/data/strength.json');
      if (!response.ok) {
        const errorMsg = `HTTP ${response.status}: ${response.statusText}`;
        logger.error('Failed to fetch strength data', { status: response.status, statusText: response.statusText });
        throw new Error(errorMsg);
      }
      const data = await response.json();
      logger.info('Strength data received', { 
        teamsCount: data?.teams?.length, 
        matrixCount: data?.matrix?.length 
      });
      return data;
    }
  })

  if (isLoading) {
    logger.info('Loading strength data for heatmap');
    return <WidgetSkeleton variant="heatmap" />;
  }

  if (error) {
    logger.error('Error loading strength data', undefined, error as Error);
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
    logger.warn('No matrix data available for heatmap');
    return (
      <Card className="w-full">
        <CardContent className="flex items-center justify-center p-8">
          <div className="text-muted-foreground">No heatmap data available</div>
        </CardContent>
      </Card>
    );
  }

  // Calculate max and min win rates if metadata is not provided
  const maxWinRate = data.metadata?.maxWinRate ?? 1
  const minWinRate = data.metadata?.minWinRate ?? 0

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

