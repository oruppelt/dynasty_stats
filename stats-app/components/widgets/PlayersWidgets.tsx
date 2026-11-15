import { ReactNode, useState } from 'react'
import { ArrowDown } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { WidgetSkeleton } from './WidgetSkeleton'
import { TeamLogo } from './TeamLogo'
import { ErrorState } from './ErrorState'
import { Explainer } from './Explainer'
import { PlayerName } from './PlayerName'
import { AllTimePlayers, PlayerLeader, PlayerPeriod, PlayersData, SeasonPlayerPeriod, describeContract, formatFpts, formatSalary, useAllTimePlayers, usePlayers } from '@/lib/players'
import { useLeagueData } from '@/lib/league-data'
import { formatPoints } from '@/lib/standings'
import { teamCode } from '@/lib/teams'
import { cn } from '@/lib/utils'

/** Loading, error and "no player data" states shared by the player views. */
function usePlayersView(): { view?: ReactNode; data?: PlayersData } {
  const { data: league, isLoading: leagueLoading, error: leagueError } = useLeagueData()
  const { data, isLoading, error } = usePlayers()
  if (leagueLoading || isLoading) return { view: <WidgetSkeleton variant="list" /> }
  if (leagueError || error || !league) return { view: <ErrorState /> }
  if (!data) {
    return {
      view: (
        <Card className="w-full">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No player data for {league.meta.season} yet.
          </CardContent>
        </Card>
      ),
    }
  }
  return { data }
}

function Intro({ title, children, explainer }: { title: string; children: ReactNode; explainer?: ReactNode }) {
  return (
    <CardHeader className="space-y-2">
      <CardTitle>{title}</CardTitle>
      <CardDescription>{children}</CardDescription>
      {explainer && <Explainer>{explainer}</Explainer>}
    </CardHeader>
  )
}

const games = (n: number) => `${n} game${n === 1 ? '' : 's'}`

// ---------------------------------------------------------------- Leaders

/** Players by points: the season leaders, playoff leaders, career leaders. `seasons` adds that column. */
function LeadersTable({ rows, selectedTeam, seasons }: {
  rows: (PlayerLeader & { seasons?: number; season?: string })[];
  selectedTeam: string;
  seasons?: boolean;
}) {
  const salary = rows.some(r => r.salary != null)
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="text-muted-foreground">
            <th className="h-10 w-8 border-b px-2 text-right font-medium">#</th>
            <th className="sticky left-0 z-10 h-10 border-b bg-card px-2 text-left font-medium">Player</th>
            <th className="h-10 border-b px-2 text-right font-medium text-foreground">
              <span className="inline-flex items-center gap-1">Points<ArrowDown className="h-3 w-3" /></span>
            </th>
            {seasons && <th className="h-10 border-b px-2 text-right font-medium">Seasons</th>}
            <th className="h-10 border-b px-2 text-right font-medium">Starts</th>
            <th className="h-10 border-b px-2 text-right font-medium">GP</th>
            <th className="h-10 whitespace-nowrap border-b px-2 text-right font-medium">Per game</th>
            {salary && <th className="h-10 border-b px-2 text-right font-medium">Salary</th>}
            {salary && <th className="h-10 whitespace-nowrap border-b px-2 text-right font-medium">Per $1M</th>}
          </tr>
        </thead>
        <tbody className="[&_tr:last-child_td]:border-0">
          {rows.map((p, i) => {
            const mine = p.teams.includes(selectedTeam)
            return (
              <tr key={`${p.season ?? ''}-${p.player_id}`} className={cn(mine && 'bg-muted font-semibold')}>
                <td className="h-11 border-b px-2 text-right text-xs text-muted-foreground">{i + 1}</td>
                <td className={cn('sticky left-0 z-10 h-11 border-b px-2', mine ? 'bg-muted' : 'bg-card')}>
                  <div className="flex items-center gap-2">
                    <TeamLogos teams={p.teams} />
                    <div className="min-w-0">
                      <PlayerName id={p.player_id} name={p.player} className="max-w-36 sm:max-w-none" />
                      <div className="max-w-36 truncate text-xs font-normal text-muted-foreground sm:max-w-none">
                        {p.season && `${p.season} · `}{p.teams.map(teamCode).join(' → ')}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="h-11 border-b px-2 text-right font-semibold">{formatPoints(p.points)}</td>
                {seasons && <td className="h-11 border-b px-2 text-right">{p.seasons}</td>}
                <td className="h-11 border-b px-2 text-right">{p.starts}</td>
                <td className="h-11 border-b px-2 text-right">{p.gp}</td>
                <td className="h-11 border-b px-2 text-right">{p.gp ? (p.points / p.gp).toFixed(1) : '–'}</td>
                {salary && <td className="h-11 border-b px-2 text-right">{p.salary ? formatSalary(p.salary) : '–'}</td>}
                {salary && <td className="h-11 border-b px-2 text-right">{p.salary ? Math.round(p.points / (p.salary / 1e6)).toLocaleString() : '–'}</td>}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** Overlapping logos of every team a player scored for (at most 3, then a count). */
function TeamLogos({ teams }: { teams: string[] }) {
  return (
    <span className="flex shrink-0 items-center -space-x-2">
      {teams.slice(0, 3).map(t => <TeamLogo key={t} teamName={t} size={22} />)}
      {teams.length > 3 && <span className="pl-2.5 text-xs text-muted-foreground">+{teams.length - 3}</span>}
    </span>
  )
}

function TableCard({ title, note, children }: { title: string; note: ReactNode; children: ReactNode }) {
  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{note}</CardDescription>
      </CardHeader>
      <CardContent className="px-0 sm:px-6">{children}</CardContent>
    </Card>
  )
}

export function PlayerLeadersWidget({ selectedTeam }: { selectedTeam: string }) {
  const { view, data } = usePlayersView()
  if (!data) return view

  return (
    <div className="w-full space-y-4">
      <Card className="w-full">
        <Intro
          title="Season leaders"
          explainer={
            <p>
              Points count only while the player was in a lineup: a bench period adds nothing. <strong>Starts</strong>:
              periods in a lineup; <strong>GP</strong>: the NBA games played in them; <strong>Per game</strong>:
              points per game played. A player traded during the season shows every team they scored for.
            </p>
          }
        >
          The top {data.leaders.length} scorers for their fantasy teams, regular season through {data.meta.periods} periods.
          {selectedTeam && ' Your team’s players are highlighted.'}
        </Intro>
        <CardContent className="px-0 sm:px-6">
          <LeadersTable rows={data.leaders} selectedTeam={selectedTeam} />
        </CardContent>
      </Card>
      {data.playoffs && (
        <TableCard title="Playoff leaders" note="Points in the playoffs (Swiss stage and knockout), for teams still playing.">
          <LeadersTable rows={data.playoffs.leaders} selectedTeam={selectedTeam} />
        </TableCard>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Best periods

export function PeriodList({ title, note, rows, selectedTeam }: {
  title: string;
  note: string;
  rows: (PlayerPeriod | SeasonPlayerPeriod)[];
  selectedTeam: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{note}</CardDescription>
      </CardHeader>
      <CardContent className="px-3 sm:px-6">
        <ol className="space-y-1">
          {rows.map((p, i) => (
            <li
              key={`${'season' in p ? p.season : ''}-${p.period}-${p.team}-${p.player_id}`}
              className={cn('flex items-center gap-2 rounded-md px-1.5 py-1.5', p.team === selectedTeam && 'bg-muted')}
            >
              <span className="w-5 shrink-0 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
              <TeamLogo teamName={p.team} size={24} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <PlayerName id={p.player_id} name={p.player} className="text-sm font-medium" />
                <div className="truncate text-xs text-muted-foreground">
                  {'season' in p && `${p.season} · `}{p.team} · P{p.period} · {games(p.gp)}
                </div>
              </div>
              <span className="shrink-0 text-right text-base font-bold tabular-nums">{formatFpts(p.fpts)}</span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}

export function PlayerPeriodsWidget({ selectedTeam }: { selectedTeam: string }) {
  const { view, data } = usePlayersView()
  if (!data) return view

  return (
    <div className="w-full space-y-4">
      <Card>
        <Intro
          title="Best periods"
          explainer={
            <p>
              A period is half a week (Mon–Thu or Fri–Sun), so a player has 1 to 4 NBA games in it, and the long
              All-Star period has more. The number of games is shown with each score.
            </p>
          }
        >
          The biggest single-period scores by one player, regular season{data.playoffs ? ' and playoffs' : ''}.
          {selectedTeam && ' Your team is highlighted.'}
        </Intro>
      </Card>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <PeriodList
          title="In the lineup"
          note="Points that counted."
          rows={data.best_periods}
          selectedTeam={selectedTeam}
        />
        <PeriodList
          title="Left on the bench"
          note="Big games by players who weren’t in the lineup."
          rows={data.best_bench}
          selectedTeam={selectedTeam}
        />
        {data.playoffs && (
          <PeriodList
            title="In the playoffs"
            note="The biggest playoff periods."
            rows={data.playoffs.best_periods}
            selectedTeam={selectedTeam}
          />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Teams

type TeamSort = 'points' | 'bench_points' | 'bench_share' | 'top_share' | 'continuity'

function SortHeader({ id, sort, onSort, children }: {
  id: TeamSort; sort: TeamSort; onSort: (id: TeamSort) => void; children: ReactNode
}) {
  return (
    <th className="h-10 whitespace-nowrap border-b px-2 text-right font-medium" aria-sort={sort === id ? 'descending' : undefined}>
      <button
        type="button"
        onClick={() => onSort(id)}
        className={cn('inline-flex items-center gap-1 hover:text-foreground', sort === id && 'text-foreground')}
      >
        {children}
        {sort === id && <ArrowDown className="h-3 w-3" />}
      </button>
    </th>
  )
}

export function PlayerTeamsWidget({ selectedTeam }: { selectedTeam: string }) {
  const { view, data } = usePlayersView()
  const [sort, setSort] = useState<TeamSort>('bench_points')
  // Continuity is worked out over seasons (alltime.json); none for the first season
  const { data: alltime } = useAllTimePlayers()
  if (!data) return view

  const continuity = alltime?.continuity[data.meta.season]
  const rows = data.teams.map(t => ({
    ...t,
    bench_share: t.bench_points / (t.points + t.bench_points || 1),
    top_share: t.top_scorer.points / (t.points || 1),
    continuity: continuity?.[t.team] ?? -1,
  })).sort((a, b) => b[sort] - a[sort])

  return (
    <Card className="w-full">
      <Intro
        title="Teams"
        explainer={
          <>
            <p>
              <strong>Bench</strong>: points scored by players on the bench, which didn&apos;t count. Injured reserve
              and minors are left out. <strong>Bench %</strong>: the bench&apos;s share of all the points the
              roster scored. A high number can mean a deep roster or lineups that missed.
            </p>
            <p>
              <strong>Top scorer</strong>: the player with the most points for the team in its lineup, and their share
              of the team&apos;s points.
            </p>
            <p>
              <strong>Kept</strong>: the share of the team&apos;s lineup points scored by players who were on its
              roster at the end of last regular season. Low means a rebuilt lineup (trades, free agency, the draft).
            </p>
          </>
        }
      >
        Each team&apos;s lineup points, the points left on its bench, and its top scorer. Sort by any number column.
      </Intro>
      <CardContent className="px-0 sm:px-6">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-muted-foreground">
                <th className="sticky left-0 z-10 h-10 border-b bg-card px-2 text-left font-medium">Team</th>
                <SortHeader id="points" sort={sort} onSort={setSort}>Points</SortHeader>
                <SortHeader id="bench_points" sort={sort} onSort={setSort}>Bench</SortHeader>
                <SortHeader id="bench_share" sort={sort} onSort={setSort}>Bench %</SortHeader>
                <th className="h-10 border-b px-2 text-left font-medium">Top scorer</th>
                <SortHeader id="top_share" sort={sort} onSort={setSort}>Share</SortHeader>
                {continuity && <SortHeader id="continuity" sort={sort} onSort={setSort}>Kept</SortHeader>}
              </tr>
            </thead>
            <tbody className="[&_tr:last-child_td]:border-0">
              {rows.map(t => {
                const mine = t.team === selectedTeam
                return (
                  <tr key={t.team} className={cn(mine && 'bg-muted font-semibold')}>
                    <td className={cn('sticky left-0 z-10 h-11 border-b px-2', mine ? 'bg-muted' : 'bg-card')}>
                      <div className="flex items-center gap-2">
                        <TeamLogo teamName={t.team} size={24} className="shrink-0" />
                        <span className="md:hidden">{teamCode(t.team)}</span>
                        <span className="hidden whitespace-nowrap md:inline">{t.team}</span>
                      </div>
                    </td>
                    <td className="h-11 border-b px-2 text-right">{formatPoints(t.points)}</td>
                    <td className="h-11 border-b px-2 text-right">{formatPoints(t.bench_points)}</td>
                    <td className="h-11 border-b px-2 text-right">{(t.bench_share * 100).toFixed(1)}%</td>
                    <td className="h-11 whitespace-nowrap border-b px-2 text-left">
                      <span className="flex items-baseline">
                        <PlayerName id={t.top_scorer.player_id} name={t.top_scorer.player} />
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">{formatPoints(t.top_scorer.points)}</span>
                      </span>
                    </td>
                    <td className="h-11 border-b px-2 text-right">{(t.top_share * 100).toFixed(1)}%</td>
                    {continuity && <td className="h-11 border-b px-2 text-right">{t.continuity >= 0 ? `${Math.round(t.continuity * 100)}%` : '–'}</td>}
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

// ---------------------------------------------------------------- All-time

/** A two-option segmented switch (like Franchises → Season by season). */
function Toggle<T extends string>({ value, options, onChange, label }: {
  value: T; options: [T, string][]; onChange: (value: T) => void; label: string
}) {
  return (
    <div className="inline-flex shrink-0 rounded-md bg-muted p-1 text-sm" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={cn('rounded-sm px-3 py-1 font-medium text-muted-foreground', value === v && 'bg-background text-foreground shadow-xs')}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

/** A ranked list row: rank, logos, a clickable name with a detail line, and the number on the right. */
function RankRow({ rank, teams, id, name, detail, value, mine }: {
  rank: number; teams: string[]; id: string; name: string; detail: ReactNode; value: ReactNode; mine?: boolean
}) {
  return (
    <li className={cn('flex items-center gap-2 rounded-md px-1.5 py-1.5', mine && 'bg-muted')}>
      <span className="w-5 shrink-0 text-xs text-muted-foreground tabular-nums">{rank}</span>
      {teams.length === 1 ? <TeamLogo teamName={teams[0]} size={24} className="shrink-0" /> : <TeamLogos teams={teams} />}
      <div className="min-w-0 flex-1">
        <PlayerName id={id} name={name} className="text-sm font-medium" />
        <div className="truncate text-xs text-muted-foreground">{detail}</div>
      </div>
      <span className="shrink-0 text-right text-base font-bold tabular-nums">{value}</span>
    </li>
  )
}

function ListCard({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{note}</CardDescription>
      </CardHeader>
      <CardContent className="px-3 sm:px-6">
        <ol className="space-y-1">{children}</ol>
      </CardContent>
    </Card>
  )
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const span = (first: string, last: string) => (first === last ? first : `${first} to ${last}`)

function FranchiseCard({ data, records, franchise, teams, onPick, counted }: {
  data: AllTimePlayers; records: AllTimePlayers['with_playoffs']; franchise: string; teams: string[];
  onPick: (team: string) => void; counted: string
}) {
  const [by, setBy] = useState<'points' | 'starts'>('points')
  return (
    <TableCard
      title="Franchise scorers"
      note={by === 'points'
        ? `A franchise's top scorers: points for that team, over every season (${counted}).`
        : "A franchise's longest-serving players: most starts for that team (regular season)."}
    >
      <div className="mb-3 flex flex-col gap-2 px-3 sm:flex-row sm:items-center sm:px-0">
        <select
          value={franchise}
          onChange={e => onPick(e.target.value)}
          className="h-9 w-full rounded-md border bg-background px-2 text-sm sm:w-72"
          aria-label="Franchise"
        >
          {teams.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <Toggle value={by} onChange={setBy} label="Rank by" options={[['points', 'Points'], ['starts', 'Starts']]} />
      </div>
      <ol className="space-y-1 px-3 sm:px-0">
        {by === 'points'
          ? records.franchises[franchise].map((p, i) => (
            <RankRow
              key={p.player_id} rank={i + 1} teams={[franchise]} id={p.player_id} name={p.player}
              detail={`${plural(p.seasons, 'season')} · ${p.starts} starts · ${p.gp ? (p.points / p.gp).toFixed(1) : '–'} per game${p.salary ? ` · ${formatSalary(p.salary)} paid` : ''}`}
              value={formatPoints(p.points)}
            />
          ))
          : (data.franchise_starts[franchise] ?? []).map((p, i) => (
            <RankRow
              key={p.player_id} rank={i + 1} teams={[franchise]} id={p.player_id} name={p.player}
              detail={`${span(p.first, p.last)} · ${formatPoints(p.points)} points`}
              value={<>{p.starts}<span className="ml-1 text-xs font-normal text-muted-foreground">starts</span></>}
            />
          ))}
      </ol>
    </TableCard>
  )
}

export function PlayerAllTimeWidget({ selectedTeam }: { selectedTeam: string }) {
  const { data, isLoading, error } = useAllTimePlayers()
  const teams = data ? Object.keys(data.franchises) : []
  const [picked, setPicked] = useState<string | null>(null)
  const [withPlayoffs, setWithPlayoffs] = useState(false)
  if (isLoading) return <WidgetSkeleton variant="list" />
  if (error) return <ErrorState />
  if (!data) {
    return (
      <Card className="w-full">
        <CardContent className="p-8 text-center text-sm text-muted-foreground">No player data yet.</CardContent>
      </Card>
    )
  }
  const franchise = picked ?? (teams.includes(selectedTeam) ? selectedTeam : teams[0])
  const seasons = data.meta.seasons
  const records = withPlayoffs ? data.with_playoffs : data
  const counted = withPlayoffs ? 'regular season and playoffs' : 'regular season'

  return (
    <div className="w-full space-y-4">
      <Card>
        <Intro
          title="All-time player records"
          explainer={
            <>
              <p>
                Points count only while a player was in a lineup. Franchises are matched by team name across
                seasons; a franchise&apos;s scorers count only the points scored for it. &quot;With
                playoffs&quot; adds playoff points to the franchise, career, season and period lists; the other
                lists are always the regular season.
              </p>
              <p>
                <strong>Salary</strong>: what was paid. Each period on a roster (any slot) costs a share of
                that season&apos;s salary, so a full season costs it once, and a player cut, picked up or traded
                during a season is split between the teams. The season in progress counts what was paid so far.
                <strong> Per $1M</strong>: points per $1M paid.
              </p>
              <p>
                <strong>Best value</strong>: a season&apos;s points per $1M paid. <strong>Share of team points</strong>: a player&apos;s
                points for a team in a season, as a share of the team&apos;s lineup points. Both need at least 12
                starts that season.
              </p>
            </>
          }
        >
          Every season since {seasons[0]} ({seasons.length} seasons). Every season, not just the one picked above.
          Click a player for their career.{selectedTeam && ' Your team is highlighted.'}
        </Intro>
        <CardContent className="pt-0">
          <Toggle
            value={withPlayoffs ? 'with' : 'regular'}
            onChange={v => setWithPlayoffs(v === 'with')}
            label="Points counted"
            options={[['regular', 'Regular season'], ['with', 'With playoffs']]}
          />
        </CardContent>
      </Card>

      <FranchiseCard data={data} records={records} franchise={franchise} teams={teams} onPick={setPicked} counted={counted} />

      <TableCard title="Career leaders" note={`Points over every season, for any team (${counted}).`}>
        <LeadersTable rows={records.career} selectedTeam={selectedTeam} seasons />
      </TableCard>

      <TableCard title="Best seasons" note={`A player's points in one season (${counted}).`}>
        <LeadersTable rows={records.best_seasons} selectedTeam={selectedTeam} />
      </TableCard>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <PeriodList title="Best periods" note={`The biggest single-period scores ever (${counted}).`} rows={records.best_periods} selectedTeam={selectedTeam} />
        <PeriodList title="Left on the bench" note="The biggest bench periods ever (regular season)." rows={data.best_bench} selectedTeam={selectedTeam} />

        <ListCard title="Longest-serving" note="Most starts for one franchise (regular season).">
          {data.longest_serving.map((p, i) => (
            <RankRow
              key={`${p.team}-${p.player_id}`} rank={i + 1} teams={[p.team]} id={p.player_id} name={p.player}
              mine={p.team === selectedTeam}
              detail={`${teamCode(p.team)} · ${span(p.first, p.last)}`}
              value={p.starts}
            />
          ))}
        </ListCard>
        <ListCard title="Journeymen" note="Most franchises started for (regular season).">
          {data.journeymen.map((p, i) => (
            <RankRow
              key={p.player_id} rank={i + 1} teams={p.teams} id={p.player_id} name={p.player}
              mine={p.teams.includes(selectedTeam)}
              detail={p.teams.map(teamCode).join(' → ')}
              value={p.teams.length}
            />
          ))}
        </ListCard>
        <ListCard title="Best value" note="A season's points per $1M of salary (at least 12 starts).">
          {data.best_value.map((p, i) => (
            <RankRow
              key={`${p.season}-${p.player_id}`} rank={i + 1} teams={p.teams} id={p.player_id} name={p.player}
              mine={p.teams.includes(selectedTeam)}
              detail={<span title={describeContract(p.contract)}>{p.season} · {formatPoints(p.points)} points · {formatSalary(p.salary)} {p.contract}</span>}
              value={formatPoints(p.per_million)}
            />
          ))}
        </ListCard>
        <ListCard title="Share of team points" note="A player's share of a team's lineup points in a season (at least 12 starts).">
          {data.team_share.map((p, i) => (
            <RankRow
              key={`${p.season}-${p.team}-${p.player_id}`} rank={i + 1} teams={[p.team]} id={p.player_id} name={p.player}
              mine={p.team === selectedTeam}
              detail={`${p.season} · ${teamCode(p.team)} · ${formatPoints(p.points)} of ${formatPoints(p.team_points)}`}
              value={`${(p.share * 100).toFixed(1)}%`}
            />
          ))}
        </ListCard>

        <PeriodList title="Playoff periods" note="The biggest playoff periods ever." rows={data.playoffs.best_periods} selectedTeam={selectedTeam} />
      </div>

      <TableCard title="Playoff career leaders" note="Playoff points over every season.">
        <LeadersTable rows={data.playoffs.career} selectedTeam={selectedTeam} seasons />
      </TableCard>
    </div>
  )
}
