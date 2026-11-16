import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Intro, Select } from './PlayersWidgets'
import { PlayerName } from './PlayerName'
import { TeamLogo } from './TeamLogo'
import { formatDate } from './PlayerTimeline'
import { BuiltNode, useBuilt } from '@/lib/players'
import { useSelectedTrade } from '@/lib/selected-trade'
import { formatPoints } from '@/lib/standings'
import { teamCode } from '@/lib/teams'
import { cn } from '@/lib/utils'

// Players → Teams: how a team's current roster was built. One row per player with the move that brought him
// (drafted, with whose pick; signed; traded for, in which trade) and his points with the team; a trade opens
// to what the team gave for him, traced back to drafts and signings (the trade tree run backwards). From
// data/players/built.json (pipeline/lineage.py, `_compute_built`).

const MAX_DEPTH = 8

const ordinal = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 >= 11 && n % 100 <= 13 ? 0 : n % 10] ?? 'th'}`

/** "drafted" | "traded" | "signed" | "before" (on the team when the logs start) */
function group(node: BuiltNode): 'drafted' | 'traded' | 'signed' | 'before' {
  if (node.how === 'draft') return 'drafted'
  if (node.how === 'trade') return 'traded'
  if (node.how === 'claim' || node.how === 're-sign') return 'signed'
  return 'before'
}

/** The trade that brought a player, or the pick he was drafted with */
const tradeOf = (node: BuiltNode) => node.how === 'trade' ? node.trade : node.via?.how === 'trade' ? node.via.trade : undefined

function TradeLink({ id, children }: { id: string; children: React.ReactNode }) {
  const { openTrade } = useSelectedTrade()
  return (
    <button type="button" onClick={() => openTrade(id)} className="text-left underline underline-offset-2 hover:text-foreground" title="Open this trade">
      {children}
    </button>
  )
}

/** How the asset got to the team, in a few words */
function How({ node }: { node: BuiltNode }) {
  const date = node.date ? formatDate(node.date) : null
  switch (node.how) {
    case 'draft':
      return (
        <>
          Drafted {node.season?.slice(0, 4)}, {node.round === 1 ? `${ordinal(node.pick ?? 0)} pick` : `round ${node.round}, ${ordinal(node.pick ?? 0)}`}
          {node.original && <> with {teamCode(node.original)}&apos;s pick{node.via?.how === 'trade' && node.via.trade && (
            <> (<TradeLink id={node.via.trade}>traded for{node.via.date ? ` ${formatDate(node.via.date)}` : ''}</TradeLink>)</>
          )}</>}
        </>
      )
    case 'claim': return <>Signed{date && ` ${date}`}{node.bid ? ` ($${node.bid})` : ''}</>
    case 're-sign': return <>Re-signed{date && ` ${date}`}{node.bid ? ` ($${node.bid})` : ''}</>
    case 'trade':
      return <>From {teamCode(node.from ?? '')}, {node.trade ? <TradeLink id={node.trade}>{date ?? 'a trade'}</TradeLink> : date}</>
    case 'joined': return <>On the roster before the logs</>
    case 'own': return <>its own pick</>
    case 'budget': return null
    default: return <>not in the logs</>
  }
}

/** What the team gave for an asset: each item and how the team had got it, and so on */
function Gave({ items, depth }: { items: BuiltNode[]; depth: number }) {
  return (
    <ul className="ml-1 border-l">
      {items.map((item, k) => <GaveNode key={k} node={item} depth={depth} />)}
    </ul>
  )
}

function GaveNode({ node, depth }: { node: BuiltNode; depth: number }) {
  // A pick used on a player: how the team got the pick
  const deeper = node.gave ?? node.via?.gave
  return (
    <li className="relative pl-4 before:absolute before:left-0 before:top-[0.7rem] before:h-px before:w-3 before:bg-border">
      <div className="flex items-baseline gap-2 py-0.5 text-sm">
        <span className="min-w-0 flex-1">
          {node.player_id ? <PlayerName id={node.player_id} name={node.label} className="inline font-medium" />
            : <span className="text-muted-foreground">{node.label}</span>}
          <span className="ml-1.5 text-xs text-muted-foreground">
            <How node={node} />{deeper && deeper.length > 0 && depth < MAX_DEPTH && ', for:'}
          </span>
        </span>
        {node.points !== undefined && node.kind === 'player' && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground" title="Lineup points with the team before it traded him">
            {formatPoints(node.points)}
          </span>
        )}
      </div>
      {deeper && deeper.length > 0 && depth < MAX_DEPTH && <Gave items={deeper} depth={depth + 1} />}
    </li>
  )
}

function Row({ node }: { node: BuiltNode }) {
  const [open, setOpen] = useState(false)
  const cost = node.gave ?? node.via?.gave
  return (
    <li className="py-2">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          disabled={!cost?.length}
          aria-expanded={open}
          aria-label={open ? 'Hide what the team gave' : 'Show what the team gave'}
          className={cn('mt-0.5 rounded p-0.5 text-muted-foreground hover:bg-muted', !cost?.length && 'invisible')}
        >
          <ChevronRight className={cn('h-4 w-4 transition-transform', open && 'rotate-90')} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <PlayerName id={node.player_id!} name={node.label} className="min-w-0 truncate font-medium" />
            <span className="ml-auto shrink-0 text-sm tabular-nums">{formatPoints(node.points ?? 0)}</span>
          </div>
          <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
            <span className="min-w-0 flex-1"><How node={node} /></span>
            <span className="shrink-0 tabular-nums">{node.starts ?? 0} starts</span>
          </div>
          {open && cost && (
            <div className="mt-2">
              <div className="mb-1 text-xs font-medium text-muted-foreground">What the team gave, and how it had got that:</div>
              <Gave items={cost} depth={0} />
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

export function TeamBuilt({ selectedTeam }: { selectedTeam: string }) {
  const { data: built } = useBuilt()
  const teams = built ? Object.keys(built).sort() : []
  const [picked, setPicked] = useState<string | null>(null)
  if (!built || !teams.length) return null
  const team = picked ?? (teams.includes(selectedTeam) ? selectedTeam : teams[0])
  const { season, period, players } = built[team]

  const counts = { drafted: 0, traded: 0, signed: 0, before: 0 }
  players.forEach(p => { counts[group(p)] += 1 })
  const summary = [
    counts.drafted && `${counts.drafted} drafted`, counts.traded && `${counts.traded} traded for`,
    counts.signed && `${counts.signed} signed`, counts.before && `${counts.before} from before the logs`,
  ].filter(Boolean).join(', ')

  // The trades behind the most of today's points (a player traded for, or drafted with a pick traded for)
  const byTrade = new Map<string, { points: number; players: BuiltNode[] }>()
  for (const p of players) {
    const id = tradeOf(p)
    if (!id) continue
    const entry = byTrade.get(id) ?? { points: 0, players: [] }
    entry.points += p.points ?? 0
    entry.players.push(p)
    byTrade.set(id, entry)
  }
  const topTrades = [...byTrade.entries()].sort((a, b) => b[1].points - a[1].points).slice(0, 3).filter(([, t]) => t.points > 0)
  const total = players.reduce((t, p) => t + (p.points ?? 0), 0)

  return (
    <Card className="w-full">
      <Intro title="How this team was built">
        Today&apos;s roster ({season}, period {period}): how each player got there and his lineup points with the team
        since (regular season). Open a trade to see what the team gave for him, and how it had got that.
      </Intro>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Select label="Team" value={team} onChange={setPicked} options={teams.map(t => [t, t])} />
          <div className="flex items-center gap-2 text-sm">
            <TeamLogo teamName={team} size={20} />
            <span>{summary}</span>
          </div>
        </div>
        {topTrades.length > 0 && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">The trades behind the most points</div>
            <ul className="space-y-1">
              {topTrades.map(([id, t]) => (
                <li key={id} className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 text-muted-foreground">
                    <TradeLink id={id}>{t.players.map(p => p.label).join(', ')}</TradeLink>
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {formatPoints(t.points)} <span className="text-xs text-muted-foreground">({Math.round((t.points / (total || 1)) * 100)}%)</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <ul className="divide-y">
          {players.map(p => <Row key={p.player_id} node={p} />)}
        </ul>
      </CardContent>
    </Card>
  )
}
