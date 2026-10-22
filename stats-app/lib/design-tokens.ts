/**
 * Design Tokens - Centralized color system for the NBA Fantasy Stats Dashboard
 *
 * This file defines all design tokens used throughout the application.
 * Use these tokens instead of hard-coded colors for consistency and maintainability.
 */

export const DESIGN_TOKENS = {
  /**
   * Performance tier colors for team strength indicators
   * Used in: TeamStrengthWidget
   */
  performance: {
    elite: { hsl: 'hsl(142, 71%, 45%)', hex: '#16a34a', label: 'Elite' },
    strong: { hsl: 'hsl(221, 83%, 53%)', hex: '#3b82f6', label: 'Strong' },
    average: { hsl: 'hsl(45, 93%, 47%)', hex: '#eab308', label: 'Average' },
    belowAverage: { hsl: 'hsl(25, 95%, 53%)', hex: '#f97316', label: 'Below Average' },
    weak: { hsl: 'hsl(0, 72%, 51%)', hex: '#ef4444', label: 'Weak' },
  },

  /**
   * Schedule luck categories
   * Used in: ScheduleLuckWidget, BidirectionalBar
   */
  luck: {
    veryLucky: { hsl: 'hsl(142, 71%, 45%)', hex: '#16a34a', label: 'Very Lucky' },
    lucky: { hsl: 'hsl(142, 76%, 36%)', hex: '#15803d', label: 'Lucky' },
    neutral: { hsl: 'hsl(220, 9%, 46%)', hex: '#6b7280', label: 'Average Luck' },
    unlucky: { hsl: 'hsl(0, 91%, 71%)', hex: '#fca5a5', label: 'Unlucky' },
    veryUnlucky: { hsl: 'hsl(0, 72%, 51%)', hex: '#ef4444', label: 'Very Unlucky' },
  },

  /**
   * Ranking medal colors with gradient support
   * Used in: ModernRankingCard
   */
  ranking: {
    gold: { hsl: 'hsl(45, 93%, 47%)', hex: '#eab308', label: 'Gold' },
    silver: { hsl: 'hsl(220, 9%, 46%)', hex: '#6b7280', label: 'Silver' },
    bronze: { hsl: 'hsl(25, 95%, 53%)', hex: '#f97316', label: 'Bronze' },
  },

  /**
   * Quadrant colors for points for/against analysis
   * Used in: PointsWidget
   */
  quadrants: {
    excellent: { hex: '#10b981' },   // Green - High scoring, low opponent scoring (best)
    volatile: { hex: '#f59e0b' },    // Yellow - High scoring, high opponent scoring
    defensive: { hex: '#3b82f6' },   // Blue - Low scoring, low opponent scoring
    concerning: { hex: '#ef4444' },  // Red - Low scoring, high opponent scoring (worst)
    unknown: { hex: '#6b7280' },     // Gray - Unknown/Average
  },

  /**
   * Heatmap gradient colors (red → yellow → green)
   * Used in: NivoHeatMap, StrengthHeatMap
   */
  heatmap: {
    colors: ['#fef2f2', '#fecaca', '#fde047', '#86efac', '#22c55e'],
    // Represents: 0-20% → 20-40% → 40-60% → 60-80% → 80-100%
  },
} as const;

// Type exports for type-safe usage
export type PerformanceLevel = keyof typeof DESIGN_TOKENS.performance;
export type LuckLevel = keyof typeof DESIGN_TOKENS.luck;
export type RankingMedal = keyof typeof DESIGN_TOKENS.ranking;
export type QuadrantType = keyof typeof DESIGN_TOKENS.quadrants;
