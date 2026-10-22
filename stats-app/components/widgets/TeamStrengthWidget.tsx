import { useQuery } from '@tanstack/react-query'
import { useLogger } from '@/lib/logger'
import { useEffect, useState } from 'react'
import { ModernRankingCard } from './ModernRankingCard'
import { TeamStrengthTable } from './TeamStrengthTable'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { WidgetSkeleton } from './WidgetSkeleton'
import { Button } from '@/components/ui/button'
import { LayoutGrid, Table } from 'lucide-react'

interface StrengthData {
  matrix: {
    'Team1 ': string;
    Strength: number;
    Rank: number;
    [key: string]: number | string;
  }[];
}

interface TeamStrengthWidgetProps {
  selectedTeam: string;
}

export function TeamStrengthWidget({ selectedTeam }: TeamStrengthWidgetProps) {
  const logger = useLogger('TeamStrengthWidget');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  useEffect(() => {
    logger.info('TeamStrengthWidget mounted', { selectedTeam });
    return () => logger.info('TeamStrengthWidget unmounted');
  }, [logger, selectedTeam]);

  const { data, isLoading, error } = useQuery<StrengthData>({
    queryKey: ['strength'],
    queryFn: async () => {
      logger.info('Fetching team strength data');
      const response = await fetch('/api/strength');
      if (!response.ok) {
        const errorMsg = `HTTP ${response.status}: ${response.statusText}`;
        logger.error('Failed to fetch team strength data', { status: response.status, statusText: response.statusText });
        throw new Error(errorMsg);
      }
      const data = await response.json();
      logger.info('Team strength data received', { 
        teamsCount: data?.matrix?.length 
      });
      return data;
    }
  });

  if (isLoading) {
    logger.info('Loading team strength data');
    return <WidgetSkeleton variant="list" />;
  }

  if (error) {
    logger.error('Error loading team strength data', undefined, error as Error);
    return (
      <Card className="w-full">
        <CardContent className="flex justify-center items-center p-8">
          <div className="text-destructive bg-destructive/10 p-4 rounded-lg">
            Error loading team strength data: {String(error)}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data?.matrix) {
    logger.warn('No team strength matrix data available');
    return (
      <Card className="w-full">
        <CardContent className="flex justify-center items-center p-8">
          <div className="text-muted-foreground">No team strength data available</div>
        </CardContent>
      </Card>
    );
  }

  const rankingsData = [...data.matrix].sort((a, b) => a.Rank - b.Rank);

  const getStrengthCategory = (strength: number) => {
    if (strength >= 0.7) return { label: 'Elite', color: 'bg-elite', textColor: 'text-elite' };
    if (strength >= 0.6) return { label: 'Strong', color: 'bg-strong', textColor: 'text-strong' };
    if (strength >= 0.5) return { label: 'Average', color: 'bg-average', textColor: 'text-average' };
    if (strength >= 0.4) return { label: 'Below Average', color: 'bg-below-average', textColor: 'text-below-average' };
    return { label: 'Weak', color: 'bg-weak', textColor: 'text-weak' };
  };

  const getPercentile = (rank: number, total: number) => {
    const percentile = Math.round(((total - rank + 1) / total) * 100);
    return percentile;
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Team Strength Rankings</CardTitle>
              <CardDescription>
                Rankings based on overall win rate strength across all matchups
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant={viewMode === 'cards' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setViewMode('cards');
                  logger.userAction('view_mode_changed', { mode: 'cards' });
                }}
              >
                <LayoutGrid className="h-4 w-4 mr-2" />
                Cards
              </Button>
              <Button
                variant={viewMode === 'table' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setViewMode('table');
                  logger.userAction('view_mode_changed', { mode: 'table' });
                }}
              >
                <Table className="h-4 w-4 mr-2" />
                Table
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {viewMode === 'cards' && (
            <>
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
                      {rankingsData.filter(t => t.Strength >= 0.6).length}
                    </div>
                    <div className="text-sm text-muted-foreground">Strong+ Teams</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold text-primary">
                      {rankingsData[0]?.Strength.toFixed(3) || 'N/A'}
                    </div>
                    <div className="text-sm text-muted-foreground">Best Strength</div>
                  </CardContent>
                </Card>
              </div>

              {/* Rankings Cards */}
              <div className="space-y-3">
            {rankingsData.map((team) => {
              const isSelected = team['Team1 '] === selectedTeam;
              const category = getStrengthCategory(team.Strength);
              const percentile = getPercentile(team.Rank, rankingsData.length);

              return (
                <ModernRankingCard
                  key={team['Team1 ']}
                  rank={team.Rank}
                  teamName={team['Team1 ']}
                  value={team.Strength}
                  label="Win Rate Strength"
                  isSelected={isSelected}
                  onClick={() => {
                    logger.userAction('team_strength_card_clicked', {
                      team: team['Team1 '],
                      rank: team.Rank,
                      strength: team.Strength,
                      selectedTeam
                    });
                  }}
                >
                  {/* Progress Bar */}
                  <div className="flex items-center gap-3">
                    <div className="flex-grow">
                      <div className="h-3 rounded-full bg-muted">
                        <div
                          className={`h-3 rounded-full ${category.color} transition-all duration-300`}
                          style={{ width: `${team.Strength * 100}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-sm font-medium text-muted-foreground min-w-0">
                      {(team.Strength * 100).toFixed(1)}%
                    </div>
                  </div>

                  {/* Category and Percentile */}
                  <div className="flex items-center justify-between mt-2">
                    <span className={`text-sm font-medium px-2 py-1 rounded ${category.textColor} bg-opacity-10`}>
                      {category.label}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      Top {percentile}%
                    </span>
                  </div>
                </ModernRankingCard>
              );
            })}
              </div>
            </>
          )}

          {viewMode === 'table' && (
            <TeamStrengthTable data={data.matrix} />
          )}
        </CardContent>
      </Card>

      {/* Selected team info */}
      {selectedTeam && (
        <Card className="border-primary">
          <CardContent className="p-4">
            <h3 className="font-semibold text-primary mb-2">
              📊 Viewing: {selectedTeam}
            </h3>
            <p className="text-sm text-muted-foreground">
              {selectedTeam} is highlighted above. Win Rate Strength represents the team&apos;s overall performance quality.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
} 