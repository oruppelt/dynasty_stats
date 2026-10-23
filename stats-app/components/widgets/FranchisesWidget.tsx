import { useMemo, useState } from 'react'
import {
  ColumnDef,
  SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, Trophy } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { WidgetSkeleton } from './WidgetSkeleton'
import { TeamLogo } from './TeamLogo'
import { ErrorState } from './ErrorState'
import { Explainer } from './Explainer'
import { AllTime, FINISH_LABEL, FINISH_SHORT, Finish, Franchise, TeamSeason, allPlayPct, formatIndex, useAllTime, winPct } from '@/lib/alltime'
import { formatLuck, formatPct, formatRecord, luckColor } from '@/lib/standings'
import { teamCode } from '@/lib/teams'
import { cn } from '@/lib/utils'

// Team stays in view while the other columns scroll sideways on phones
const STICKY: Record<string, string> = { team: 'sticky left-0 z-10 text-left' }

interface Row extends Franchise {
  win_pct: number;
  all_play_pct: number;
}

const columns: ColumnDef<Row>[] = [
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
    id: 'win_pct',
    accessorKey: 'win_pct',
    header: 'Win %',
    sortDescFirst: true,
    cell: ({ row }) => formatPct(row.original.win_pct),
  },
  {
    id: 'all_play_pct',
    accessorKey: 'all_play_pct',
    header: 'All-play %',
    sortDescFirst: true,
    cell: ({ row }) => formatPct(row.original.all_play_pct),
  },
  {
    id: 'score_index',
    accessorKey: 'score_index',
    header: 'Score index',
    sortDescFirst: true,
    cell: ({ row }) => formatIndex(row.original.score_index),
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
    id: 'average_rank',
    accessorFn: r => r.average_rank ?? 99,
    header: 'Avg finish',
    cell: ({ row }) => row.original.average_rank?.toFixed(1) ?? '–',
  },
  { id: 'playoffs', accessorKey: 'playoffs', header: 'Playoffs', sortDescFirst: true },
  { id: 'finals', accessorKey: 'finals', header: 'Finals', sortDescFirst: true },
  { id: 'titles', accessorKey: 'titles', header: 'Titles', sortDescFirst: true },
]

function CareerTable({ data, selectedTeam }: { data: AllTime; selectedTeam: string }) {
  const rows = useMemo<Row[]>(
    () => data.franchises.map(f => ({ ...f, win_pct: winPct(f), all_play_pct: allPlayPct(f) })),
    [data],
  )
  const [sorting, setSorting] = useState<SortingState>([{ id: 'win_pct', desc: true }])
  // The warning is about the React Compiler, which this app doesn't use
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })
  const finished = data.seasons.filter(s => !s.in_progress).length

  return (
    <Card className="w-full">
      <CardHeader className="space-y-2">
        <CardTitle>Franchises</CardTitle>
        <CardDescription>
          Every team&apos;s regular seasons added up, {data.seasons.length} seasons. Sort by any column heading.
        </CardDescription>
        <Explainer>
          <p>
            Seasons had 30 to 33 periods and the scoring changed over the years, so the table compares rates,
            not totals. <strong>Score index</strong>: a team&apos;s score divided by that period&apos;s league
            average, averaged over its games: 1.10 means 10% above the league.
          </p>
          <p>
            <strong>Luck</strong>: wins above (or below) what the scores earned, added up over the seasons.
            {' '}<strong>Avg finish</strong>: the average regular-season rank, and <strong>Playoffs</strong>,
            {' '}<strong>Finals</strong>, <strong>Titles</strong> count the {finished} finished seasons. A season
            in progress counts in the records and rates.
          </p>
        </Explainer>
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

// One hue, darker the deeper the playoff run; the champion in gold
const FINISH_CELL: Record<Finish, string> = {
  champion: 'bg-rank-gold text-black',
  final: 'bg-strong text-white',
  semifinal: 'bg-strong/65 text-white',
  quarterfinal: 'bg-strong/45 text-foreground',
  swiss: 'bg-strong/20 text-foreground',
  round1: 'bg-strong/20 text-foreground',
  playoffs: 'bg-muted-foreground/30 text-foreground', // round not known
  missed: 'text-muted-foreground',
}
const LEGEND: Finish[] = ['champion', 'final', 'semifinal', 'quarterfinal', 'swiss', 'round1', 'playoffs', 'missed']

type GridMode = 'standings' | 'playoffs'

function SeasonCell({ s, mode }: { s: TeamSeason | undefined; mode: GridMode }) {
  if (!s) return <td />
  const label = `${s.season}: ranked ${s.rank}, ${formatRecord(s.wins, s.losses)}` +
    (s.finish ? `, ${FINISH_LABEL[s.finish].toLowerCase()}` : ', in progress')
  return (
    <td className="p-0.5">
      <div
        title={label}
        aria-label={label}
        className={cn(
          'flex h-7 min-w-7 items-center sm:min-w-8 justify-center rounded-sm text-xs font-medium tabular-nums',
          s.finish ? FINISH_CELL[s.finish] : 'border border-dashed text-muted-foreground',
        )}
      >
        {s.finish === 'champion'
          ? <Trophy className="h-3.5 w-3.5" />
          : mode === 'standings' || !s.finish ? s.rank : FINISH_SHORT[s.finish]}
      </div>
    </td>
  )
}

function SeasonGrid({ data, selectedTeam }: { data: AllTime; selectedTeam: string }) {
  const seasons = [...data.seasons].reverse().map(s => s.season)
  const bySeason = new Map(data.team_seasons.map(s => [`${s.team}|${s.season}`, s]))
  const teams = [...data.franchises]
    .sort((a, b) => (a.average_rank ?? 99) - (b.average_rank ?? 99) || a.team.localeCompare(b.team))
    .map(f => f.team)
  const used = new Set(data.team_seasons.map(s => s.finish))
  const [mode, setMode] = useState<GridMode>('standings')

  return (
    <Card className="w-full">
      <CardHeader className="space-y-2 pb-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-lg">Season by season</CardTitle>
          <div className="inline-flex self-start rounded-md bg-muted p-1 text-sm" role="group" aria-label="Show">
            {(['standings', 'playoffs'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={cn(
                  'rounded-sm px-3 py-1 font-medium capitalize text-muted-foreground',
                  mode === m && 'bg-background text-foreground shadow-xs',
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <CardDescription>
          {mode === 'standings'
            ? 'Each team\'s final regular-season rank.'
            : 'How far each team went in the playoffs: R1 is out in the first round (the Swiss stage since 2021-22).'}
          {' '}Shaded by the playoff run; best average finish first.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <div className="w-full overflow-x-auto">
          <table className="mx-auto text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-card" />
                {seasons.map(s => (
                  <th key={s} className="px-0.5 pb-1 text-xs font-medium text-muted-foreground tabular-nums">
                    &apos;{s.slice(2, 4)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teams.map(team => (
                <tr key={team}>
                  <th
                    scope="row"
                    className={cn(
                      'sticky left-0 z-10 bg-card pr-2 text-left font-medium',
                      team === selectedTeam && 'font-bold',
                    )}
                  >
                    <div className={cn('flex items-center gap-1.5 rounded-sm px-1', team === selectedTeam && 'bg-muted')}>
                      <TeamLogo teamName={team} size={18} className="shrink-0" />
                      <span className="sm:hidden">{teamCode(team)}</span>
                      <span className="hidden max-w-48 truncate sm:inline">{team}</span>
                    </div>
                  </th>
                  {seasons.map(season => <SeasonCell key={season} s={bySeason.get(`${team}|${season}`)} mode={mode} />)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
          {LEGEND.filter(f => used.has(f)).map(f => (
            <li key={f} className="flex items-center gap-1.5">
              <span className={cn('flex h-4 w-5 items-center justify-center rounded-sm', FINISH_CELL[f], f === 'missed' && 'border')}>
                {f === 'champion' && <Trophy className="h-3 w-3" />}
              </span>
              {FINISH_LABEL[f]}{FINISH_SHORT[f] && f !== 'champion' && ` (${FINISH_SHORT[f]})`}
            </li>
          ))}
          {used.has(null) && (
            <li className="flex items-center gap-1.5">
              <span className="h-4 w-5 rounded-sm border border-dashed" />
              In progress
            </li>
          )}
        </ul>
      </CardContent>
    </Card>
  )
}

export function FranchisesWidget({ selectedTeam }: { selectedTeam: string }) {
  const { data, isLoading, error } = useAllTime()

  if (isLoading) return <WidgetSkeleton variant="list" />
  if (error || !data) return <ErrorState />

  return (
    <div className="w-full space-y-4">
      <CareerTable data={data} selectedTeam={selectedTeam} />
      <SeasonGrid data={data} selectedTeam={selectedTeam} />
    </div>
  )
}
