/**
 * Chart Theme - theme-aware colors for chart libraries (chart.js, nivo)
 *
 * Chart libraries draw to canvas/SVG and can't read Tailwind CSS variables,
 * so they need concrete color strings that follow the current light/dark theme.
 */

import { useTheme } from 'next-themes'

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
      }
    : {
        text: '#0f172a',
        mutedText: '#64748b',
        grid: 'rgba(15, 23, 42, 0.08)',
        referenceLine: 'rgba(15, 23, 42, 0.7)',
        cellBorder: '#ffffff',
        emptyCell: '#f3f4f6',
      }

  // Nivo theme: axis tick labels and legend text follow the app theme
  const nivoTheme = {
    text: { fill: colors.text },
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

  return { isDark, colors, nivoTheme }
}
