import { ResponsiveHeatMap } from '@nivo/heatmap'
import { useMemo } from 'react'
import { DESIGN_TOKENS } from '@/lib/design-tokens'
import { useChartTheme } from '@/lib/chart-theme'
import type { MatrixRow } from '@/lib/league-data'

interface NivoHeatMapProps {
  teams: string[];
  matrix: MatrixRow[];
  matrix_wins?: MatrixRow[];
  matrix_games?: MatrixRow[];
  maxValue: number;
  minValue: number;
  selectedTeam?: string;
}

interface HeatMapData {
  id: string;
  data: Array<{
    x: string;
    y: number | null;
    winCount?: number | null;
    gameCount?: number | null;
    isNoData?: boolean;
  }>;
}

export function NivoHeatMap({ 
  teams, 
  matrix, 
  matrix_wins, 
  matrix_games,
  maxValue, 
  minValue, 
  selectedTeam 
}: NivoHeatMapProps) {
  const { colors: chartColors, nivoTheme } = useChartTheme();

  // Transform data for Nivo format
  const heatmapData: HeatMapData[] = useMemo(() => {
    // Look up head-to-head rows by team name rather than relying on row order
    const winsByTeam = new Map(matrix_wins?.map(r => [r.Team, r]));
    const gamesByTeam = new Map(matrix_games?.map(r => [r.Team, r]));

    return matrix.map((row) => {
      const teamName = row.Team;
      const winsRow = winsByTeam.get(row.Team);
      const gamesRow = gamesByTeam.get(row.Team);

      const rowData = teams.map(team => {
        const value = row[team] as number;
        const winValue = (winsRow?.[team] as number | undefined) ?? -1;
        const gameValue = gamesRow?.[team] as number | undefined;

        return {
          x: team,
          y: value === -1 ? null : value, // Nivo handles null values gracefully
          winCount: winValue === -1 ? null : winValue,
          gameCount: gameValue ?? null,
          isNoData: value === -1
        };
      });

      return {
        id: teamName,
        data: rowData
      };
    });
  }, [matrix, matrix_wins, matrix_games, teams]);

  // Get win rate category for interpretation
  const getWinRateCategory = (value: number | null) => {
    if (value === null) return { label: 'No Data', emoji: '⚪', desc: 'No matchup data available' };
    if (value >= 0.8) return { label: 'Dominant', emoji: '🟢', desc: 'Very strong matchup' };
    if (value >= 0.6) return { label: 'Favorable', emoji: '🟢', desc: 'Good win rate' };
    if (value >= 0.4) return { label: 'Competitive', emoji: '🟡', desc: 'Close matchup' };
    if (value >= 0.2) return { label: 'Unfavorable', emoji: '🔴', desc: 'Losing matchup' };
    return { label: 'Difficult', emoji: '🔴', desc: 'Very tough matchup' };
  };

  // Actual games played between the two teams (win rate above is all-play)
  const formatHeadToHead = (wins: number | null | undefined, games: number | null | undefined) => {
    if (wins === null || wins === undefined || games === 0) return 'Not played yet';
    const fmt = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(1);
    if (games === null || games === undefined) return `${fmt(wins)} ${wins === 1 ? 'win' : 'wins'}`;
    return `${fmt(wins)}-${fmt(games - wins)}`;
  };

  return (
    <div className="w-full h-[650px]">
      <ResponsiveHeatMap
        data={heatmapData}
        margin={{ top: 120, right: 90, bottom: 80, left: 160 }}
        colors={{
          type: 'quantize',
          colors: [...DESIGN_TOKENS.heatmap.colors] // Win rate gradient: red → yellow → green
        }}
        emptyColor={chartColors.emptyCell}
        // Cell colors are light pastels in both themes, so labels stay dark
        labelTextColor="#000000"
        borderColor={chartColors.cellBorder}
        theme={nivoTheme}
        borderWidth={1}
        axisTop={{
          tickSize: 5,
          tickPadding: 5,
          tickRotation: -90,
          legend: '',
          legendOffset: 36
        }}
        axisLeft={{
          tickSize: 5,
          tickPadding: 5,
          tickRotation: 0,
          legend: '',
          legendOffset: -40
        }}
        animate={true}
        motionConfig="gentle"
        isInteractive={true}
        tooltip={({ cell }) => {
          const team1 = cell.serieId;
          const team2 = cell.data.x;
          const winRate = cell.data.y as number | null;
          const { winCount, gameCount } = cell.data as { winCount?: number | null; gameCount?: number | null };
          const category = getWinRateCategory(winRate);

          if (winRate === null) {
            return (
              <div className="bg-card border border-border p-3 rounded-lg shadow-lg w-max max-w-xs">
                <div className="font-semibold text-card-foreground">{team1} vs {team2}</div>
                <div className="text-muted-foreground text-sm">No matchup data</div>
              </div>
            );
          }

          return (
            <div className="bg-card border border-border p-4 rounded-lg shadow-lg w-72">
              <div className="font-bold text-lg mb-2 text-card-foreground">
                {team1} vs {team2}
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Win Rate:</span>
                  <span className="font-semibold text-primary">{(winRate * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Head-to-head:</span>
                  <span className="font-semibold">{formatHeadToHead(winCount, gameCount)}</span>
                </div>
                <div className="flex items-center gap-2 mt-3 p-2 bg-muted rounded">
                  <span className="text-lg">{category.emoji}</span>
                  <div>
                    <div className="font-semibold text-xs">{category.label}</div>
                    <div className="text-xs text-muted-foreground">{category.desc}</div>
                  </div>
                </div>
              </div>
            </div>
          );
        }}
        legends={[
          {
            anchor: 'bottom',
            translateX: 0,
            translateY: 50,
            length: 400,
            thickness: 8,
            direction: 'row',
            tickPosition: 'after',
            tickSize: 3,
            tickSpacing: 4,
            tickOverlap: false,
            tickFormat: (value) => `${((value as number) * 100).toFixed(0)}%`,
            title: 'Win Rate (Red = Low, Green = High)',
            titleAlign: 'start',
            titleOffset: 4
          }
        ]}
      />
    </div>
  );
}