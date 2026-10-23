import { ReactNode } from 'react'
import { Line, LineCustomSvgLayerProps, LineSvgProps } from '@nivo/line'
import { useChartTheme } from '@/lib/chart-theme'
import { teamLineColor } from '@/lib/nba-team-colors'
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
  /** Teams drawn in their own color (the viewer's team always is) */
  shown: Set<string>;
  yScale: LineSvgProps<TeamSeries>['yScale'];
  yTicks: number[];
  formatY: (value: number) => string;
  yLegend: string;
  /** A dashed reference line, e.g. zero luck */
  baseline?: number;
  tooltip: (team: string, period: number, value: number) => ReactNode;
}

const MARGIN = { top: 12, right: 60, bottom: 44, left: 48 }
const LOGO = 14
/** Closest two end labels may sit, in px */
const LABEL_GAP = 14

/** Spreads end labels apart vertically, keeping them within [top, bottom]. */
function spread<T extends { y: number }>(labels: T[], top: number, bottom: number): T[] {
  const out = [...labels].sort((a, b) => a.y - b.y).map(l => ({ ...l }))
  for (let i = 1; i < out.length; i++) out[i].y = Math.max(out[i].y, out[i - 1].y + LABEL_GAP)
  const overflow = (out.at(-1)?.y ?? 0) - bottom
  if (overflow > 0) {
    out[out.length - 1].y = bottom
    for (let i = out.length - 2; i >= 0; i--) out[i].y = Math.min(out[i].y, out[i + 1].y - LABEL_GAP)
  }
  for (const l of out) l.y = Math.max(l.y, top)
  return out
}

/**
 * Every team as a thin faded line; the shown teams (and the viewer's, and the
 * one under the pointer) in their team colors on top, with a logo and code at
 * the end of the line.
 */
export function SeasonLines({ series, selectedTeam, shown, yScale, yTicks, formatY, yLegend, baseline, tooltip }: SeasonLinesProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const { colors, nivoTheme, isDark } = useChartTheme()
  const narrow = width < 640
  const height = narrow ? 420 : 480
  const periods = series[0]?.data.map(d => d.x) ?? []
  const lastPeriod = periods[periods.length - 1] ?? 1
  const step = narrow ? 8 : 4
  const xTicks = periods.filter(p => p === 1 || p % step === 0)

  const LinesLayer = ({ series: computed, lineGenerator, currentPoint, innerHeight }: LineCustomSvgLayerProps<TeamSeries>) => {
    const hovered = currentPoint?.seriesId
    const colored = (id: string) => id === selectedTeam || id === hovered || shown.has(id)
    const path = (s: (typeof computed)[number]) => lineGenerator(s.data.map(d => d.position)) ?? undefined
    // The viewer's team and the hovered one last, so they're drawn on top
    const order = (id: string) => (id === hovered ? 2 : id === selectedTeam ? 1 : 0)
    const front = computed.filter(s => colored(s.id)).sort((a, b) => order(a.id) - order(b.id))
    const labels = spread(
      front.map(s => ({ id: s.id, y: s.data[s.data.length - 1].position.y })), 0, innerHeight,
    )
    const endX = front[0]?.data[front[0].data.length - 1].position.x ?? 0
    const anyColored = front.length > 0
    return (
      <g pointerEvents="none">
        <g fill="none">
          {computed.filter(s => !colored(s.id)).map(s => (
            <path key={s.id} d={path(s)} stroke={colors.mutedText} strokeOpacity={anyColored ? 0.22 : 0.45} strokeWidth={1.25} />
          ))}
          {front.map(s => (
            <path
              key={s.id}
              d={path(s)}
              stroke={teamLineColor(s.id, isDark)}
              strokeWidth={s.id === selectedTeam ? 3.5 : s.id === hovered ? 3 : 2}
              strokeOpacity={hovered && s.id !== hovered && s.id !== selectedTeam ? 0.45 : 1}
            />
          ))}
        </g>
        {labels.map(l => (
          <g key={l.id} transform={`translate(${endX + 6}, ${l.y})`}>
            <circle cx={LOGO / 2} r={LOGO / 2 + 1} fill="#ffffff" stroke={teamLineColor(l.id, isDark)} strokeWidth={1.5} />
            <image href={`/logos/${l.id}.png`} x={1} y={-LOGO / 2 + 1} width={LOGO - 2} height={LOGO - 2} />
            <text
              x={LOGO + 4}
              dominantBaseline="central"
              fontSize={11}
              fontWeight={l.id === selectedTeam || l.id === hovered ? 700 : 500}
              fill={colors.text}
            >
              {teamCode(l.id)}
            </text>
          </g>
        ))}
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
