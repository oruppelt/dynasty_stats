import { ResponsiveHeatMap } from '@nivo/heatmap'
import { useMemo } from 'react'
import { useChartTheme } from '@/lib/chart-theme'
import type { MatrixRow } from '@/lib/league-data'

interface NivoScheduleHeatMapProps {
  teams: string[];
  matrix: MatrixRow[];
  maxValue: number;
  minValue: number;
  selectedTeam?: string;
}

interface HeatMapData {
  id: string;
  data: Array<{
    x: string;
    y: number | null;
    isNoData?: boolean;
  }>;
}

export function NivoScheduleHeatMap({ 
  teams, 
  matrix, 
  maxValue, 
  minValue, 
  selectedTeam 
}: NivoScheduleHeatMapProps) {
  const { colors: chartColors, nivoTheme } = useChartTheme();

  // Transform data for Nivo format
  const heatmapData: HeatMapData[] = useMemo(() => {
    if (!matrix || !teams) return [];
    
    return matrix.map((row) => {
      const teamName = row.Team;
      
      const rowData = teams.map(team => {
        const value = row[team] as number;
        
        return {
          x: team,
          y: value === -1 ? null : Number(value.toFixed(2)), // Round at source and convert back to number
          isNoData: value === -1
        };
      });

      return {
        id: teamName,
        data: rowData
      };
    });
  }, [matrix, teams]);

  // Get strength category for interpretation (negative = harder, positive = easier)
  const getStrengthCategory = (value: number | null) => {
    if (value === null) return { label: 'No Data', emoji: '⚪', desc: 'No schedule data available' };
    if (value <= -1.0) return { label: 'Very Hard', emoji: '🔴', desc: 'Much harder than average' };
    if (value <= -0.5) return { label: 'Hard', emoji: '🔴', desc: 'Harder than average' };
    if (value < 0.5 && value > -0.5) return { label: 'Average', emoji: '🟡', desc: 'Close to league average' };
    if (value <= 1.0) return { label: 'Easy', emoji: '🟢', desc: 'Easier than average' };
    return { label: 'Very Easy', emoji: '🟢', desc: 'Much easier than average' };
  };

  if (!matrix || !teams) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">No schedule strength data available</div>
      </div>
    );
  }

  return (
    <div className="w-full h-[600px]">
      <ResponsiveHeatMap
        data={heatmapData}
        margin={{ top: 120, right: 90, bottom: 60, left: 160 }}
        
        // Red-to-green color scheme for schedule strength (red = harder, green = easier)
        colors={(cell) => {
          const value = cell.data.y as number | null;
          if (value === null) return chartColors.emptyCell;
          
          // Map value from -1.5 to +1.5 range to 0-1 scale
          const normalized = (value - minValue) / (maxValue - minValue);
          
          // Create red-to-green gradient manually
          if (normalized <= 0.5) {
            // Red to yellow (harder to average)
            const intensity = normalized * 2; // 0 to 1
            const red = 220;
            const green = Math.round(intensity * 220);
            return `rgb(${red}, ${green}, 0)`;
          } else {
            // Yellow to green (average to easier)
            const intensity = (normalized - 0.5) * 2; // 0 to 1
            const red = Math.round(220 * (1 - intensity));
            const green = 220;
            return `rgb(${red}, ${green}, 0)`;
          }
        }}
        emptyColor={chartColors.emptyCell}
        theme={nivoTheme}
        
        // Cell styling
        borderColor={chartColors.cellBorder}
        borderWidth={1}
        
        // Vertical column headers
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
        
        // Interactive features
        isInteractive={true}
        
        // Custom tooltip
        tooltip={({ cell }) => {
          const team1 = cell.serieId;
          const team2 = cell.data.x;
          const value = cell.data.y as number | null;
          
          // Value is already rounded at source, just use it directly
          const roundedValue = value;
          const category = getStrengthCategory(roundedValue);
          
          if (roundedValue === null) {
            return (
              <div className="bg-card border border-border p-3 rounded-lg shadow-lg w-max max-w-xs">
                <div className="font-semibold text-card-foreground">{team1} vs {team2}</div>
                <div className="text-muted-foreground text-sm">No schedule data</div>
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
                  <span className="text-muted-foreground">Schedule Strength:</span>
                  <span className="font-semibold text-primary">{roundedValue.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2 mt-3 p-2 bg-muted rounded">
                  <span className="text-lg">{category.emoji}</span>
                  <div>
                    <div className="font-semibold text-xs">{category.label}</div>
                    <div className="text-xs text-muted-foreground">{category.desc}</div>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground mt-2 border-t border-border pt-2">
                  {roundedValue > 0 ? 'Positive = Easier schedule' : roundedValue < 0 ? 'Negative = Harder schedule' : 'Zero = Average schedule'}
                </div>
              </div>
            </div>
          );
        }}
        
        // Animation
        animate={true}
        motionConfig="gentle"
        
        // Legend
        legends={[
          {
            anchor: 'bottom',
            translateX: 0,
            translateY: 30,
            length: 400,
            thickness: 8,
            direction: 'row',
            tickPosition: 'after',
            tickSize: 3,
            tickSpacing: 4,
            tickOverlap: false,
            tickFormat: (value) => `${(value as number).toFixed(1)}`,
            title: 'Schedule Strength (Negative = Harder, Positive = Easier)',
            titleAlign: 'start',
            titleOffset: 4
          }
        ]}
      />
      
    </div>
  );
}