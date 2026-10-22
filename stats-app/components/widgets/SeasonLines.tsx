import { ReactNode } from 'react'
import { Line, LineCustomSvgLayerProps, LineSvgProps } from '@nivo/line'
import { useChartTheme } from '@/lib/chart-theme'
import { teamCode } from '@/lib/teams'
import { useElementWidth } from '@/lib/use-element-width'

/** One team's value after each period. */
export interface TeamSeries {
  id: string;
  data: { x: number; y: number }[];
}

interface SeasonLinesProps {
  series: TeamSeries[];
  selectedTeam: string;
  yScale: LineSvgProps<TeamSeries>['yScale'];
  yTicks: number[];
  formatY: (value: number) => string;
  yLegend: string;
  /** A dashed reference line, e.g. zero luck */
  baseline?: number;
  tooltip: (team: string, period: number, value: number) => ReactNode;
}

const MARGIN = { top: 12, right: 40, bottom: 44, left: 48 }

/**
 * Every team as a thin faded line, with the viewer's team (and the one under
 * the pointer) drawn on top and labelled at its end.
 */
export function SeasonLines({ series, selectedTeam, yScale, yTicks, formatY, yLegend, baseline, tooltip }: SeasonLinesProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const { colors, nivoTheme, diverging } = useChartTheme()
  const narrow = width < 640
  const height = narrow ? 420 : 480
  const periods = series[0]?.data.map(d => d.x) ?? []
  const lastPeriod = periods[periods.length - 1] ?? 1
  const step = narrow ? 8 : 4
  const xTicks = periods.filter(p => p === 1 || p % step === 0)

  const LinesLayer = ({ series: computed, lineGenerator, currentPoint }: LineCustomSvgLayerProps<TeamSeries>) => {
    const hovered = currentPoint?.seriesId
    const strong = (id: string) => id === selectedTeam || id === hovered
    const path = (s: (typeof computed)[number]) => lineGenerator(s.data.map(d => d.position)) ?? undefined
    return (
      <g fill="none" pointerEvents="none">
        {computed.filter(s => !strong(s.id)).map(s => (
          <path key={s.id} d={path(s)} stroke={colors.mutedText} strokeOpacity={hovered || selectedTeam ? 0.25 : 0.45} strokeWidth={1.25} />
        ))}
        {computed.filter(s => strong(s.id)).map(s => {
          const end = s.data[s.data.length - 1].position
          // The viewer's team in the ink color; another hovered team in blue
          const color = s.id === selectedTeam ? colors.selection : diverging[6]
          return (
            <g key={s.id}>
              <path d={path(s)} stroke={color} strokeWidth={s.id === selectedTeam ? 3 : 2} />
              <text x={end.x + 6} y={end.y} dominantBaseline="central" fontSize={11} fontWeight={600} fill={colors.text}>
                {teamCode(s.id)}
              </text>
            </g>
          )
        })}
        {currentPoint && (
          <circle cx={currentPoint.x} cy={currentPoint.y} r={4} fill={colors.text} stroke={colors.cellBorder} strokeWidth={1.5} />
        )}
      </g>
    )
  }

  return (
    <div ref={ref} className="w-full">
      {width > 0 && (
        <Line<TeamSeries>
          data={series}
          width={width}
          height={height}
          margin={MARGIN}
          theme={nivoTheme}
          xScale={{ type: 'linear', min: 1, max: lastPeriod, nice: false }}
          yScale={yScale}
          curve="monotoneX"
          gridXValues={xTicks}
          gridYValues={yTicks}
          axisBottom={{ tickValues: xTicks, tickSize: 0, tickPadding: 8, legend: 'Period', legendPosition: 'middle', legendOffset: 34 }}
          axisLeft={{
            tickValues: yTicks, format: v => formatY(Number(v)), tickSize: 0, tickPadding: 8,
            legend: yLegend, legendPosition: 'middle', legendOffset: -40,
          }}
          markers={baseline === undefined ? [] : [{
            axis: 'y', value: baseline, lineStyle: { stroke: colors.referenceLine, strokeDasharray: '4 4', strokeWidth: 1 },
          }]}
          layers={['grid', 'markers', 'axes', LinesLayer, 'mesh']}
          useMesh
          enableTouchCrosshair
          animate={false}
          tooltip={({ point }) => (
            <div className="w-56 rounded-lg border bg-card p-3 text-sm text-card-foreground shadow-lg">
              {tooltip(point.seriesId, point.data.x, point.data.y)}
            </div>
          )}
        />
      )}
    </div>
  )
}
