import { useState } from 'react'
import { ArrowLeftRight, ChevronDown, ListOrdered, LogIn, LucideIcon, PenLine, RotateCcw, Tag, UserMinus } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { TeamLogo } from './TeamLogo'
import { Explainer } from './Explainer'
import { PlayerPage, TimelineEvent, Trade, describeContract, formatSalary } from '@/lib/players'
import { useSelectedPlayer } from '@/lib/selected-player'
import { formatPoints } from '@/lib/standings'
import { teamCode } from '@/lib/teams'
import { cn } from '@/lib/utils'

// Players → Player: the timeline, how a player moved between teams (the player lineage, ROADMAP.md
// section 3). Built by pipeline/lineage.py from the transaction logs; each arrival carries the contract
// and what he did with the team, and a trade opens to show everything that went each way.

const KINDS: Record<TimelineEvent['kind'], { label: string; icon: LucideIcon; tone: string }> = {
  draft: { label: 'Drafted', icon: ListOrdered, tone: 'text-primary' },
  claim: { label: 'Signed', icon: PenLine, tone: 'text-primary' },
  're-sign': { label: 'Re-signed', icon: RotateCcw, tone: 'text-primary' },
  trade: { label: 'Traded', icon: ArrowLeftRight, tone: 'text-primary' },
  drop: { label: 'Dropped', icon: UserMinus, tone: 'text-muted-foreground' },
  joined: { label: 'On the roster', icon: LogIn, tone: 'text-muted-foreground' },
  renamed: { label: 'Team renamed', icon: Tag, tone: 'text-muted-foreground' },
}

/** "2026-08-15" → "Aug 15, 2026" */
export function formatDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const ordinal = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 >= 11 && n % 100 <= 13 ? 0 : n % 10] ?? 'th'}`

function when(e: TimelineEvent): string {
  const parts = []
  if (e.date) parts.push(formatDate(e.date))
  if (e.season && e.kind !== 'draft') parts.push(e.period && e.period > 1 ? `${e.season}, P${e.period}` : `before ${e.season}`)
  if (e.kind === 'draft' && e.season) parts.push(`for ${e.season}`)
  return parts.join(' · ')
}

/** What the move was, in a line */
function headline(e: TimelineEvent): string {
  switch (e.kind) {
    case 'draft': return `Round ${e.round}, ${ordinal(e.pick ?? 0)} pick`
    case 'claim': return e.bid ? `Free agent, $${e.bid} bid` : 'Free agent'
    case 're-sign': return 'Signed back after being dropped'
    case 'trade': return `from ${e.from}`
    case 'drop': return 'Released to free agency'
    case 'joined': return e.before_logs ? `Where the records start (${e.season})` : 'Not in the transaction log'
    case 'renamed': return `The Lakers and Clippers owners swapped names: ${e.from} is now ${e.team}`
  }
}

function TradeDetails({ trade, playerId }: { trade: Trade; playerId: string }) {
  const { openPlayer } = useSelectedPlayer()
  // Grouped by the team that received them
  const teams = [...new Set(trade.items.map(i => i.to))]
  return (
    <div className="mt-2 grid gap-2 rounded-md border bg-muted/40 p-2 sm:grid-cols-2">
      {teams.map(team => (
        <div key={team} className="min-w-0">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            {team !== '(Drop)' && <TeamLogo teamName={team} size={16} className="shrink-0" />}
            <span className="truncate">{team === '(Drop)' ? 'Released' : `${team} got`}</span>
          </div>
          <ul className="space-y-0.5 text-sm">
            {trade.items.filter(i => i.to === team).map((item, k) => (
              <li key={k} className="truncate">
                {item.kind === 'player' && item.player_id && item.player_id !== playerId ? (
                  <button type="button" onClick={() => openPlayer(item.player_id!)} className="font-medium underline-offset-2 hover:underline">
                    {item.label}
                  </button>
                ) : (
                  <span className={cn(item.kind === 'player' ? 'font-medium' : 'text-muted-foreground', item.player_id === playerId && 'font-bold')}>
                    {item.label}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function Event({ event, page, selectedTeam, last }: { event: TimelineEvent; page: PlayerPage; selectedTeam: string; last: boolean }) {
  const [open, setOpen] = useState(false)
  const kind = KINDS[event.kind]
  const Icon = kind.icon
  const trade = event.trade ? page.trades?.[event.trade] : undefined
  const arrival = event.periods !== undefined
  const mine = event.team === selectedTeam
  const dimmed = event.kind === 'drop' || event.kind === 'renamed'
  return (
    <li className="relative flex gap-3 pb-4">
      {!last && <span aria-hidden className="absolute left-[15px] top-8 bottom-0 w-px bg-border" />}
      <span className={cn('z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-card', kind.tone)}>
        <Icon className="h-4 w-4" />
      </span>
      <div className={cn('min-w-0 flex-1 rounded-md px-2 py-1', mine && !dimmed && 'bg-muted')}>
        <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
          <span className={cn('font-semibold uppercase tracking-wide', kind.tone)}>{kind.label}</span>
          <span>{when(event)}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <TeamLogo teamName={event.team} size={22} className={cn('shrink-0', dimmed && 'opacity-60')} />
          <span className={cn('truncate font-semibold', dimmed && 'font-medium text-muted-foreground')}>
            {event.kind === 'drop' ? `by ${event.team}` : event.team}
          </span>
        </div>
        <div className="mt-0.5 text-sm text-muted-foreground">{headline(event)}</div>
        {arrival && (
          <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
            {event.salary !== undefined && (
              <span className="rounded bg-muted px-1.5 py-0.5 tabular-nums" title={event.contract ? describeContract(event.contract) : undefined}>
                {formatSalary(event.salary)} · {event.contract}
              </span>
            )}
            {event.periods ? (
              <span className="rounded bg-muted px-1.5 py-0.5 tabular-nums">
                With {teamCode(event.team)}: {formatPoints(event.points ?? 0)} pts · {event.starts} start{event.starts === 1 ? '' : 's'} · {event.periods} period{event.periods === 1 ? '' : 's'}
              </span>
            ) : (
              <span className="rounded bg-muted px-1.5 py-0.5">No regular-season period with {teamCode(event.team)}</span>
            )}
          </div>
        )}
        {trade && (
          <>
            <button
              type="button"
              onClick={() => setOpen(o => !o)}
              aria-expanded={open}
              className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              {open ? 'Hide the trade' : `The trade: ${trade.items.length} item${trade.items.length === 1 ? '' : 's'}`}
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
            </button>
            {open && <TradeDetails trade={trade} playerId={page.player_id} />}
          </>
        )}
      </div>
    </li>
  )
}

const SHOWN = 6

export function PlayerTimeline({ page, selectedTeam }: { page: PlayerPage; selectedTeam: string }) {
  const [all, setAll] = useState(false)
  const events = [...(page.timeline ?? [])].reverse()
  if (!events.length) return null
  const shown = all ? events : events.slice(0, SHOWN)
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Timeline</CardTitle>
        <CardDescription>
          Every move, newest first: drafts, free-agent signings, trades and drops. Open a trade to see what
          went each way, and click a player in it to follow him.
        </CardDescription>
        <Explainer>
          <p>
            From Fantrax&apos;s transaction logs, checked against the rosters. Dates are US Eastern; &quot;P12&quot;
            is the period the move took effect in, &quot;before&quot; a season means the off-season. Team names
            are the names at the time.
          </p>
          <p className="mt-2">
            Each arrival shows the contract he played on there (his first period with the team) and what he
            did there until he left: lineup points and starts in the regular season, and the periods on the
            roster. Re-signed means the team that dropped him signed him back. The records start in 2019-20;
            &quot;On the roster&quot; is a player who was already there.
          </p>
        </Explainer>
      </CardHeader>
      <CardContent className="px-3 sm:px-6">
        <ol>
          {shown.map((e, i) => (
            <Event key={`${e.kind}-${e.date}-${e.team}-${i}`} event={e} page={page} selectedTeam={selectedTeam} last={i === shown.length - 1} />
          ))}
        </ol>
        {events.length > SHOWN && (
          <button type="button" onClick={() => setAll(a => !a)} className="ml-11 text-sm font-medium text-primary hover:underline">
            {all ? 'Show fewer' : `Show all ${events.length} moves`}
          </button>
        )}
      </CardContent>
    </Card>
  )
}
