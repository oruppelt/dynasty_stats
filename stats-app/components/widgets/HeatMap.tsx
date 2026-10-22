/* eslint-disable @typescript-eslint/no-unused-vars */
import * as React from 'react';

interface HeatMapProps {
  teams: string[];
  matrix: Array<{
    'Team1 ': string;
    [key: string]: number | string;
  }>;
  matrix_wins?: Array<{
    'Team1 ': string;
    [key: string]: number | string;
  }>;
  maxValue: number;
  minValue: number;
  selectedTeam?: string;
}

export function HeatMap({ teams, matrix, matrix_wins, maxValue, minValue, selectedTeam }: HeatMapProps) {
  const getColor = (value: number, winValue: number): string => {
    if (winValue === -1) return 'transparent';
    if (winValue === 0) return 'rgb(255, 165, 0)'; // Orange
    if (winValue === 1) return 'rgb(0, 255, 0)'; // Green
    if (winValue === 0.5) return 'rgb(173, 216, 235)'; // Light blue for 0.5
    return 'rgb(255, 200, 0)'; // Yellow for other values
  };

  return (
    <div className="relative">
      {/* Column Headers */}
      <div className="grid" style={{ 
        gridTemplateColumns: `160px repeat(${teams.length}, 35px)`,
        position: 'sticky',
        top: 0,
        backgroundColor: 'white',
        zIndex: 10
      }}>
        <div className="h-32" />
        {teams.map(team => (
          <div 
            key={team}
            className={`h-32 flex items-center justify-center ${
              selectedTeam === team ? 'font-bold text-blue-700 text-base' : 'text-sm'
            }`}
            style={{ 
              writingMode: 'vertical-rl',
              textOrientation: 'mixed',
              transform: 'rotate(180deg)',
              padding: '2px',
              backgroundColor: selectedTeam === team ? 'rgba(59, 130, 246, 0.1)' : 'transparent'
            }}
          >
            {team}
          </div>
        ))}
      </div>

      {/* Grid Content */}
      <div className="grid" style={{ 
        gridTemplateColumns: `160px repeat(${teams.length}, 35px)`
      }}>
        {matrix.map((row, rowIndex) => {
          const isSelectedTeamRow = row['Team1 '] === selectedTeam;
          return (
            <React.Fragment key={row['Team1 ']}>
              {/* Row header */}
              <div 
                className={`h-8 flex items-center justify-end pr-2 whitespace-nowrap ${
                  isSelectedTeamRow ? 'font-bold text-blue-700 text-base' : 'text-sm'
                }`}
                style={{
                  backgroundColor: isSelectedTeamRow ? 'rgba(59, 130, 246, 0.1)' : 'transparent'
                }}
              >
                {row['Team1 ']}
              </div>
              {/* Row cells */}
              {teams.map(team => {
                const value = row[team] as number;
                const winValue = matrix_wins?.[rowIndex]?.[team] as number ?? -1;
                const isSelectedTeamCell = isSelectedTeamRow || team === selectedTeam;
                const cellColor = getColor(value, winValue);
                
                return (
                  <div
                    key={`${row['Team1 ']}-${team}`}
                    className={`h-8 flex items-center justify-center relative ${
                      isSelectedTeamCell ? 'z-10' : 'text-xs'
                    }`}
                    style={{
                      backgroundColor: cellColor,
                      border: '1px solid #eee',
                      boxShadow: isSelectedTeamCell 
                        ? 'inset 0 0 0 2px rgba(59, 130, 246, 0.5)' 
                        : 'none',
                      outline: isSelectedTeamCell 
                        ? '2px solid rgba(59, 130, 246, 0.5)' 
                        : 'none',
                    }}
                    title={`${row['Team1 ']} vs ${team}: ${value === -1 ? '' : value.toFixed(2)}`}
                  >
                    <span className={isSelectedTeamCell 
                      ? 'font-semibold text-blue-700 text-xs' 
                      : 'text-[10px]'
                    }>
                      {value === -1 ? '' : value.toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
} 