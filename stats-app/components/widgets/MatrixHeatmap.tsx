import { ReactNode, useCallback, useMemo, useState } from 'react'
import { ComputedCell, CustomLayerProps, HeatMap } from '@nivo/heatmap'
import { TeamLogo } from './TeamLogo'
import { cn } from '@/lib/utils'
import { textOn, useChartTheme } from '@/lib/chart-theme'
import type { MatrixRow } from '@/lib/league-data'
import { teamCode } from '@/lib/teams'
import { useElementWidth } from '@/lib/use-element-width'

/** Seven color classes: `edges` are the six boundaries between them, low to high. */
export interface HeatmapScale {
  edges: number[];
  /** Printed under the legend at each edge */
  edgeLabels: string[];
  lowCaption: string;
  highCaption: string;
}

interface MatrixHeatmapProps {
  teams: string[];
  matrix: MatrixRow[];
  selectedTeam: string;
  scale: HeatmapScale;
  /** Compact value inside a grid cell, e.g. "66" */
  formatCell: (value: number) => string;
  /** Value in the phone list, e.g. "66%" */
  formatValue: (value: number) => string;
  /** Narrowest cell (px) that still fits `formatCell`'s text */
  minLabelWidth: number;
  tooltip: (team: string, opponent: string, value: number) => ReactNode;
  /** Second line under the opponent in the phone list */
  detail?: (team: string, opponent: string) => string;
  /** Heading of the phone list, e.g. "How often Memphis outscored each team" */
  listTitle: (team: string) => string;
}

interface Cell {
  x: string;
  y: number | null;
}

// Below this width the grid's cells get too small to read, so phones get a list
const LIST_BELOW = 640
const MARGIN = { top: 40, right: 4, bottom: 4, left: 40 }

function colorClass(value: number, edges: number[]): number {
  return edges.filter(edge => value >= edge).length
}

export function MatrixHeatmap(props: MatrixHeatmapProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const narrow = width > 0 && width < LIST_BELOW
  const [view, setView] = useState<'list' | 'grid'>('list')

  return (
    <div ref={ref} className="w-full">
      {narrow && (
        <div className="mb-3 inline-flex rounded-md bg-muted p-1 text-sm" role="group" aria-label="View">
          {(['list', 'grid'] as const).map(v => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={cn(
                'rounded-sm px-3 py-1 font-medium capitalize text-muted-foreground',
                view === v && 'bg-background text-foreground shadow-sm',
              )}
            >
              {v}
            </button>
          ))}
        </div>
      )}
      {width > 0 && (narrow && view === 'list'
        ? <TeamList {...props} />
        : <Grid {...props} width={width} />)}
      <Legend scale={props.scale} />
    </div>
  )
}

function Grid({
  teams, matrix, selectedTeam, scale, formatCell, minLabelWidth, tooltip, width,
}: MatrixHeatmapProps & { width: number }) {
  const { colors, nivoTheme, diverging } = useChartTheme()

  const data = useMemo(() => {
    const rows = new Map(matrix.map(row => [row.Team, row]))
    return teams.map(team => ({
      id: team,
      data: teams.map(opponent => ({ x: opponent, y: (rows.get(team)?.[opponent] as number | null) ?? null })),
    }))
  }, [teams, matrix])

  const cellSize = (width - MARGIN.left - MARGIN.right) / teams.length
  // Rows are capped below the cell width so all 30 fit on a laptop screen
  const rowHeight = Math.min(cellSize, 24)
  const height = rowHeight * teams.length + MARGIN.top + MARGIN.bottom

  // Outlines the selected team's row and column
  const SelectionLayer = useCallback(({ cells }: CustomLayerProps<Cell>) => {
    if (!selectedTeam) return null
    const outline = (band: ComputedCell<Cell>[], key: string) => {
      if (!band.length) return null
      const x0 = Math.min(...band.map(c => c.x - c.width / 2))
      const y0 = Math.min(...band.map(c => c.y - c.height / 2))
      const x1 = Math.max(...band.map(c => c.x + c.width / 2))
      const y1 = Math.max(...band.map(c => c.y + c.height / 2))
      return <rect key={key} x={x0} y={y0} width={x1 - x0} height={y1 - y0} />
    }
    return (
      <g fill="none" stroke={colors.selection} strokeWidth={2} pointerEvents="none">
        {outline(cells.filter(c => c.serieId === selectedTeam), 'row')}
        {outline(cells.filter(c => c.data.x === selectedTeam), 'column')}
      </g>
    )
  }, [selectedTeam, colors.selection])

  const axis = { tickSize: 0, tickPadding: 4, format: (team: string) => teamCode(team) }

  return (
    <HeatMap<Cell, object>
      data={data}
      width={width}
      height={height}
      margin={MARGIN}
      theme={{
        ...nivoTheme,
        axis: { ...nivoTheme.axis, ticks: { ...nivoTheme.axis.ticks, text: { ...nivoTheme.axis.ticks.text, fontSize: 10 } } },
        labels: { text: { fontSize: 10, fontWeight: 500 } },
      }}
      axisTop={{ ...axis, tickRotation: cellSize < 30 ? -90 : 0 }}
      axisLeft={axis}
      colors={cell => cell.value === null ? colors.emptyCell : diverging[colorClass(cell.value, scale.edges)]}
      emptyColor={colors.emptyCell}
      borderWidth={1}
      borderColor={colors.cellBorder}
      enableLabels={cellSize >= minLabelWidth}
      label={cell => cell.value === null ? '' : formatCell(cell.value)}
      labelTextColor={cell => textOn(cell.color)}
      hoverTarget="rowColumn"
      inactiveOpacity={0.35}
      animate={false}
      layers={['grid', 'axes', 'cells', SelectionLayer]}
      tooltip={({ cell }) => cell.value === null ? null : (
        <div className="w-64 rounded-lg border bg-card p-3 text-sm text-card-foreground shadow-lg">
          {tooltip(cell.serieId, cell.data.x, cell.value)}
        </div>
      )}
    />
  )
}

function TeamList({ matrix, selectedTeam, scale, formatValue, detail, listTitle }: MatrixHeatmapProps) {
  const { diverging } = useChartTheme()
  const row = matrix.find(r => r.Team === selectedTeam)

  if (!row) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Pick your team at the top of the page to see its list, or switch to the grid.
      </p>
    )
  }

  const items = Object.entries(row)
    .filter((entry): entry is [string, number] => entry[0] !== 'Team' && typeof entry[1] === 'number')
    .sort((a, b) => b[1] - a[1])

  return (
    <div>
      <div className="mb-2 text-sm font-medium">{listTitle(selectedTeam)}</div>
      <ul className="divide-y">
        {items.map(([opponent, value]) => {
          const color = diverging[colorClass(value, scale.edges)]
          return (
            <li key={opponent} className="flex items-center gap-3 py-2">
              <TeamLogo teamName={opponent} size={24} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{opponent}</div>
                {detail && <div className="text-xs text-muted-foreground">{detail(selectedTeam, opponent)}</div>}
              </div>
              <span
                className="min-w-[3.5rem] rounded px-2 py-0.5 text-center text-sm font-semibold tabular-nums"
                style={{ backgroundColor: color, color: textOn(color) }}
              >
                {formatValue(value)}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Legend({ scale }: { scale: HeatmapScale }) {
  const { diverging } = useChartTheme()
  const steps = diverging.length
  return (
    <div className="mx-auto mt-4 w-full max-w-md text-xs text-muted-foreground" aria-hidden="true">
      <div className="flex h-3 overflow-hidden rounded-sm">
        {diverging.map(color => <div key={color} className="flex-1" style={{ backgroundColor: color }} />)}
      </div>
      <div className="relative h-4">
        {scale.edgeLabels.map((label, i) => (
          <span
            key={label}
            className="absolute top-0.5 -translate-x-1/2 tabular-nums"
            style={{ left: `${((i + 1) / steps) * 100}%` }}
          >
            {label}
          </span>
        ))}
      </div>
      <div className="mt-1 flex justify-between">
        <span>{scale.lowCaption}</span>
        <span>{scale.highCaption}</span>
      </div>
    </div>
  )
}
