/**
 * Chart Theme - theme-aware colors for the charts (nivo)
 *
 * Chart libraries draw to canvas/SVG and can't read Tailwind CSS variables,
 * so they need concrete color strings that follow the current light/dark theme.
 */

import { useTheme } from 'next-themes'

/**
 * Diverging scale for the heatmaps, low → high: orange (bad for the row team),
 * neutral middle, blue (good). Orange/blue stays distinguishable with the
 * common kinds of color blindness, unlike red/green. Seven steps, so each color
 * maps to a legend class people can read off.
 */
const DIVERGING_LIGHT = ['#c2410c', '#fb923c', '#fed7aa', '#f1f5f9', '#bfdbfe', '#60a5fa', '#1d4ed8']
// On a dark background the extremes are the brightest, the middle fades into the card
const DIVERGING_DARK = ['#f97316', '#a3410f', '#47210f', '#1e293b', '#1a2b55', '#2a52be', '#60a5fa']

/** Black or white, whichever reads better on the given hex background. */
export function textOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.18 ? '#0f172a' : '#ffffff'
}

export function useChartTheme() {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const colors = isDark
    ? {
        text: '#e2e8f0',
        mutedText: '#94a3b8',
        grid: 'rgba(148, 163, 184, 0.15)',
        referenceLine: 'rgba(226, 232, 240, 0.7)',
        cellBorder: '#030712',
        emptyCell: '#1f2937',
        selection: '#f8fafc',
      }
    : {
        text: '#0f172a',
        mutedText: '#64748b',
        grid: 'rgba(15, 23, 42, 0.08)',
        referenceLine: 'rgba(15, 23, 42, 0.7)',
        cellBorder: '#ffffff',
        emptyCell: '#f3f4f6',
        selection: '#0f172a',
      }

  // Nivo theme: axis tick labels and legend text follow the app theme
  const nivoTheme = {
    text: { fill: colors.text },
    grid: { line: { stroke: colors.grid } },
    axis: {
      ticks: {
        line: { stroke: colors.mutedText },
        text: { fill: colors.text },
      },
    },
    legends: {
      title: { text: { fill: colors.text } },
      text: { fill: colors.text },
      ticks: { text: { fill: colors.mutedText } },
    },
  }

  return { isDark, colors, nivoTheme, diverging: isDark ? DIVERGING_DARK : DIVERGING_LIGHT }
}
