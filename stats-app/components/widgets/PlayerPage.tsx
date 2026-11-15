import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { WidgetSkeleton } from './WidgetSkeleton'
import { TeamLogo } from './TeamLogo'
import { ErrorState } from './ErrorState'
import { Explainer } from './Explainer'
import { PlayerIndexEntry, PlayerPage, describeContract, formatFpts, formatSalary, usePlayerIndex, usePlayerPage } from '@/lib/players'
import { useSelectedPlayer } from '@/lib/selected-player'
import { formatPoints } from '@/lib/standings'
import { teamCode } from '@/lib/teams'
import { cn } from '@/lib/utils'

// Players → Player: search any player who was ever on a roster, and their
// career in the league season by season. The start of the player lineage
// (ROADMAP.md, section 3): trades and draft picks come later.

/** Lowercase without accents, so "jokic" finds "Jokić". */
const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const perGame = (points: number, gp: number) => (gp ? (points / gp).toFixed(1) : '–')

function PlayerSearch({ players, onPick }: { players: PlayerIndexEntry[]; onPick: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const matches = useMemo(() => {
    const q = fold(query.trim())
    if (!q) return []
    // Names that start with the query first, then any other match; each by career points
    const hits = players.filter(p => fold(p.player).includes(q))
    return [...hits.filter(p => fold(p.player).startsWith(q)), ...hits.filter(p => !fold(p.player).startsWith(q))].slice(0, 8)
  }, [players, query])

  const pick = (id: string) => {
    onPick(id)
    setQuery('')
  }

  return (
    <div className="relative w-full sm:w-96">
      <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <input
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && matches[0]) pick(matches[0].player_id) }}
        placeholder={`Search ${players.length.toLocaleString()} players`}
        aria-label="Search players"
        className="h-9 w-full rounded-md border bg-background pl-8 pr-2 text-sm"
      />
      {matches.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
          {matches.map(p => (
            <li key={p.player_id}>
              <button
                type="button"
                onClick={() => pick(p.player_id)}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-muted focus:bg-muted focus:outline-hidden"
              >
                <TeamLogo teamName={p.team} size={20} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate font-medium">{p.player}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{teamCode(p.team)} · {p.season}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  )
}

function Career({ page, selectedTeam, currentSeason }: { page: PlayerPage; selectedTeam: string; currentSeason: string }) {
  const seasons = page.seasons
  const sum = (key: 'points' | 'starts' | 'gp' | 'playoff_points' | 'playoff_starts' | 'bench_points') =>
    seasons.reduce((total, s) => total + s[key], 0)
  const points = sum('points'), gp = sum('gp')
  const teams = [...new Set(seasons.map(s => s.team))]
  const latest = seasons[seasons.length - 1]
  const seasonCount = new Set(seasons.map(s => s.season)).size
  const playoffPoints = sum('playoff_points')
  const paid = seasons.reduce((total, s) => total + s.paid, 0)

  return (
    <>
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-3">
            <TeamLogo teamName={latest.team} size={44} className="shrink-0" eager />
            <div className="min-w-0">
              <CardTitle className="truncate text-2xl">{page.player}</CardTitle>
              <CardDescription>
                {latest.season === currentSeason ? latest.team : `Last on a roster: ${latest.team}, ${latest.season}`} · {seasonCount} season{seasonCount === 1 ? '' : 's'} in the league
                {teams.length > 1 && `, ${teams.length} teams`}
              </CardDescription>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label="Points" value={formatPoints(points)} sub="Regular season, in a lineup" />
            <Stat label="Starts" value={String(sum('starts'))} sub={`${gp} games · ${perGame(points, gp)} per game`} />
            <Stat label="Playoffs" value={formatPoints(playoffPoints)} sub={`${sum('playoff_starts')} starts`} />
            <Stat label="Salary paid" value={formatSalary(paid)} sub={paid ? `${Math.round(points / (paid / 1e6)).toLocaleString()} points per $1M` : undefined} />
            <Stat label={latest.season === currentSeason ? 'Contract' : 'Last contract'} value={formatSalary(latest.salary)} sub={describeContract(latest.contract)} />
          </div>
          <Explainer>
            <p>
              One row per season and team. Points, starts and games count while the player was in the lineup
              in the regular season; Playoffs is the same for the playoffs; Bench is the points scored on the
              bench (regular season). Periods is the number of periods on the roster, any slot (injured reserve and
              minors too), playoffs included. Salary and contract are from the last period with the team; Paid is the salary
              times the share of the season&apos;s periods on the roster (so far, for the season in progress).
            </p>
            <p className="mt-2">
              Contracts: R1x and R2x are rookie contracts (1st and 2nd round) with x years left, REGx a contract
              with x years left, FA a free-agent signing.
            </p>
          </Explainer>
        </CardHeader>
      </Card>

      <Card className="w-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Season by season</CardTitle>
          <CardDescription>Every season and team, oldest first. {selectedTeam && 'Seasons with your team are highlighted.'}</CardDescription>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <div className="w-full overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="sticky left-0 z-10 h-10 border-b bg-card px-2 text-left font-medium">Season</th>
                  <th className="h-10 border-b px-2 text-right font-medium">Points</th>
                  <th className="h-10 border-b px-2 text-right font-medium">Starts</th>
                  <th className="h-10 border-b px-2 text-right font-medium">GP</th>
                  <th className="h-10 whitespace-nowrap border-b px-2 text-right font-medium">Per game</th>
                  <th className="h-10 border-b px-2 text-right font-medium">Playoffs</th>
                  <th className="h-10 border-b px-2 text-right font-medium">Bench</th>
                  <th className="h-10 border-b px-2 text-right font-medium">Periods</th>
                  <th className="h-10 border-b px-2 text-right font-medium">Salary</th>
                  <th className="h-10 border-b px-2 text-right font-medium">Paid</th>
                  <th className="h-10 border-b px-2 text-left font-medium">Contract</th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child_td]:border-0">
                {seasons.map(s => {
                  const mine = s.team === selectedTeam
                  return (
                    <tr key={`${s.season}-${s.team}`} className={cn(mine && 'bg-muted font-semibold')}>
                      <td className={cn('sticky left-0 z-10 h-11 border-b px-2', mine ? 'bg-muted' : 'bg-card')}>
                        <div className="flex items-center gap-2">
                          <TeamLogo teamName={s.team} size={22} className="shrink-0" />
                          <div className="whitespace-nowrap">
                            <div>{s.season}</div>
                            <div className="text-xs font-normal text-muted-foreground">{teamCode(s.team)}</div>
                          </div>
                        </div>
                      </td>
                      <td className="h-11 border-b px-2 text-right font-semibold">{formatPoints(s.points)}</td>
                      <td className="h-11 border-b px-2 text-right">{s.starts}</td>
                      <td className="h-11 border-b px-2 text-right">{s.gp}</td>
                      <td className="h-11 border-b px-2 text-right">{perGame(s.points, s.gp)}</td>
                      <td className="h-11 border-b px-2 text-right">{s.playoff_starts ? formatPoints(s.playoff_points) : '–'}</td>
                      <td className="h-11 border-b px-2 text-right">{s.bench_points ? formatPoints(s.bench_points) : '–'}</td>
                      <td className="h-11 border-b px-2 text-right">{s.periods}</td>
                      <td className="h-11 border-b px-2 text-right">{formatSalary(s.salary)}</td>
                      <td className="h-11 border-b px-2 text-right">{formatSalary(s.paid)}</td>
                      <td className="h-11 border-b px-2 text-left" title={describeContract(s.contract)}>{s.contract}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {page.best_periods.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Best periods</CardTitle>
            <CardDescription>The biggest periods in a lineup, regular season or playoffs.</CardDescription>
          </CardHeader>
          <CardContent className="px-3 sm:px-6">
            <ol className="space-y-1">
              {page.best_periods.map((p, i) => (
                <li
                  key={`${p.season}-${p.period}`}
                  className={cn('flex items-center gap-2 rounded-md px-1.5 py-1.5', p.team === selectedTeam && 'bg-muted')}
                >
                  <span className="w-5 shrink-0 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                  <TeamLogo teamName={p.team} size={24} className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {p.season}, P{p.period}
                      {p.playoffs && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">Playoffs</span>}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{p.team} · {p.gp} game{p.gp === 1 ? '' : 's'}</div>
                  </div>
                  <span className="shrink-0 text-right text-base font-bold tabular-nums">{formatFpts(p.fpts)}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </>
  )
}

export function PlayerPageWidget({ selectedTeam }: { selectedTeam: string }) {
  const { playerId, setPlayer } = useSelectedPlayer()
  const index = usePlayerIndex()
  const page = usePlayerPage(playerId)

  if (index.isLoading) return <WidgetSkeleton variant="list" />
  if (index.error) return <ErrorState />
  const players = index.data ?? []
  if (!players.length) {
    return (
      <Card className="w-full">
        <CardContent className="p-8 text-center text-sm text-muted-foreground">No player data yet.</CardContent>
      </Card>
    )
  }

  // Before a pick: the viewer's current roster, else the career leaders
  const latest = players.reduce((max, p) => (p.season > max ? p.season : max), '')
  const roster = selectedTeam ? players.filter(p => p.team === selectedTeam && p.season === latest) : []
  const suggestions = (roster.length ? roster : players).slice(0, 12)

  return (
    <div className="w-full space-y-4">
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Player</CardTitle>
              <CardDescription>Any player who was ever on a roster, since 2019-20. Click a name anywhere to open it here.</CardDescription>
            </div>
            <PlayerSearch players={players} onPick={setPlayer} />
          </div>
          {!playerId && (
            <div>
              <div className="mb-2 text-sm font-medium">{roster.length ? 'Your roster' : 'Career leaders'}</div>
              <div className="flex flex-wrap gap-2">
                {suggestions.map(p => (
                  <button
                    key={p.player_id}
                    type="button"
                    onClick={() => setPlayer(p.player_id)}
                    className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm hover:bg-muted"
                  >
                    <TeamLogo teamName={p.team} size={18} />
                    {p.player}
                  </button>
                ))}
              </div>
            </div>
          )}
          {playerId && (
            <button
              type="button"
              onClick={() => setPlayer(null)}
              className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" /> Clear
            </button>
          )}
        </CardHeader>
      </Card>

      {playerId && page.isLoading && <WidgetSkeleton variant="list" />}
      {playerId && page.error && <ErrorState />}
      {playerId && !page.isLoading && !page.error && !page.data && (
        <Card className="w-full">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">No player with this link.</CardContent>
        </Card>
      )}
      {page.data && <Career page={page.data} selectedTeam={selectedTeam} currentSeason={latest} />}
    </div>
  )
}
