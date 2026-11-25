import { ReactNode, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { WidgetSkeleton } from './WidgetSkeleton'
import { TeamLogo } from './TeamLogo'
import { ErrorState } from './ErrorState'
import { Explainer } from './Explainer'
import { PlayerName } from './PlayerName'
import { Select } from './PlayersWidgets'
import { DraftPick, Drafter, DraftMetric, PickRef, useDraftIndex, useDrafts } from '@/lib/draft'
import { describeContract, formatSalary } from '@/lib/players'
import { formatPoints } from '@/lib/standings'
import { teamCode } from '@/lib/teams'
import { cn } from '@/lib/utils'

export const TH = 'h-10 whitespace-nowrap border-b px-2 text-right font-medium'
export const TD = 'h-11 whitespace-nowrap border-b px-2 text-right'
const PAGE = 30
const ALL = 'all'

export type Sort<K extends string> = { key: K; desc: boolean }

/** A column heading that sorts by its key; a second click flips the order */
export function SortHead<K extends string>({ k, sort, setSort, children, className, ascFirst }: {
  k: K; sort: Sort<K>; setSort: (s: Sort<K>) => void; children: ReactNode; className?: string; ascFirst?: boolean;
}) {
  const on = sort.key === k
  return (
    <th className={cn(TH, className)} aria-sort={on ? (sort.desc ? 'descending' : 'ascending') : undefined}>
      <button type="button" onClick={() => setSort({ key: k, desc: on ? !sort.desc : !ascFirst })}
              className={cn('inline-flex items-center gap-1 hover:text-foreground', on && 'text-foreground')}>
        {children}
        {on && (sort.desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
      </button>
    </th>
  )
}

export function formatValue(v: number, metric: DraftMetric): string {
  return metric === 'salary' ? formatSalary(v) : formatPoints(v)
}

export function formatVs(v: number, metric: DraftMetric): string {
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatValue(Math.abs(v), metric)}`
}

export const vsColor = (v: number | null) => v == null || Math.abs(v) < 1e-9 ? '' : v > 0 ? 'text-lucky' : 'text-very-unlucky'

// --- The picks ---

type PickKey = 'pick' | 'value' | 'score' | 'rookie_points' | 'points' | 'total' | 'starts' | 'earned' | 'team_points'

const PICK_VALUE: Record<PickKey, (p: DraftPick) => number | null> = {
  pick: p => p.pick,
  value: p => p.value,
  score: p => p.score,
  rookie_points: p => p.rookie_points,
  points: p => p.points,
  total: p => p.points + p.playoff_points,
  starts: p => p.starts,
  earned: p => p.earned,
  team_points: p => p.team_points,
}

/** A drafted player's seasons since the draft */
export function PickHistory({ p }: { p: DraftPick }) {
  if (!p.history.length) return <p className="px-2 pb-3 text-xs text-muted-foreground">Never on a roster.</p>
  return (
    <div className="w-full overflow-x-auto pb-3">
      <table className="text-xs tabular-nums">
        <thead>
          <tr className="text-muted-foreground">
            <th className="h-8 border-b px-2 text-left font-medium">Season</th>
            <th className="h-8 border-b px-2 text-left font-medium">Team</th>
            <th className="h-8 border-b px-2 text-left font-medium">Contract</th>
            <th className="h-8 border-b px-2 text-right font-medium">Salary</th>
            <th className="h-8 border-b px-2 text-right font-medium">Points</th>
            <th className="h-8 border-b px-2 text-right font-medium">Starts</th>
            <th className="h-8 border-b px-2 text-right font-medium">Playoffs</th>
          </tr>
        </thead>
        <tbody className="[&_tr:last-child_td]:border-0">
          {p.history.map(h => (
            <tr key={h.season}>
              <td className="h-8 border-b px-2">{h.season}</td>
              <td className="h-8 border-b px-2">
                <span className="flex items-center gap-1">
                  {h.teams.map(t => <TeamLogo key={t} teamName={t} size={16} />)}
                  <span>{h.teams.map(teamCode).join(', ')}</span>
                </span>
              </td>
              <td className="h-8 border-b px-2" title={h.contract ? describeContract(h.contract) : undefined}>
                {h.contract.startsWith('R') && !h.contract.startsWith('REG') ? 'Rookie' : h.contract || '–'}
              </td>
              <td className="h-8 border-b px-2 text-right">{h.salary ? formatSalary(h.salary) : '–'}</td>
              <td className="h-8 border-b px-2 text-right">{formatPoints(h.points)}</td>
              <td className="h-8 border-b px-2 text-right">{h.starts}</td>
              <td className="h-8 border-b px-2 text-right">{h.playoff_starts ? `${formatPoints(h.playoff_points)} (${h.playoff_starts})` : '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PickRow({ p, all, selectedTeam, cols }: { p: DraftPick; all: boolean; selectedTeam: string; cols: number }) {
  const [open, setOpen] = useState(false)
  const mine = p.team === selectedTeam
  const bg = mine ? 'bg-muted' : 'bg-card'
  return (
    <>
      <tr className={cn(mine && 'bg-muted font-semibold')}>
        <td className={cn(TD, 'text-left')}>
          <div>{p.pick}</div>
          <div className="text-xs font-normal text-muted-foreground">{all ? p.season : `R${p.round} #${p.slot}`}</div>
        </td>
        <td className={cn('sticky left-0 z-10 h-11 border-b px-2', bg)}>
          <div className="flex items-center gap-2">
            <TeamLogo teamName={p.team} size={22} className="hidden shrink-0 sm:block" />
            <div className="min-w-0">
              {p.player_id && p.player
                ? <PlayerName id={p.player_id} name={p.player} className="max-w-32 sm:max-w-none" />
                : <span className="text-muted-foreground">{p.player ?? 'Pick not used'}</span>}
              <div className="max-w-32 truncate text-xs font-normal text-muted-foreground sm:max-w-none">
                {teamCode(p.team)}
                {p.redraft && <> · placeholder, drafted in {p.redraft}: a miss</>}
              </div>
            </div>
            {p.player_id && !p.redraft && (
              <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} title="Seasons since the draft"
                      className="ml-auto shrink-0 rounded p-1 text-muted-foreground hover:bg-muted">
                <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
              </button>
            )}
          </div>
        </td>
        <td className={TD}>{p.value == null ? '–' : formatValue(p.value, p.metric)}</td>
        <td className={cn(TD, vsColor(p.vs_slot))} title={p.expected != null ? `The slot usually gives ${formatValue(p.expected, p.metric)}` : undefined}>
          {p.vs_slot == null ? '–' : formatVs(p.vs_slot, p.metric)}
        </td>
        <td className={TD}>{formatPoints(p.rookie_points)}</td>
        <td className={TD}>{formatPoints(p.points)}</td>
        <td className={TD}>{formatPoints(p.points + p.playoff_points)}</td>
        <td className={TD}>{p.starts}{p.playoff_starts > 0 && <span className="text-muted-foreground"> +{p.playoff_starts}</span>}</td>
        <td className={TD}>{p.earned ? formatSalary(p.earned) : '–'}</td>
        <td className={TD}>{formatPoints(p.team_points)}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={cols} className="border-b bg-muted/30 px-2 pt-2">
            <div className="sticky left-0 max-w-[calc(100vw-3rem)]"><PickHistory p={p} /></div>
          </td>
        </tr>
      )}
    </>
  )
}

function Picks({ seasons, selectedTeam }: { seasons: { season: string; metric: DraftMetric; in_progress: boolean }[]; selectedTeam: string }) {
  const [season, setSeason] = useState(seasons[0].season)
  const [round, setRound] = useState('0')
  const [sort, setSort] = useState<Sort<PickKey>>({ key: 'pick', desc: false })
  const [shown, setShown] = useState(PAGE)
  const all = season === ALL
  const { drafts, isLoading, error } = useDrafts(all ? seasons.filter(s => !s.in_progress).map(s => s.season) : [season])
  const meta = seasons.find(s => s.season === season)
  const metric: DraftMetric | null = all ? null : meta?.metric ?? null

  const picks = drafts.flatMap(d => d.picks).filter(p => round === '0' || p.round === Number(round))
  const get = PICK_VALUE[all && sort.key === 'value' ? 'score' : sort.key]
  const sorted = [...picks].sort((a, b) => {
    const x = get(a), y = get(b)
    if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1   // unused picks last
    return (sort.desc ? y - x : x - y) || a.season.localeCompare(b.season) || a.pick - b.pick
  })
  const reset = (f: () => void) => { f(); setShown(PAGE) }
  const head = (k: PickKey, label: ReactNode, ascFirst?: boolean, className?: string) => (
    <SortHead k={k} sort={sort} setSort={s => reset(() => setSort(s))} ascFirst={ascFirst} className={className}>{label}</SortHead>
  )

  return (
    <Card className="w-full">
      <CardHeader className="space-y-2">
        <CardTitle>Draft</CardTitle>
        <CardDescription>
          Every pick and what the player became. Sort by any column heading; open a player for the seasons since.
        </CardDescription>
        <Explainer>
          <p>
            <strong>Value</strong> is the average salary after the rookie deal (3 seasons): the league&apos;s own price
            for the player, $0 when nobody signed him. A draft is measured this way once its 4th season has started;
            the newer ones by <strong>points</strong> instead: regular-season points on any roster, lineup or bench, so
            neither the lineup calls nor a playoff run of the team holding him count.
          </p>
          <p>
            <strong>vs slot</strong>: the value minus what the slot usually gives (the picks two either side of it in
            every draft; for points, over the same number of seasons played). A #50 pick who became a starter beats his
            slot by far more than a #3 who became one. A pick spent on a player drafted before (a placeholder for a rookie
            not in Fantrax yet) or on a retired one counts as a miss.
          </p>
          <p>
            <strong>Rookie pts</strong>: lineup points in the regular season, first 3 seasons; <strong>Reg. pts</strong>:
            every season since; <strong>Total</strong>: with the playoffs. <strong>Earned</strong>: salary paid by every
            team. <strong>For team</strong>: lineup points (playoffs too) for the team that drafted him.
          </p>
        </Explainer>
        <div className="flex flex-wrap gap-3 pt-1">
          <Select label="Draft" value={season} onChange={v => reset(() => { setSeason(v); if (v === ALL && sort.key === 'pick') setSort({ key: 'score', desc: true }) })}
                  options={[...seasons.map(s => [s.season, `${s.season}${s.in_progress ? ' (this season)' : ''}`] as [string, string]), [ALL, 'All drafts']]} />
          <Select label="Round" value={round} onChange={v => reset(() => setRound(v))}
                  options={[['0', 'Both'], ['1', '1st'], ['2', '2nd']]} />
        </div>
        {meta && (
          <p className="text-xs text-muted-foreground">
            {meta.metric === 'salary'
              ? 'Measured by the average salary after the rookie deal.'
              : `Measured by regular-season points on any roster${meta.in_progress ? ' so far (this season; not in the Drafters ranking yet)' : ' so far: the rookie deal isn\'t over'}.`}
          </p>
        )}
        {all && <p className="text-xs text-muted-foreground">Every draft but this season&apos;s (too early): Value and vs slot sort by the score (vs slot in average first-round picks), so salary and points drafts compare.</p>}
      </CardHeader>
      <CardContent className="px-0 sm:px-6">
        {error ? <ErrorState /> : isLoading ? <WidgetSkeleton variant="list" /> : (
          <>
            <div className="w-full overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="text-muted-foreground">
                    {head('pick', 'Pick', true, 'text-left')}
                    <th className="sticky left-0 z-10 h-10 border-b bg-card px-2 text-left font-medium">Player</th>
                    {head('value', metric === 'salary' ? 'Salary after' : metric === 'points' ? 'Points' : 'Value')}
                    {head('score', 'vs slot')}
                    {head('rookie_points', 'Rookie pts')}
                    {head('points', 'Reg. pts')}
                    {head('total', 'Total')}
                    {head('starts', 'Starts')}
                    {head('earned', 'Earned')}
                    {head('team_points', 'For team')}
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child_td]:border-0">
                  {sorted.slice(0, shown).map(p => (
                    <PickRow key={`${p.season}-${p.pick}`} p={p} all={all} selectedTeam={selectedTeam} cols={10} />
                  ))}
                </tbody>
              </table>
            </div>
            {sorted.length > shown && (
              <div className="px-4 pt-3 sm:px-0">
                <button type="button" onClick={() => setShown(n => n + PAGE)} className="text-sm font-medium text-primary hover:underline">
                  Show {Math.min(PAGE, sorted.length - shown)} more
                </button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

// --- The drafters ---

type TeamKey = 'score' | 'per_pick' | 'hits' | 'picks' | 'team_points' | 'kept'

const TEAM_VALUE: Record<TeamKey, (t: Drafter) => number> = {
  score: t => t.score,
  per_pick: t => t.per_pick,
  hits: t => t.hits / t.picks,
  picks: t => t.picks,
  team_points: t => t.team_points,
  kept: t => t.kept ?? -1,
}

function Ref({ r }: { r: PickRef }) {
  return (
    <div className="min-w-0 text-left">
      <PlayerName id={r.player_id} name={r.player} className="max-w-36 font-normal sm:max-w-44" />
      <div className="text-xs font-normal text-muted-foreground">
        {r.season} #{r.pick} · <span className={vsColor(r.score)}>{r.score > 0 ? '+' : ''}{r.score.toFixed(2)}</span>
      </div>
    </div>
  )
}

function Drafters({ teams, selectedTeam, drafts }: { teams: Drafter[]; selectedTeam: string; drafts: string }) {
  const [sort, setSort] = useState<Sort<TeamKey>>({ key: 'score', desc: true })
  const get = TEAM_VALUE[sort.key]
  const sorted = [...teams].sort((a, b) => (sort.desc ? get(b) - get(a) : get(a) - get(b)) || a.team.localeCompare(b.team))
  const head = (k: TeamKey, label: ReactNode) => <SortHead k={k} sort={sort} setSort={setSort}>{label}</SortHead>
  return (
    <Card className="w-full">
      <CardHeader className="space-y-2">
        <CardTitle className="text-lg">Drafters</CardTitle>
        <CardDescription>
          Which teams draft best: every pick compared with what its slot usually gives, drafts {drafts}.
        </CardDescription>
        <Explainer>
          <p>
            A pick&apos;s <strong>score</strong> is its value above (or below) its slot, in average first-round picks:
            +1.0 is one average first-rounder&apos;s worth more than the slot usually gives. That way the drafts measured
            by salary and by points add up, and a team that turns five late seconds into four misses and one star comes
            out ahead of one that spends five firsts on role players.
          </p>
          <p>
            <strong>Draft score</strong>: the picks&apos; scores added up (the team that made the pick, even one it traded
            for); <strong>Per pick</strong>: on average; <strong>Hits</strong>: picks above their slot. <strong>For
            team</strong>: lineup points its picks scored for it, and <strong>Kept</strong> the share of all their points
            (any team) that was: a good drafter who trades his picks away keeps little. This season&apos;s draft is too
            early to count.
          </p>
        </Explainer>
      </CardHeader>
      <CardContent className="px-0 sm:px-6">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-muted-foreground">
                <th className="h-10 w-8 border-b px-2 text-right font-medium">#</th>
                <th className="sticky left-0 z-10 h-10 border-b bg-card px-2 text-left font-medium">Team</th>
                {head('score', 'Draft score')}
                {head('per_pick', 'Per pick')}
                {head('hits', 'Hits')}
                {head('picks', 'Picks')}
                <th className={cn(TH, 'text-left')}>Best pick</th>
                <th className={cn(TH, 'text-left')}>Worst pick</th>
                {head('team_points', 'For team')}
                {head('kept', 'Kept')}
              </tr>
            </thead>
            <tbody className="[&_tr:last-child_td]:border-0">
              {sorted.map((t, i) => {
                const mine = t.team === selectedTeam
                return (
                  <tr key={t.team} className={cn(mine && 'bg-muted font-semibold')}>
                    <td className="h-12 border-b px-2 text-right text-xs text-muted-foreground">{i + 1}</td>
                    <td className={cn('sticky left-0 z-10 h-12 border-b px-2', mine ? 'bg-muted' : 'bg-card')}>
                      <div className="flex items-center gap-2">
                        <TeamLogo teamName={t.team} size={22} className="shrink-0" />
                        <span className="max-w-28 truncate sm:max-w-none">{t.team}</span>
                      </div>
                    </td>
                    <td className={cn(TD, vsColor(t.score))}>{t.score > 0 ? '+' : ''}{t.score.toFixed(2)}</td>
                    <td className={cn(TD, vsColor(t.per_pick))}>{t.per_pick > 0 ? '+' : ''}{t.per_pick.toFixed(2)}</td>
                    <td className={TD}>{t.hits}/{t.picks}</td>
                    <td className={TD}>{t.picks}<span className="text-muted-foreground"> ({t.first_round} 1st)</span></td>
                    <td className="h-12 border-b px-2"><Ref r={t.best} /></td>
                    <td className="h-12 border-b px-2"><Ref r={t.worst} /></td>
                    <td className={TD}>{formatPoints(t.team_points)}</td>
                    <td className={TD}>{t.kept == null ? '–' : `${Math.round(t.kept * 100)}%`}</td>
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

export function DraftWidget({ selectedTeam }: { selectedTeam: string }) {
  const { data, isLoading, error } = useDraftIndex()
  if (isLoading) return <WidgetSkeleton variant="list" />
  if (error || !data || !data.drafts.length) return <ErrorState />
  const counted = data.drafts.filter(d => !d.in_progress).map(d => d.season)
  return (
    <div className="grid w-full grid-cols-1 gap-4">
      <Picks seasons={data.drafts} selectedTeam={selectedTeam} />
      <Drafters teams={data.teams} selectedTeam={selectedTeam}
                drafts={counted.length ? `${counted[counted.length - 1]} to ${counted[0]}` : ''} />
    </div>
  )
}
