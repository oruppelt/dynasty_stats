import { useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import {
  ArrowLeftRight, ChevronDown, ChevronLeft, ChevronRight, ListOrdered, LogIn, LucideIcon, PenLine, RotateCcw, Tag, UserMinus,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { TeamLogo } from './TeamLogo'
import { Explainer } from './Explainer'
import { PlayerPage, SeasonAxis, TimelineEvent, Trade, describeContract, formatSalary } from '@/lib/players'
import { useSelectedPlayer } from '@/lib/selected-player'
import { formatPoints } from '@/lib/standings'
import { teamCode } from '@/lib/teams'
import { getTeamColor } from '@/lib/nba-team-colors'
import { textOn } from '@/lib/chart-theme'
import { cn } from '@/lib/utils'

// Players → Player: the timeline, how a player moved between teams (the player lineage, ROADMAP.md
// section 3). Built by pipeline/lineage.py from the transaction logs and the rosters.
// - The career strip reads left to right, oldest to newest: one bar per stint with a team, in its colors,
//   labelled with his points per game there (`axis` gives the seasons' lengths). Click a stint to open it.
// - The stint card under it: how he got there (a trade opens to show what went each way), what he did
//   there, and how he left. Arrows step through the stints; it opens on the latest.
// - Every move, as a list (oldest first), for the full log.

const KINDS: Record<TimelineEvent['kind'], { label: string; icon: LucideIcon }> = {
  draft: { label: 'Drafted', icon: ListOrdered },
  claim: { label: 'Signed', icon: PenLine },
  're-sign': { label: 'Re-signed', icon: RotateCcw },
  trade: { label: 'Traded', icon: ArrowLeftRight },
  drop: { label: 'Dropped', icon: UserMinus },
  joined: { label: 'On the roster', icon: LogIn },
  renamed: { label: 'Team renamed', icon: Tag },
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

// --- Stints: the timeline grouped by team, each from an arrival to the next move away -----------------

interface Stint {
  team: string;
  arrive: TimelineEvent;
  /** The trade or drop that ended it (absent: still there, or the records end) */
  leave?: TimelineEvent;
  renames: TimelineEvent[];
  /** Position on the strip, in periods from the start */
  start: number;
  end: number;
}

const OFFSEASON = 3 // the gap between seasons on the strip, in periods

function useAxis(axis: SeasonAxis[] | undefined) {
  return useMemo(() => {
    const offsets: Record<string, number> = {}
    const seasons = axis ?? []
    let x = 0, now: number | null = null
    seasons.forEach((s, i) => {
      offsets[s.season] = x
      // A season in progress keeps the room of a full one, so its stints aren't squeezed into the edge
      const inProgress = i === seasons.length - 1 && s.playoffs_from === null && i > 0
      if (inProgress) now = x + s.length
      x += (inProgress ? Math.max(s.length, seasons[i - 1].length) : s.length) + OFFSEASON
    })
    const total = Math.max(1, x - OFFSEASON)
    const first = axis?.[0]?.season
    /** A move's place: the start of its period; before the season for the off-season and the draft */
    const at = (season?: string, period?: number) => {
      if (!season) return 0
      if (!(season in offsets)) return first && season < first ? 0 : total
      return period && period > 1 ? offsets[season] + period - 1 : Math.max(0, offsets[season] - 1)
    }
    return { offsets, total, at, now }
  }, [axis])
}

function buildStints(timeline: TimelineEvent[], at: (s?: string, p?: number) => number, total: number, now: number | null): Stint[] {
  const stints: Stint[] = []
  let open: Stint | undefined
  for (const e of timeline) {
    if (e.kind === 'renamed') {
      open?.renames.push(e)
      continue
    }
    if (e.kind === 'drop' || e.kind === 'trade') {
      if (open) {
        open.leave = e
        open.end = at(e.season, e.period)
      }
      open = undefined
      if (e.kind === 'drop') continue
    }
    if (open) open.end = at(e.season, e.period) // an arrival without a logged departure
    open = { team: e.team, arrive: e, renames: [], start: at(e.season, e.period), end: now ?? total }
    stints.push(open)
  }
  return stints
}

/** A team color that shows on the card: the secondary one when the primary is too close to the background */
function useTeamColor() {
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme === 'dark'
  return (team: string) => {
    const { primary, secondary } = getTeamColor(team)
    const light = textOn(primary) !== '#ffffff' // a light color
    const lum = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16)
    if (dark && lum(primary) < 90 && /^#[0-9a-f]{6}$/i.test(secondary)) return secondary
    if (!dark && light && lum(primary) > 560 && /^#[0-9a-f]{6}$/i.test(secondary)) return secondary
    return primary
  }
}

// --- The career strip --------------------------------------------------------------------------------

const perGame = (points = 0, gp = 0) => (gp ? (points / gp).toFixed(1) : null)

function CareerStrip({ seasons, stints, selected, onSelect, total, offsets, now, selectedTeam, color }: {
  seasons: SeasonAxis[]; stints: Stint[]; selected: number; onSelect: (i: number) => void; total: number;
  offsets: Record<string, number>; now: number | null; selectedTeam: string; color: (team: string) => string;
}) {
  // The strip's width in pixels, so a stint shows a label only when it fits
  const ref = useRef<HTMLDivElement>(null)
  const [px, setPx] = useState(800)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setPx(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const pct = (x: number) => `${(x / total) * 100}%`
  // Free agency: the gaps between a stint and the next
  const gaps = stints.slice(0, -1).map((s, i) => ({ from: s.end, to: stints[i + 1].start })).filter(g => g.to - g.from > 0.5)

  return (
    <div ref={ref} className="select-none">
      <div className="relative h-12 sm:h-14">
        {/* Seasons: a faint column each, so a block's length reads as time */}
        {seasons.map((s, i) => (
          <div key={s.season} aria-hidden className="absolute inset-y-0 rounded-sm bg-muted/50"
               style={{ left: pct(offsets[s.season]), width: pct(i === seasons.length - 1 && now !== null ? now - offsets[s.season] : s.length) }} />
        ))}
        {now !== null && (
          <div aria-hidden className="absolute -bottom-1 -top-2 border-l-2 border-dashed border-foreground/50" style={{ left: `calc(${pct(now)} + 3px)` }}>
            <span className="absolute -top-0.5 left-1 text-[10px] font-medium uppercase text-muted-foreground">now</span>
          </div>
        )}
        {gaps.map((g, i) => (
          <div key={i} aria-hidden title="Free agent" className="absolute top-1/2 border-t-2 border-dashed border-muted-foreground/50"
               style={{ left: pct(g.from), width: pct(g.to - g.from) }} />
        ))}
        {stints.map((s, i) => {
          const c = color(s.team)
          const on = i === selected
          const width = (Math.max(s.end - s.start, 0) / total) * px
          const ppg = perGame(s.arrive.points, s.arrive.gp)
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(i)}
              title={`${s.team}${ppg ? `: ${ppg} points per game` : ''}`}
              aria-pressed={on}
              className={cn(
                'absolute inset-y-1 flex min-w-[6px] flex-col items-center justify-center overflow-hidden rounded-[5px] px-1 leading-tight transition',
                on ? 'z-[2] ring-2 ring-foreground ring-offset-1 ring-offset-card' : 'opacity-70 hover:opacity-100',
                s.team === selectedTeam && !on && 'ring-1 ring-primary',
              )}
              style={{ left: pct(s.start), width: `max(6px, ${pct(s.end - s.start)})`, background: c, color: textOn(c) }}
            >
              {width >= 30 && (
                <span className="flex max-w-full items-center gap-1 text-[11px] font-semibold">
                  {width >= 70 && <TeamLogo teamName={s.team} size={14} className="shrink-0 rounded-full bg-white/90 p-px" />}
                  <span className="truncate">{teamCode(s.team)}</span>
                </span>
              )}
              {width >= 44 && ppg && <span className="truncate text-[10px] tabular-nums opacity-90">{ppg}{width >= 80 ? ' ppg' : ''}</span>}
            </button>
          )
        })}
      </div>

      {/* Season labels */}
      <div className="relative mt-1 h-4 text-[10px] text-muted-foreground sm:text-xs">
        {seasons.map((s, i) => {
          const room = i === seasons.length - 1 ? total - offsets[s.season] : s.length
          return (
            <span key={s.season} className="absolute truncate pl-1" style={{ left: pct(offsets[s.season]), width: pct(room) }}>
              {(room / total) * px < 34 ? '' : s.season.slice(2)}
            </span>
          )
        })}
      </div>
    </div>
  )
}

// --- The stint card ------------------------------------------------------------------------------------

function TradeDetails({ trade, playerId }: { trade: Trade; playerId: string }) {
  const { openPlayer } = useSelectedPlayer()
  // Grouped by the team that received them
  const teams = [...new Set(trade.items.map(i => i.to))]
  return (
    <div className="mt-2 grid gap-2 rounded-md border bg-muted/40 p-2">
      {teams.map(team => (
        <div key={team} className="min-w-0">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            {team !== '(Drop)' && <TeamLogo teamName={team} size={16} className="shrink-0" />}
            <span className="truncate">{team === '(Drop)' ? 'Released' : `${team} got`}</span>
          </div>
          <ul className="space-y-0.5 text-sm">
            {trade.items.filter(i => i.to === team).map((item, k) => (
              <li key={k}>
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

/** One move: what it was, when, and the trade behind it */
function Move({ event, page, title, departure = false }: { event: TimelineEvent; page: PlayerPage; title: string; departure?: boolean }) {
  const [open, setOpen] = useState(false)
  const kind = KINDS[event.kind]
  const Icon = kind.icon
  const trade = event.trade ? page.trades?.[event.trade] : undefined
  let line = headline(event)
  if (departure && event.kind === 'trade') line = `to ${event.team}`
  if (departure && event.kind === 'drop') line = 'Released to free agency'
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="mt-1 flex items-start gap-2">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-card text-primary">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <div className="font-semibold">{kind.label} <span className="font-normal text-muted-foreground">{line}</span></div>
          <div className="text-xs text-muted-foreground">{when(event)}</div>
        </div>
      </div>
      {trade && (
        <>
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            className="ml-9 mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {open ? 'Hide the trade' : `The trade: ${trade.items.length} item${trade.items.length === 1 ? '' : 's'}`}
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
          </button>
          {open && <TradeDetails trade={trade} playerId={page.player_id} />}
        </>
      )}
    </div>
  )
}

function StintCard({ stint, index, count, onStep, page, color, next }: {
  stint: Stint; index: number; count: number; onStep: (i: number) => void; page: PlayerPage;
  color: string; next?: Stint;
}) {
  const a = stint.arrive
  const current = !stint.leave && index === count - 1
  const ppg = perGame(a.points, a.gp)
  return (
    <div className="mt-4 overflow-hidden rounded-lg border">
      <div className="flex items-center gap-3 border-b px-3 py-2.5" style={{ borderTop: `4px solid ${color}` }}>
        <TeamLogo teamName={stint.team} size={36} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-semibold leading-tight">{stint.team}</div>
          <div className="text-xs text-muted-foreground">
            Stint {index + 1} of {count}
            {a.date && ` · ${formatDate(a.date)}`}
            {stint.leave?.date ? ` to ${formatDate(stint.leave.date)}` : current ? ' to now' : ''}
            {stint.renames.map(r => ` · renamed ${r.team}`).join('')}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button type="button" aria-label="Earlier stint" disabled={index === 0} onClick={() => onStep(index - 1)}
                  className="rounded-md border p-1.5 hover:bg-muted disabled:opacity-30">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Later stint" disabled={index === count - 1} onClick={() => onStep(index + 1)}
                  className="rounded-md border p-1.5 hover:bg-muted disabled:opacity-30">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="grid gap-4 p-3 md:grid-cols-[1fr_auto_1fr] md:gap-6">
        <Move event={a} page={page} title="How he got there" />
        <div className="md:min-w-[220px] md:border-x md:px-6">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">With {teamCode(stint.team)}</div>
          {a.periods ? (
            <div className="mt-1 grid grid-cols-3 gap-2 tabular-nums md:grid-cols-2">
              <Figure value={formatPoints(a.points ?? 0)} label="points" />
              <Figure value={String(a.starts ?? 0)} label={`start${a.starts === 1 ? '' : 's'}`} />
              <Figure value={String(a.periods)} label={`period${a.periods === 1 ? '' : 's'}`} />
              <Figure value={ppg ?? '–'} label="per game" />
            </div>
          ) : (
            <div className="mt-1 text-sm text-muted-foreground">No regular-season period there</div>
          )}
          {a.salary !== undefined && (
            <div className="mt-2 inline-block rounded bg-muted px-1.5 py-0.5 text-xs tabular-nums" title={a.contract ? describeContract(a.contract) : undefined}>
              {formatSalary(a.salary)} · {a.contract}
            </div>
          )}
        </div>
        {stint.leave ? (
          <div>
            <Move event={stint.leave} page={page} title="How he left" departure />
            {stint.leave.kind === 'drop' && next && (
              <div className="ml-9 mt-1 text-xs text-muted-foreground">
                Next: {KINDS[next.arrive.kind].label.toLowerCase()} by {teamCode(next.team)}
                {next.arrive.date && `, ${formatDate(next.arrive.date)}`}
              </div>
            )}
          </div>
        ) : (
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">How he left</div>
            <div className="mt-1 text-sm text-muted-foreground">{current ? 'Still on the roster' : 'Not in the transaction log'}</div>
          </div>
        )}
      </div>
    </div>
  )
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0">
      <div className="text-lg font-semibold leading-tight">{value}</div>
      <div className="truncate text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

// --- Every move, as a list --------------------------------------------------------------------------

function MoveList({ events, page, selectedTeam }: { events: TimelineEvent[]; page: PlayerPage; selectedTeam: string }) {
  return (
    <ol className="mt-3 space-y-1.5">
      {events.map((e, i) => {
        const kind = KINDS[e.kind]
        const Icon = kind.icon
        const trade = e.trade ? page.trades?.[e.trade] : undefined
        return (
          <li key={i} className={cn('flex items-start gap-2 rounded-md px-2 py-1 text-sm', e.team === selectedTeam && e.kind !== 'drop' && 'bg-muted')}>
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="w-24 shrink-0 text-xs leading-5 text-muted-foreground tabular-nums">{e.date ? formatDate(e.date) : e.season}</span>
            <span className="min-w-0">
              <span className="font-medium">{kind.label}</span>{' '}
              <span className="text-muted-foreground">
                {e.kind === 'drop' ? `by ${e.team}` : e.kind === 'trade' ? `${e.from} → ${e.team}` : e.kind === 'renamed' ? `${e.from} → ${e.team}` : `${e.team} · ${headline(e)}`}
                {trade && ` (${trade.items.length} items)`}
              </span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export function PlayerTimeline({ page, selectedTeam }: { page: PlayerPage; selectedTeam: string }) {
  const timeline = page.timeline
  const { offsets, total, at, now } = useAxis(page.axis)
  const stints = useMemo(() => buildStints(timeline ?? [], at, total, now), [timeline, at, total, now])
  const [selected, setSelected] = useState(stints.length - 1)
  const [list, setList] = useState(false)
  const color = useTeamColor()
  if (!stints.length) return null
  const index = Math.min(Math.max(selected, 0), stints.length - 1)
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Career path</CardTitle>
        <CardDescription>
          {stints.length} stint{stints.length === 1 ? '' : 's'}, oldest on the left. Pick a
          stint to see how he got there, what he did and how he left.
        </CardDescription>
        <Explainer>
          <p>
            From Fantrax&apos;s transaction logs, checked against the rosters. One block per stint, in the team&apos;s
            colors, as long as he was there; the number is his points per game there (in a lineup, regular
            season). The grey columns are the seasons, a dashed line is time as a free agent.
          </p>
          <p className="mt-2">
            A stint shows the contract he played on there (his first period with the team) and what he did there
            until he left: lineup points, starts and points per game in the regular season, and the periods on the roster. Dates are
            US Eastern; &quot;P12&quot; is the period a move took effect in, &quot;before&quot; a season means the
            off-season. Team names are the names at the time. The records start in 2019-20; &quot;On the
            roster&quot; is a player who was already there.
          </p>
        </Explainer>
      </CardHeader>
      <CardContent className="px-3 sm:px-6">
        {page.axis && (
          <CareerStrip seasons={page.axis} stints={stints} selected={index} onSelect={setSelected} total={total}
                       offsets={offsets} now={now} selectedTeam={selectedTeam} color={color} />
        )}
        <StintCard key={index} stint={stints[index]} index={index} count={stints.length} onStep={setSelected}
                   page={page} color={color(stints[index].team)} next={stints[index + 1]} />
        <button type="button" onClick={() => setList(l => !l)} aria-expanded={list}
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          {list ? 'Hide the moves' : `Every move (${timeline?.length ?? 0}), oldest first`}
          <ChevronDown className={cn('h-4 w-4 transition-transform', list && 'rotate-180')} />
        </button>
        {list && <MoveList events={timeline ?? []} page={page} selectedTeam={selectedTeam} />}
      </CardContent>
    </Card>
  )
}
