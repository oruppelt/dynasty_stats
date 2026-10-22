/**
 * NBA Team Colors - Official brand colors for all 30 NBA teams
 *
 * These colors are based on official NBA team branding.
 * Primary color is used for main branding elements (logos, backgrounds)
 * Secondary color is used for accents and highlights
 *
 * Source: TeamColorCodes.com and official NBA brand guidelines
 */

export const NBA_TEAM_COLORS = {
  'Atlanta Hawks': { primary: '#E03A3E', secondary: '#C1D32F' },
  'Boston Celtics': { primary: '#007A33', secondary: '#BA9653' },
  'Brooklyn Nets': { primary: '#000000', secondary: '#FFFFFF' },
  'Charlotte Hornets': { primary: '#1D1160', secondary: '#00788C' },
  'Chicago Bulls': { primary: '#CE1141', secondary: '#000000' },
  'Cleveland Cavaliers': { primary: '#860038', secondary: '#FDBB30' },
  'Dallas Mavericks': { primary: '#00538C', secondary: '#002B5E' },
  'Denver Nuggets': { primary: '#0E2240', secondary: '#FEC524' },
  'Detroit Pistons': { primary: '#C8102E', secondary: '#1D42BA' },
  'Golden State Warriors': { primary: '#1D428A', secondary: '#FFC72C' },
  'Houston Rockets': { primary: '#CE1141', secondary: '#000000' },
  'Indiana Pacers': { primary: '#002D62', secondary: '#FDBB30' },
  'LA Clippers': { primary: '#C8102E', secondary: '#1D428A' },
  'Los Angeles Lakers': { primary: '#552583', secondary: '#FDB927' },
  'Memphis Grizzlies': { primary: '#5D76A9', secondary: '#12173F' },
  'Miami Heat': { primary: '#98002E', secondary: '#F9A01B' },
  'Milwaukee Bucks': { primary: '#00471B', secondary: '#EEE1C6' },
  'Minnesota Timberwolves': { primary: '#0C2340', secondary: '#236192' },
  'New Orleans Pelicans': { primary: '#0C2340', secondary: '#C8102E' },
  'New York Knicks': { primary: '#006BB6', secondary: '#F58426' },
  'Oklahoma City Thunder': { primary: '#007AC1', secondary: '#EF3B24' },
  'Orlando Magic': { primary: '#0077C0', secondary: '#C4CED4' },
  'Philadelphia 76ers': { primary: '#006BB6', secondary: '#ED174C' },
  'Phoenix Suns': { primary: '#1D1160', secondary: '#E56020' },
  'Portland Trail Blazers': { primary: '#E03A3E', secondary: '#000000' },
  'Sacramento Kings': { primary: '#5A2D81', secondary: '#63727A' },
  'San Antonio Spurs': { primary: '#C4CED4', secondary: '#000000' },
  'Toronto Raptors': { primary: '#CE1141', secondary: '#000000' },
  'Utah Jazz': { primary: '#002B5C', secondary: '#00471B' },
  'Washington Wizards': { primary: '#002B5C', secondary: '#E31837' },
} as const;

export type NBATeamName = keyof typeof NBA_TEAM_COLORS;

/**
 * Get team colors for a given team name
 * Falls back to hash-based color generation if team is not in the official mapping
 *
 * @param teamName - The name of the team
 * @returns Object with primary and secondary colors
 */
export function getTeamColor(teamName: string): { primary: string; secondary: string } {
  // Check if team exists in official NBA colors
  if (teamName in NBA_TEAM_COLORS) {
    return NBA_TEAM_COLORS[teamName as NBATeamName];
  }

  // Fallback: Generate consistent colors using hash function
  // This ensures the same team name always gets the same color
  let hash = 0;
  for (let i = 0; i < teamName.length; i++) {
    hash = teamName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;

  return {
    primary: `hsl(${hue}, 70%, 45%)`,
    secondary: `hsl(${(hue + 30) % 360}, 70%, 60%)`,
  };
}

/**
 * Get a list of all NBA team names
 */
export function getAllTeamNames(): NBATeamName[] {
  return Object.keys(NBA_TEAM_COLORS) as NBATeamName[];
}

/**
 * Check if a team name is an official NBA team
 */
export function isNBATeam(teamName: string): teamName is NBATeamName {
  return teamName in NBA_TEAM_COLORS;
}
