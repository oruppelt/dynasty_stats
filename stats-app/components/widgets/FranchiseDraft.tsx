import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { WidgetSkeleton } from './WidgetSkeleton'
import { ErrorState } from './ErrorState'
import { PlayerName } from './PlayerName'
import { PickHistory, Sort, SortHead, TD, formatValue, formatVs, vsColor } from './DraftWidget'
import { DraftPick, PickRef, useDraftIndex, useDrafts } from '@/lib/draft'
import { getTeamColor } from '@/lib/nba-team-colors'
import { formatPoints } from '@/lib/standings'
import { cn } from '@/lib/utils'

// History → Franchise → Draft: the franchise's picks in every draft (the team that made the pick), what each
// player scored for it and elsewhere, and where it ranks among the drafters (data/draft, pipeline/draft.py).

type Key = 'pick' | 'score' | 'here' | 'elsewhere' | 'seasons'

const ordinal = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 >= 11 && n % 100 <= 13 ? 0 : n % 10] ?? 'th'}`
const signed = (v: number, digits = 2) => {
  const text = Math.abs(v).toFixed(digits)
  return Number(text) === 0 ? text : `${v > 0 ? '+' : '−'}${text}`
}

interface Row {
  p: DraftPick;
  total: number;
  elsewhere: number;
  seasons: number;
}

const VALUE: Record<Key, (r: Row) => number> = {
  // Newest draft first, then by pick
  pick: r => -Number(r.p.season.slice(0, 4)) * 100 + r.p.pick,
  score: r => r.p.score ?? -Infinity,
  here: r => r.p.team_points,
  elsewhere: r => r.elsewhere,
  seasons: r => r.seasons,
}

function Stat({ label, value, sub, className }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <div className="min-w-0 rounded-lg border px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn('text-xl font-semibold tabular-nums', className)}>{value}</div>
      {sub && <div className="truncate text-xs text-muted-foreground">{sub}</div>}
    </div>
  )
}

function PickStat({ label, r }: { label: string; r: PickRef }) {
  return (
    <div className="min-w-0 rounded-lg border px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <PlayerName id={r.player_id} name={r.player} className="truncate font-semibold" />
      <div className="text-xs text-muted-foreground">
        {r.season} #{r.pick} · <span className={vsColor(r.score)}>{signed(r.score)}</span>
      </div>
    </div>
  )
}

/** The player's points for the franchise (its color) and elsewhere (gray), to the scale of the best */
function Split({ here, elsewhere, max, color }: { here: number; elsewhere: number; max: number; color: string }) {
  if (!max || here + elsewhere <= 0) return null
  return (
    <div className="flex h-1.5 w-24 overflow-hidden rounded-full bg-muted" aria-hidden>
      <div style={{ width: `${(here / max) * 100}%`, background: color }} />
      <div className="bg-muted-foreground/50" style={{ width: `${(elsewhere / max) * 100}%` }} />
    </div>
  )
}

function PickLine({ r, max, color }: { r: Row; max: number; color: string }) {
  const [open, setOpen] = useState(false)
  const { p } = r
  const canOpen = !!p.player_id && !p.redraft
  return (
    <>
      <tr>
        <td className={cn(TD, 'text-left')}>
          <div>{p.season}</div>
          <div className="text-xs text-muted-foreground">#{p.pick} (R{p.round})</div>
        </td>
        <td className="sticky left-0 z-10 h-11 border-b bg-card px-2">
          <div className="flex items-center gap-2">
            <div className="min-w-0">
              {p.player_id && p.player
                ? <PlayerName id={p.player_id} name={p.player} className="max-w-32 sm:max-w-none" />
                : <span className="text-muted-foreground">{p.player ?? 'Pick not used'}</span>}
              <div className="max-w-32 truncate text-xs text-muted-foreground sm:max-w-none">
                {p.redraft ? `Placeholder (drafted in ${p.redraft}): a miss`
                  : p.metric === 'salary' ? (p.salary_after ? `${formatValue(p.salary_after, 'salary')} a season after the rookie deal` : 'Not signed after the rookie deal')
                  : 'Rookie deal still on'}
              </div>
            </div>
            {canOpen && (
              <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} title="Seasons since the draft"
                      className="ml-auto shrink-0 rounded p-1 text-muted-foreground hover:bg-muted">
                <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
              </button>
            )}
          </div>
        </td>
        <td className={cn(TD, vsColor(p.vs_slot))} title={p.expected != null ? `The slot usually gives ${formatValue(p.expected, p.metric)}` : undefined}>
          {p.vs_slot == null ? '–' : formatVs(p.vs_slot, p.metric)}
          {p.score != null && <div className="text-xs">{signed(p.score)}</div>}
        </td>
        <td className={TD}>{formatPoints(p.team_points)}</td>
        <td className={TD}>{formatPoints(r.elsewhere)}</td>
        <td className="h-11 border-b px-2"><Split here={p.team_points} elsewhere={r.elsewhere} max={max} color={color} /></td>
        <td className={TD}>{r.seasons || '–'}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={7} className="border-b bg-muted/30 px-2 pt-2">
            <div className="sticky left-0 max-w-[calc(100vw-3rem)]"><PickHistory p={p} /></div>
          </td>
        </tr>
      )}
    </>
  )
}

export function FranchiseDraft({ team }: { team: string }) {
  const index = useDraftIndex()
  const seasons = index.data?.drafts.map(d => d.season) ?? []
  const { drafts, isLoading, error } = useDrafts(seasons)
  const [sort, setSort] = useState<Sort<Key>>({ key: 'pick', desc: false })

  if (index.isLoading || isLoading) return <WidgetSkeleton variant="list" />
  if (index.error || error || !index.data) return <ErrorState />

  const ranked = index.data.teams
  const rank = ranked.findIndex(t => t.team === team)
  const me = ranked[rank]
  const rows: Row[] = drafts.flatMap(d => d.picks).filter(p => p.team === team).map(p => {
    const total = p.points + p.playoff_points
    return { p, total, elsewhere: Math.max(0, total - p.team_points), seasons: p.history.filter(h => h.teams.includes(team)).length }
  })
  const get = VALUE[sort.key]
  const sorted = [...rows].sort((a, b) => (sort.desc ? get(b) - get(a) : get(a) - get(b)) || VALUE.pick(a) - VALUE.pick(b))
  const max = Math.max(...rows.map(r => r.total), 0)
  const color = getTeamColor(team).primary
  const head = (k: Key, label: string, ascFirst?: boolean, className?: string) => (
    <SortHead k={k} sort={sort} setSort={setSort} ascFirst={ascFirst} className={className}>{label}</SortHead>
  )
  const inProgress = index.data.drafts.find(d => d.in_progress)?.season

  return (
    <div className="space-y-4">
      {me ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Draft score" value={signed(me.score)} sub={`${ordinal(rank + 1)} of ${ranked.length} drafters`}
                className={vsColor(me.score)} />
          <Stat label="Per pick" value={signed(me.per_pick)} className={vsColor(me.per_pick)} />
          <Stat label="Hits" value={`${me.hits}/${me.picks}`} sub={`${me.first_round} first-rounders`} />
          <Stat label="Kept" value={me.kept == null ? '–' : `${Math.round(me.kept * 100)}%`} sub={`${formatPoints(me.team_points)} pts for ${team.split(' ').pop()}`} />
          <PickStat label="Best pick" r={me.best} />
          <PickStat label="Worst pick" r={me.worst} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No finished drafts with a pick yet.</p>
      )}

      <Card className="min-w-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Picks</CardTitle>
          <p className="text-xs text-muted-foreground">
            Every pick the franchise made ({rows.length}), and what the player scored for it and elsewhere: lineup
            points, playoffs included. vs slot: the value (salary after the rookie deal, or points for the newer
            drafts) against what the slot usually gives, and below it in average first-round picks, as in History →
            Draft.{inProgress && ` The ${inProgress} draft isn't in the score yet.`}
          </p>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <div className="w-full overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-muted-foreground">
                  {head('pick', 'Draft', true, 'text-left')}
                  <th className="sticky left-0 z-10 h-10 border-b bg-card px-2 text-left font-medium">Player</th>
                  {head('score', 'vs slot')}
                  {head('here', 'For us')}
                  {head('elsewhere', 'Elsewhere')}
                  <th className="h-10 border-b px-2" />
                  {head('seasons', 'Seasons here')}
                </tr>
              </thead>
              <tbody className="[&_tr:last-child_td]:border-0">
                {sorted.map(r => <PickLine key={`${r.p.season}-${r.p.pick}`} r={r} max={max} color={color} />)}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
