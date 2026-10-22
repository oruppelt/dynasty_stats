import { useQuery } from '@tanstack/react-query'
import { useLogger } from '@/lib/logger'
import { useEffect } from 'react'
import { ModernRankingCard } from './ModernRankingCard'
import { BidirectionalBar } from './BidirectionalBar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { WidgetSkeleton } from './WidgetSkeleton'

interface StrengthData {
  matrix: {
    Team: string;
    Strength: number;
    Rank: number;
    [key: string]: number | string;
  }[];
}

interface ScheduleLuckWidgetProps {
  selectedTeam: string;
}

export function ScheduleLuckWidget({ selectedTeam }: ScheduleLuckWidgetProps) {
  const logger = useLogger('ScheduleLuckWidget');
  
  useEffect(() => {
    logger.info('ScheduleLuckWidget mounted', { selectedTeam });
    return () => logger.info('ScheduleLuckWidget unmounted');
  }, [logger, selectedTeam]);

  const { data, isLoading, error } = useQuery<StrengthData>({
    queryKey: ['schedule_strength'],
    queryFn: async () => {
      logger.info('Fetching schedule luck data');
      const response = await fetch('/data/schedule_strength.json');
      if (!response.ok) {
        const errorMsg = `HTTP ${response.status}: ${response.statusText}`;
        logger.error('Failed to fetch schedule luck data', { status: response.status, statusText: response.statusText });
        throw new Error(errorMsg);
      }
      const data = await response.json();
      logger.info('Schedule luck data received', { 
        teamsCount: data?.matrix?.length 
      });
      return data;
    }
  });

  if (isLoading) {
    logger.info('Loading schedule luck data');
    return <WidgetSkeleton variant="list" />;
  }

  if (error) {
    logger.error('Error loading schedule luck data', undefined, error as Error);
    return (
      <Card className="w-full">
        <CardContent className="flex justify-center items-center p-8">
          <div className="text-destructive bg-destructive/10 p-4 rounded-lg">
            Error loading schedule luck data: {String(error)}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data?.matrix) {
    logger.warn('No schedule luck matrix data available');
    return (
      <Card className="w-full">
        <CardContent className="flex justify-center items-center p-8">
          <div className="text-muted-foreground">No schedule luck data available</div>
        </CardContent>
      </Card>
    );
  }

  const rankingsData = [...data.matrix].sort((a, b) => a.Rank - b.Rank);
  
  const maxStrength = Math.max(...rankingsData.map(team => team.Strength));
  const minStrength = Math.min(...rankingsData.map(team => team.Strength));

  const getLuckCategory = (strength: number) => {
    if (strength <= -1.0) return { label: 'Very Unlucky', color: 'bg-very-unlucky', textColor: 'text-very-unlucky' };
    if (strength <= -0.5) return { label: 'Unlucky', color: 'bg-unlucky', textColor: 'text-unlucky' };
    if (strength < 0.5 && strength > -0.5) return { label: 'Average Luck', color: 'bg-neutral', textColor: 'text-neutral' };
    if (strength <= 1.0) return { label: 'Lucky', color: 'bg-lucky', textColor: 'text-lucky' };
    return { label: 'Very Lucky', color: 'bg-very-lucky', textColor: 'text-very-lucky' };
  };

  const getPercentile = (rank: number, total: number) => {
    const percentile = Math.round(((total - rank + 1) / total) * 100);
    return percentile;
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Schedule Luck Rankings</CardTitle>
          <CardDescription>
            Analysis of schedule favorability. Positive values indicate easier opponents, negative values indicate tougher opponents.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Stats Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold">{rankingsData.length}</div>
                <div className="text-sm text-muted-foreground">Total Teams</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-green-600">
                  {rankingsData.filter(t => t.Strength >= 0.5).length}
                </div>
                <div className="text-sm text-muted-foreground">Lucky+ Teams</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-primary">
                  {rankingsData[0]?.Strength.toFixed(3) || 'N/A'}
                </div>
                <div className="text-sm text-muted-foreground">Best Luck</div>
              </CardContent>
            </Card>
          </div>

          {/* Rankings Cards */}
          <div className="space-y-3">
            {rankingsData.map((team) => {
              const isSelected = team.Team === selectedTeam;
              const category = getLuckCategory(team.Strength);
              const percentile = getPercentile(team.Rank, rankingsData.length);

              return (
                <ModernRankingCard
                  key={team.Team}
                  rank={team.Rank}
                  teamName={team.Team}
                  value={team.Strength}
                  label="Schedule Luck"
                  isSelected={isSelected}
                  onClick={() => {
                    logger.userAction('schedule_luck_card_clicked', {
                      team: team.Team,
                      rank: team.Rank,
                      luck: team.Strength,
                      selectedTeam
                    });
                  }}
                >
                  {/* Bidirectional Bar */}
                  <BidirectionalBar
                    value={team.Strength}
                    minValue={minStrength}
                    maxValue={maxStrength}
                    height={16}
                    className="mt-2"
                  />

                  {/* Category and Percentile */}
                  <div className="flex items-center justify-between mt-2">
                    <span className={`text-sm font-medium px-2 py-1 rounded ${category.textColor} bg-opacity-10`}>
                      {category.label}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {team.Strength >= 0 ? `Top ${100 - percentile + 1}% Lucky` : `Top ${percentile}% Unlucky`}
                    </span>
                  </div>
                </ModernRankingCard>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Selected team info */}
      {selectedTeam && (
        <Card className="border-primary">
          <CardContent className="p-4">
            <h3 className="font-semibold text-primary mb-2">
              🍀 Viewing: {selectedTeam}
            </h3>
            <p className="text-sm text-muted-foreground">
              {selectedTeam} is highlighted above. Schedule Luck shows how favorable their opponents&apos; strength has been.
              Positive values = easier opponents (lucky), negative values = harder opponents (unlucky).
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
} 