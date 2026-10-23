import { useMemo, useState } from 'react'
import {
  ColumnDef,
  SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { WidgetSkeleton } from './WidgetSkeleton'
import { TeamLogo } from './TeamLogo'
import { ErrorState } from './ErrorState'
import { PeriodResult, useLeagueData } from '@/lib/league-data'
import { allPlayPct } from '@/lib/season'
import {
  Standing,
  computeStandings,
  formatCount,
  formatLuck,
  formatPct,
  formatPoints,
  formatRecord,
  luckColor,
} from '@/lib/standings'
import { cn } from '@/lib/utils'

// Rank and team stay in view while the other columns scroll sideways on phones
const STICKY: Record<string, string> = {
  rank: 'sticky left-0 z-10 w-9 min-w-9 text-left',
  team: 'sticky left-9 z-10 text-left',
}

const RECENT_PERIODS = 5

interface Row extends Standing {
  /** The last few periods, oldest first */
  recent: PeriodResult[];
  /** Mean all-play % over them, for sorting */
  recent_pct: number;
}

/** One bar per recent period: height = share of teams the score beat, dark = won. */
function RecentBars({ recent }: { recent: PeriodResult[] }) {
  const barWidth = 6
  const gap = 3
  const height = 20
  return (
    <svg
      width={recent.length * (barWidth + gap) - gap}
      height={height}
      className="inline-block align-middle"
      role="img"
      aria-label={recent.map(r => `Period ${r.period}: ${r.win === 1 ? 'won' : r.win === 0 ? 'lost' : 'tied'}, beat ${formatCount(r.all_play_wins)}`).join('; ')}
    >
      {recent.map((r, i) => {
        const h = Math.max(2, allPlayPct(r) * height)
        return (
          <rect
            key={r.period}
            x={i * (barWidth + gap)}
            y={height - h}
            width={barWidth}
            height={h}
            rx={1}
            className={r.win === 1 ? 'fill-foreground' : r.win === 0 ? 'fill-muted-foreground/40' : 'fill-muted-foreground'}
          >
            <title>{`Period ${r.period}: ${r.win === 1 ? 'won' : r.win === 0 ? 'lost' : 'tied'}, beat ${formatCount(r.all_play_wins)} of ${r.all_play_wins + r.all_play_losses} teams`}</title>
          </rect>
        )
      })}
    </svg>
  )
}

const columns: ColumnDef<Row>[] = [
  {
    id: 'rank',
    accessorKey: 'rank',
    header: '#',
    cell: ({ row }) => row.original.rank,
  },
  {
    id: 'team',
    accessorKey: 'team',
    header: 'Team',
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <TeamLogo teamName={row.original.team} size={24} className="shrink-0" />
        <span className="max-w-34 truncate sm:max-w-none">{row.original.team}</span>
      </div>
    ),
  },
  {
    id: 'record',
    accessorKey: 'win_pct',
    header: 'W-L',
    sortDescFirst: true,
    cell: ({ row }) => formatRecord(row.original.wins, row.original.losses),
  },
  {
    id: 'all_play',
    accessorKey: 'all_play_wins',
    header: 'All-play',
    sortDescFirst: true,
    cell: ({ row }) => formatRecord(row.original.all_play_wins, row.original.all_play_losses),
  },
  {
    id: 'all_play_pct',
    accessorKey: 'all_play_pct',
    header: 'All-play %',
    sortDescFirst: true,
    cell: ({ row }) => formatPct(row.original.all_play_pct),
  },
  {
    id: 'luck',
    accessorKey: 'luck',
    header: 'Luck',
    sortDescFirst: true,
    cell: ({ row }) => (
      <span className={cn('font-medium', luckColor(row.original.luck))}>{formatLuck(row.original.luck)}</span>
    ),
  },
  {
    id: 'pf',
    accessorKey: 'points_for',
    header: 'PF',
    sortDescFirst: true,
    cell: ({ row }) => formatPoints(row.original.points_for),
  },
  {
    id: 'pa',
    accessorKey: 'points_against',
    header: 'PA',
    sortDescFirst: true,
    cell: ({ row }) => formatPoints(row.original.points_against),
  },
  {
    id: 'recent',
    accessorKey: 'recent_pct',
    header: 'Last 5',
    sortDescFirst: true,
    cell: ({ row }) => <RecentBars recent={row.original.recent} />,
  },
]

interface StandingsWidgetProps {
  selectedTeam: string;
}

export function StandingsWidget({ selectedTeam }: StandingsWidgetProps) {
  const { data: league, isLoading, error } = useLeagueData()
  const standings = useMemo<Row[]>(() => {
    if (!league) return []
    return computeStandings(league.teams).map(s => {
      const recent = league.results
        .filter(r => r.team === s.team)
        .sort((a, b) => a.period - b.period)
        .slice(-RECENT_PERIODS)
      const recent_pct = recent.reduce((sum, r) => sum + allPlayPct(r), 0) / (recent.length || 1)
      return { ...s, recent, recent_pct }
    })
  }, [league])
  const [sorting, setSorting] = useState<SortingState>([])

  // The warning is about the React Compiler, which this app doesn't use
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: standings,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  if (isLoading) {
    return <WidgetSkeleton variant="list" />;
  }

  if (error || !league) return <ErrorState />

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Standings</CardTitle>
        <CardDescription>
          <strong>All-play</strong>: the record a team would have if it played every other team every
          period. <strong>Luck</strong>: wins above (or below) what its scores earned. <strong>Last 5</strong>:
          one bar per period, as tall as the share of teams its score beat; dark bars are wins. A tie
          counts as half a win and half a loss.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 sm:px-6">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map(header => {
                    const sorted = header.column.getIsSorted()
                    const sticky = STICKY[header.column.id]
                    return (
                      <th
                        key={header.id}
                        className={cn(
                          'h-10 whitespace-nowrap border-b px-2 font-medium text-muted-foreground',
                          sticky ? `${sticky} bg-card` : 'text-right',
                        )}
                        aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                      >
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn('inline-flex items-center gap-1 hover:text-foreground', sorted && 'text-foreground')}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === 'asc' && <ArrowUp className="h-3 w-3" />}
                          {sorted === 'desc' && <ArrowDown className="h-3 w-3" />}
                        </button>
                      </th>
                    )
                  })}
                </tr>
              ))}
            </thead>
            {/* Borders sit on the cells: on the rows, the sticky cells would paint over them */}
            <tbody className="[&_tr:last-child_td]:border-0">
              {table.getRowModel().rows.map(row => {
                const isSelected = row.original.team === selectedTeam
                return (
                  <tr key={row.id} className={cn(isSelected && 'bg-muted font-semibold')}>
                    {row.getVisibleCells().map(cell => {
                      const sticky = STICKY[cell.column.id]
                      return (
                        <td
                          key={cell.id}
                          className={cn(
                            'h-11 whitespace-nowrap border-b px-2',
                            sticky ? `${sticky} ${isSelected ? 'bg-muted' : 'bg-card'}` : 'text-right',
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
