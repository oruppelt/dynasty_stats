import { useMemo } from 'react'
import { ScatterPlot, ScatterPlotLayerProps, ScatterPlotNodeProps } from '@nivo/scatterplot'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { WidgetSkeleton } from './WidgetSkeleton'
import { ErrorState } from './ErrorState'
import { Explainer } from './Explainer'
import { useChartTheme } from '@/lib/chart-theme'
import { useLeagueData } from '@/lib/league-data'
import { computeStandings, formatPoints, ordinal } from '@/lib/standings'
import { useElementWidth } from '@/lib/use-element-width'

interface Point {
  x: number;
  y: number;
  team: string;
  pfRank: number;
  paRank: number;
}

const MARGIN = { top: 16, right: 16, bottom: 48, left: 56 }

const QUADRANTS = {
  topRight: ['Scores a lot', 'faced low scores'],
  topLeft: ['Scores little', 'faced low scores'],
  bottomRight: ['Scores a lot', 'faced high scores'],
  bottomLeft: ['Scores little', 'faced high scores'],
}

/** Domain padded to whole thousands, and a tick every `step`. */
function axisRange(values: number[], step: number) {
  const min = Math.floor((Math.min(...values) - step / 4) / 1000) * 1000
  const max = Math.ceil((Math.max(...values) + step / 4) / 1000) * 1000
  const ticks: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) ticks.push(v)
  return { min, max, ticks }
}

const thousands = (v: number) => `${v / 1000}k`

export function PointsWidget({ selectedTeam }: { selectedTeam: string }) {
  const { data: league, isLoading, error } = useLeagueData()
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const { colors, nivoTheme, diverging } = useChartTheme()

  const points = useMemo<Point[]>(() => {
    if (!league) return []
    const all = computeStandings(league.teams).map(s => ({
      x: s.points_for, y: s.points_against, team: s.team, pfRank: s.points_for_rank, paRank: s.points_against_rank,
    }))
    // The selected team is drawn last, on top of any logo it overlaps
    return [...all.filter(p => p.team !== selectedTeam), ...all.filter(p => p.team === selectedTeam)]
  }, [league, selectedTeam])

  if (isLoading) return <WidgetSkeleton variant="scatter" />
  if (error || !league) return <ErrorState />

  const { median_scored_for: medianFor, median_scored_against: medianAgainst } = league.for_against
  const narrow = width < 640
  const step = narrow ? 2000 : 1000
  const xRange = axisRange(points.map(p => p.x), step)
  const yRange = axisRange(points.map(p => p.y), step)
  const height = Math.round(Math.min(Math.max(width * 0.7, 360), 600))
  const logoSize = narrow ? 24 : 34

  const quadrantOf = (p: Point) =>
    `${p.x >= medianFor ? 'Scores a lot' : 'Scores little'}, ${p.y <= medianAgainst ? 'faced low scores' : 'faced high scores'}`

  // Shaded best and worst corners, median lines, and a caption in each corner
  const QuadrantLayer = ({ xScale, yScale, innerWidth, innerHeight }: ScatterPlotLayerProps<Point>) => {
    const mx = (xScale as unknown as (v: number) => number)(medianFor)
    const my = (yScale as unknown as (v: number) => number)(medianAgainst)
    const caption = (lines: string[], x: number, y: number, anchor: 'start' | 'end') => (
      <text x={x} y={y} textAnchor={anchor} fontSize={narrow ? 10 : 11} fill={colors.mutedText}>
        {lines.map((line, i) => (
          <tspan key={line} x={x} dy={i === 0 ? 0 : 13}>{line}</tspan>
        ))}
      </text>
    )
    return (
      <g pointerEvents="none">
        {/* y is reversed: fewer points against is higher up */}
        <rect x={mx} y={0} width={innerWidth - mx} height={my} fill={diverging[5]} opacity={0.15} />
        <rect x={0} y={my} width={mx} height={innerHeight - my} fill={diverging[1]} opacity={0.15} />
        <line x1={mx} x2={mx} y1={0} y2={innerHeight} stroke={colors.referenceLine} strokeDasharray="4 4" />
        <line x1={0} x2={innerWidth} y1={my} y2={my} stroke={colors.referenceLine} strokeDasharray="4 4" />
        {caption(QUADRANTS.topLeft, 6, 14, 'start')}
        {caption(QUADRANTS.topRight, innerWidth - 6, 14, 'end')}
        {caption(QUADRANTS.bottomLeft, 6, innerHeight - 19, 'start')}
        {caption(QUADRANTS.bottomRight, innerWidth - 6, innerHeight - 19, 'end')}
      </g>
    )
  }

  // Team logo on a white disc; others fade when a team is selected
  const LogoNode = ({ node }: ScatterPlotNodeProps<Point>) => {
    const isSelected = node.data.team === selectedTeam
    const size = isSelected ? logoSize + 10 : logoSize
    const faded = selectedTeam && !isSelected
    return (
      <g transform={`translate(${node.x},${node.y})`} opacity={faded ? 0.5 : 1}>
        <circle
          r={size / 2}
          fill="#ffffff"
          stroke={isSelected ? colors.selection : colors.mutedText}
          strokeWidth={isSelected ? 2.5 : 0.5}
        />
        <image
          href={`/logos/${node.data.team}.png`}
          x={-size * 0.4}
          y={-size * 0.4}
          width={size * 0.8}
          height={size * 0.8}
        />
      </g>
    )
  }

  return (
    <Card className="w-full">
      <CardHeader className="space-y-2">
        <CardTitle>Points for and against</CardTitle>
        <CardDescription>
          Each logo is a team&apos;s season total. Right: scored more. Up: its opponents scored less.
        </CardDescription>
        <Explainer>
          <p>
            Points for is the team&apos;s own scoring. Points against is what its opponents happened to
            score: in fantasy there&apos;s no defense, so that part is mostly the schedule.
          </p>
          <p>
            The dashed lines are the league medians. Top right (blue) is the best place to be: scoring
            a lot and meeting opponents in their quiet periods. Bottom left (orange) is the opposite.
          </p>
        </Explainer>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <div ref={ref} className="w-full">
          {width > 0 && (
            <ScatterPlot<Point>
              data={[{ id: 'teams', data: points }]}
              width={width}
              height={height}
              margin={MARGIN}
              xScale={{ type: 'linear', min: xRange.min, max: xRange.max }}
              yScale={{ type: 'linear', min: yRange.min, max: yRange.max, reverse: true }}
              theme={nivoTheme}
              gridXValues={xRange.ticks}
              gridYValues={yRange.ticks}
              axisBottom={{
                tickValues: xRange.ticks, format: thousands, tickSize: 0, tickPadding: 8,
                legend: 'Points for', legendPosition: 'middle', legendOffset: 36,
              }}
              axisLeft={{
                tickValues: yRange.ticks, format: thousands, tickSize: 0, tickPadding: 8,
                legend: 'Points against', legendPosition: 'middle', legendOffset: -44,
              }}
              nodeSize={logoSize}
              nodeComponent={LogoNode}
              layers={['grid', QuadrantLayer, 'axes', 'nodes', 'mesh']}
              animate={false}
              tooltip={({ node }) => (
                <div className="w-60 rounded-lg border bg-card p-3 text-sm text-card-foreground shadow-lg">
                  <div className="font-semibold">{node.data.team}</div>
                  <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-3 text-muted-foreground">
                    <dt>Points for</dt>
                    <dd className="text-right tabular-nums">
                      <span className="font-semibold text-foreground">{formatPoints(node.data.x)}</span> ({ordinal(node.data.pfRank)})
                    </dd>
                    <dt>Points against</dt>
                    <dd className="text-right tabular-nums">
                      <span className="font-semibold text-foreground">{formatPoints(node.data.y)}</span> ({ordinal(node.data.paRank)})
                    </dd>
                  </dl>
                  <div className="mt-2 border-t pt-2 text-xs text-muted-foreground">{quadrantOf(node.data)}</div>
                </div>
              )}
            />
          )}
        </div>
      </CardContent>
    </Card>
  )
}
