import { useState } from 'react'
import { ChevronDown, Trophy } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { WidgetSkeleton } from './WidgetSkeleton'
import { TeamLogo } from './TeamLogo'
import { ErrorState } from './ErrorState'
import { PlayerName } from './PlayerName'
import { SeasonSummary, useAllTime } from '@/lib/alltime'
import { RingLeader, Title, useChampions } from '@/lib/champions'
import { formatSalary } from '@/lib/players'
import { formatPoints } from '@/lib/standings'
import { teamCode } from '@/lib/teams'
import { cn } from '@/lib/utils'

const TH = 'h-9 whitespace-nowrap border-b px-2 text-right font-medium'
const TD = 'h-10 whitespace-nowrap border-b px-2 text-right'

/** A champion's players: what each did for it that season, the final's top scorer first in a line above. */
function TitleRoster({ title }: { title: Title }) {
  const mvp = title.final_periods.length
    ? [...title.players].sort((a, b) => b.finals_points - a.finals_points)[0]
    : undefined
  return (
    <div className="pb-3 pl-2 sm:pl-[6.5rem]">
      <p className="mb-1 text-xs text-muted-foreground">
        {title.players.length} rings
        {mvp && mvp.finals_points > 0 && <> · Top scorer in the final: <PlayerName id={mvp.player_id} name={mvp.player} className="inline" /> ({formatPoints(mvp.finals_points)})</>}
      </p>
      <div className="w-full overflow-x-auto">
        <table className="w-full text-xs tabular-nums sm:text-sm">
          <thead>
            <tr className="text-muted-foreground">
              <th className="sticky left-0 z-10 h-9 border-b bg-card px-2 text-left font-medium">Player</th>
              <th className={TH}>Points</th>
              <th className={TH}>Playoffs</th>
              {title.final_periods.length > 0 && <th className={TH}>Final</th>}
              <th className={TH}>Starts</th>
              <th className={TH}>Salary</th>
            </tr>
          </thead>
          <tbody className="[&_tr:last-child_td]:border-0">
            {title.players.map(p => (
              <tr key={p.player_id}>
                <td className="sticky left-0 z-10 h-10 border-b bg-card px-2">
                  <PlayerName id={p.player_id} name={p.player} className="max-w-36 sm:max-w-none" />
                </td>
                <td className={TD}>{formatPoints(p.points)}</td>
                <td className={TD}>{p.playoff_starts ? formatPoints(p.playoff_points) : '–'}</td>
                {title.final_periods.length > 0 && <td className={TD}>{p.finals_points ? formatPoints(p.finals_points) : '–'}</td>}
                <td className={TD}>{p.starts}{p.playoff_starts > 0 && <span className="text-muted-foreground"> +{p.playoff_starts}</span>}</td>
                <td className={TD}>{p.salary ? formatSalary(p.salary) : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SeasonRow({ s, title, selectedTeam }: { s: SeasonSummary; title?: Title; selectedTeam: string }) {
  const mine = [s.champion, s.runner_up, s.first_seed].includes(selectedTeam)
  const [open, setOpen] = useState(false)
  const Row = title ? 'button' : 'div'
  return (
    <li>
      <Row
        {...(title ? { type: 'button' as const, onClick: () => setOpen(!open), 'aria-expanded': open } : {})}
        className={cn('flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left', mine && 'bg-muted', title && 'hover:bg-muted/60')}
      >
        <span className="w-16 shrink-0 text-sm font-semibold tabular-nums">{s.season}</span>
        {s.champion ? (
          <TeamLogo teamName={s.champion} size={36} className="shrink-0" />
        ) : (
          <span className="h-9 w-9 shrink-0 rounded-full bg-muted" />
        )}
        <div className="min-w-0 flex-1">
          <div className={cn('flex items-center gap-1.5 truncate font-semibold', !s.champion && 'font-normal text-muted-foreground')}>
            {s.champion && <Trophy className="h-4 w-4 shrink-0 text-rank-gold" />}
            <span className="truncate">
              {s.champion ?? (s.in_progress ? 'In progress' : s.no_champion ? 'No champion' : 'Champion not recorded')}
            </span>
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {s.runner_up && <>Beat {s.runner_up} in the final · </>}
            Best regular season: {s.first_seed}
          </div>
        </div>
        {title && <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />}
      </Row>
      {title && open && <TitleRoster title={title} />}
    </li>
  )
}

/** Players with a ring: rings, finals reached, then points in finals. */
const RING_PAGE = 30

function RingLeaders({ players, selectedTeam }: { players: RingLeader[]; selectedTeam: string }) {
  const [shown, setShown] = useState(RING_PAGE)
  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Rings</CardTitle>
        <CardDescription>
          A player gets a ring for scoring for the champion that season (any start with points, playoffs included),
          and a lost final for being on the runner-up&apos;s roster (lineup or bench) in a game of the final. All{' '}
          {players.length} ring holders, by rings, then finals reached, then finals points: lineup points in every
          final, won or lost. Career playoffs: points and starts in the playoffs for any team.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 sm:px-6">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-muted-foreground">
                <th className="h-10 w-8 border-b px-2 text-right font-medium">#</th>
                <th className="sticky left-0 z-10 h-10 border-b bg-card px-2 text-left font-medium">Player</th>
                <th className={TH}>Rings</th>
                <th className={TH}>Lost finals</th>
                <th className={TH}>Finals pts</th>
                <th className={TH}>Career playoff pts</th>
                <th className={TH}>Career playoff starts</th>
              </tr>
            </thead>
            <tbody className="[&_tr:last-child_td]:border-0">
              {players.slice(0, shown).map((p, i) => {
                const mine = [...p.titles, ...p.lost].some(t => t.team === selectedTeam)
                const teams = [...new Set(p.titles.map(t => t.team))]
                return (
                  <tr key={p.player_id} className={cn(mine && 'bg-muted font-semibold')}>
                    <td className="h-12 border-b px-2 text-right text-xs text-muted-foreground">{i + 1}</td>
                    <td className={cn('sticky left-0 z-10 h-12 border-b px-2', mine ? 'bg-muted' : 'bg-card')}>
                      <div className="flex items-center gap-2">
                        <span className="hidden shrink-0 items-center -space-x-2 sm:flex">
                          {teams.map(t => <TeamLogo key={t} teamName={t} size={22} />)}
                        </span>
                        <div className="min-w-0">
                          <PlayerName id={p.player_id} name={p.player} className="max-w-36 sm:max-w-none" />
                          <div className="max-w-36 truncate text-xs font-normal text-muted-foreground sm:max-w-none">
                            {p.titles.map(t => `${t.season} ${teamCode(t.team)}`).join(' · ')}
                            {p.lost.length > 0 && <> · lost {p.lost.map(t => `${t.season} ${teamCode(t.team)}`).join(', ')}</>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className={TD}>
                      <span className="inline-flex gap-0.5" aria-label={`${p.rings} rings`}>
                        {Array.from({ length: p.rings }, (_, k) => <Trophy key={k} className="h-4 w-4 text-rank-gold" />)}
                      </span>
                    </td>
                    <td className={TD}>{p.finals_lost || '–'}</td>
                    <td className={TD}>{p.finals_points ? formatPoints(p.finals_points) : '–'}</td>
                    <td className={TD}>{p.playoff_points ? formatPoints(p.playoff_points) : '–'}</td>
                    <td className={TD}>{p.playoff_starts || '–'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {players.length > shown && (
          <div className="px-4 pt-3 sm:px-0">
            <button type="button" onClick={() => setShown(n => n + RING_PAGE)} className="text-sm font-medium text-primary hover:underline">
              Show {Math.min(RING_PAGE, players.length - shown)} more
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function ChampionsWidget({ selectedTeam }: { selectedTeam: string }) {
  const { data, isLoading, error } = useAllTime()
  const { data: champions } = useChampions()

  if (isLoading) return <WidgetSkeleton variant="list" />
  if (error || !data) return <ErrorState />

  const cabinet = data.franchises
    .filter(f => f.finals > 0)
    .sort((a, b) => b.titles - a.titles || b.finals - a.finals || b.playoffs - a.playoffs || a.team.localeCompare(b.team))
  const first = data.seasons[data.seasons.length - 1].season
  // A champion without a known runner-up (an earlier format)
  const noFinal = data.seasons.filter(s => s.champion && !s.runner_up).map(s => s.season).reverse()

  return (
    <div className="grid w-full grid-cols-1 items-start gap-4 lg:grid-cols-[3fr_2fr]">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Champions</CardTitle>
          <CardDescription>
            Every season since {first}, newest first.{champions && ' Open a title for the champion\'s players: everyone who scored for it got a ring.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          <ol className="divide-y">
            {data.seasons.map(s => (
              <SeasonRow key={s.season} s={s} selectedTeam={selectedTeam}
                         title={champions?.seasons.find(t => t.season === s.season && t.champion === s.champion)} />
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Finals</CardTitle>
          <CardDescription>Titles and finals reached, then playoff appearances.</CardDescription>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          <ol className="divide-y">
            {cabinet.map(f => (
              <li key={f.team} className={cn('flex items-center gap-2 px-1.5 py-2 text-sm', f.team === selectedTeam && 'rounded-md bg-muted')}>
                <TeamLogo teamName={f.team} size={24} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate font-medium">{f.team}</span>
                <span className="flex shrink-0 gap-0.5" aria-label={`${f.titles} titles`}>
                  {Array.from({ length: f.titles }, (_, i) => <Trophy key={i} className="h-4 w-4 text-rank-gold" />)}
                </span>
                <span className="w-16 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                  {f.finals} final{f.finals === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ol>
          {noFinal.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              {noFinal.join(' and ')} had an earlier playoff format: their runners-up aren&apos;t known, so only titles count.
            </p>
          )}
        </CardContent>
      </Card>

      {champions && champions.players.length > 0 && (
        <RingLeaders players={champions.players} selectedTeam={selectedTeam} />
      )}
    </div>
  )
}
