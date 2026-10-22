import { Scatter } from 'react-chartjs-2'
import { useQuery } from '@tanstack/react-query'
import { useLogger } from '@/lib/logger'
import { useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { WidgetSkeleton } from './WidgetSkeleton'
import { DESIGN_TOKENS } from '@/lib/design-tokens'
import { useChartTheme } from '@/lib/chart-theme'
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  ScatterDataPoint,
  ChartOptions,
  TooltipModel,
  TooltipItem,
  ChartData
} from 'chart.js'

ChartJS.register(
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
)

// Define the data structure from the API
interface TeamScore {
  Team: string;
  'Scored For': number;
  'Scored Against': number;
}

interface PointsData {
  df_scores: TeamScore[];
}

interface PointsWidgetProps {
  selectedTeam?: string;
}

// Define custom types for the chart
interface CustomDataPoint extends ScatterDataPoint {
  team?: string;
}

// Create a specific type for the scatter dataset
type ScatterChartData = ChartData<'scatter', CustomDataPoint[], unknown>;

// Logo images are reused across renders instead of re-created each time
const logoCache = new Map<string, HTMLImageElement>();
const getLogoImage = (team: string) => {
  const name = team.trim();
  let img = logoCache.get(name);
  if (!img) {
    img = new Image(40, 40);
    img.src = `/logos/${name}.png`;
    logoCache.set(name, img);
  }
  return img;
};

export function PointsWidget({ selectedTeam }: PointsWidgetProps = {}) {
  const logger = useLogger('PointsWidget');
  const { colors: chartColors } = useChartTheme();
  useEffect(() => {
    logger.info('PointsWidget mounted', { selectedTeam });
    return () => logger.info('PointsWidget unmounted');
  }, [logger, selectedTeam]);

  const { data, isLoading, error } = useQuery<PointsData>({
    queryKey: ['points'],
    queryFn: async () => {
      logger.info('Fetching points data');
      const response = await fetch('/api/for_against');
      if (!response.ok) {
        const errorMsg = `HTTP ${response.status}: ${response.statusText}`;
        logger.error('Failed to fetch points data', { status: response.status, statusText: response.statusText });
        throw new Error(errorMsg);
      }
      const data = await response.json();
      logger.info('Points data received', { 
        teamsCount: data?.df_scores?.length 
      });
      return data;
    }
  })

  const calculateMedian = (arr: number[]): number => {
    const sorted = [...arr].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid]
  }

  const getQuadrant = (pointsFor: number, pointsAgainst: number, midFor: number, midAgainst: number) => {
    if (pointsFor >= midFor && pointsAgainst <= midAgainst) return 'excellent'; // High scoring, low points against
    if (pointsFor >= midFor && pointsAgainst > midAgainst) return 'volatile';   // High scoring, high points against
    if (pointsFor < midFor && pointsAgainst <= midAgainst) return 'defensive';  // Low scoring, low points against
    if (pointsFor < midFor && pointsAgainst > midAgainst) return 'concerning';  // Low scoring, high points against
    return 'unknown';
  };

  const getQuadrantColor = (quadrant: string) => {
    return DESIGN_TOKENS.quadrants[quadrant as keyof typeof DESIGN_TOKENS.quadrants]?.hex || DESIGN_TOKENS.quadrants.unknown.hex;
  };

  if (isLoading) {
    logger.info('Loading points data');
    return <WidgetSkeleton variant="scatter" />;
  }

  if (error) {
    logger.error('Error loading points data', undefined, error as Error);
    return (
      <Card className="w-full">
        <CardContent className="flex justify-center items-center p-8">
          <div className="text-destructive bg-destructive/10 p-4 rounded-lg">
            Error loading points data: {String(error)}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data?.df_scores) {
    logger.warn('No points data available');
    return (
      <Card className="w-full">
        <CardContent className="flex justify-center items-center p-8">
          <div className="text-muted-foreground">No points data available</div>
        </CardContent>
      </Card>
    );
  }

  const scores = data.df_scores
  const medianScoredFor = calculateMedian(scores.map(d => d['Scored For']))
  const medianScoredAgainst = calculateMedian(scores.map(d => d['Scored Against']))

  const chartData: ScatterChartData = {
    datasets: [
      {
        type: 'scatter',
        label: 'Teams',
        data: scores.map(team => ({
          x: team['Scored For'],
          y: team['Scored Against'],
          team: team.Team
        })),
        pointStyle: scores.map(team => getLogoImage(team.Team)),
        pointRadius: selectedTeam ? scores.map(team => team.Team === selectedTeam ? 25 : 20) : 20,
        pointBorderColor: scores.map(team => {
          const quadrant = getQuadrant(team['Scored For'], team['Scored Against'], medianScoredFor, medianScoredAgainst);
          return getQuadrantColor(quadrant);
        }),
        pointBorderWidth: selectedTeam ? scores.map(team => team.Team === selectedTeam ? 4 : 2) : 2,
      },
      {
        type: 'scatter',
        label: 'Median Points For',
        data: [
          { x: medianScoredFor, y: Math.min(...scores.map(d => d['Scored Against'])) * 0.9 },
          { x: medianScoredFor, y: Math.max(...scores.map(d => d['Scored Against'])) * 1.1 }
        ],
        borderColor: chartColors.referenceLine,
        borderWidth: 2,
        borderDash: [5, 5],
        pointRadius: 0,
        showLine: true,
      },
      {
        type: 'scatter',
        label: 'Median Points Against',
        data: [
          { x: Math.min(...scores.map(d => d['Scored For'])) * 0.9, y: medianScoredAgainst },
          { x: Math.max(...scores.map(d => d['Scored For'])) * 1.1, y: medianScoredAgainst }
        ],
        borderColor: chartColors.referenceLine,
        borderWidth: 2,
        borderDash: [5, 5],
        pointRadius: 0,
        showLine: true,
      }
    ]
  }

  // Calculate bounds for each axis
  const minX = Math.min(...scores.map(d => d['Scored For'])) * 0.9
  const maxX = Math.max(...scores.map(d => d['Scored For'])) * 1.1
  const minY = Math.min(...scores.map(d => d['Scored Against'])) * 0.9
  const maxY = Math.max(...scores.map(d => d['Scored Against'])) * 1.1

  const options: ChartOptions<'scatter'> = {
    maintainAspectRatio: false,
    scales: {
      x: {
        title: {
          display: true,
          text: 'Points For',
          font: {
            size: 14,
            weight: 'bold'
          },
          color: chartColors.text,
        },
        min: minX,
        max: maxX,
        grid: {
          display: true,
          drawTicks: true,
          color: chartColors.grid,
        },
        ticks: {
          stepSize: 50,
          color: chartColors.mutedText,
        }
      },
      y: {
        title: {
          display: true,
          text: 'Points Against',
          font: {
            size: 14,
            weight: 'bold'
          },
          color: chartColors.text,
        },
        min: minY,
        max: maxY,
        grid: {
          display: true,
          drawTicks: true,
          color: chartColors.grid,
        },
        ticks: {
          stepSize: 50,
          color: chartColors.mutedText,
        }
      }
    },
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        enabled: true,
        position: 'nearest',
        callbacks: {
          label: function(this: TooltipModel<'scatter'>, context: TooltipItem<'scatter'>): string {
            const dataPoint = context.raw as CustomDataPoint;
            if (dataPoint.team) {
              const quadrant = getQuadrant(dataPoint.x as number, dataPoint.y as number, medianScoredFor, medianScoredAgainst);
              const quadrantLabels = {
                excellent: '🟢 Excellent',
                volatile: '🟡 Volatile',
                defensive: '🟡 Defensive',
                concerning: '🔴 Concerning',
                unknown: '⚪ Unknown'
              };
              const quadrantLabel = quadrantLabels[quadrant as keyof typeof quadrantLabels] || quadrantLabels.unknown;
              return `${dataPoint.team} | For: ${dataPoint.x} | Against: ${dataPoint.y} | ${quadrantLabel}`;
            }
            return '';
          }
        }
      },
      title: {
        display: true,
        text: 'Points For vs Points Against Analysis',
        color: chartColors.text,
        font: {
          size: 18,
          weight: 'bold'
        }
      }
    }
  }

  return (
    <div className="w-full space-y-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Points For vs Points Against Analysis</CardTitle>
          <CardDescription>
            Scatter plot showing offensive output vs defensive performance. Green quadrant is ideal (high scoring, low points against).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="w-full h-[600px]">
            <Scatter data={chartData} options={options} />
          </div>
        </CardContent>
      </Card>

      {/* Selected team info panel */}
      {selectedTeam && (
        <Card className="border-primary">
          <CardContent className="p-4">
            <h3 className="font-semibold text-primary mb-2">
              📊 Viewing: {selectedTeam}
            </h3>
            <p className="text-sm text-muted-foreground">
              {selectedTeam} is highlighted with a larger logo and colored border. Hover over any team to see detailed performance analysis.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

