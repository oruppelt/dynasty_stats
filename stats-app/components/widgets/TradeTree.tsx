import { useSelectedPlayer } from '@/lib/selected-player'
import { Trade, useTrades } from '@/lib/players'
import { formatPoints } from '@/lib/standings'
import { teamCode } from '@/lib/teams'
import { cn } from '@/lib/utils'
import { TeamLogo } from './TeamLogo'
import { formatDate, useTeamColor } from './PlayerTimeline'
import { useSelectedTrade } from '@/lib/selected-trade'

// The trade tree (Players → Player, a trade's panel): for each side of a trade, what the team did with
// everything it got. An asset it kept shows what it gave the team; one it traded away opens to what came
// back in that trade, and so on. A pick it used is the player it drafted. From data/players/trades.json
// (pipeline/lineage.py, each item's `result` and `next`).

type Item = Trade['items'][number]
type Trades = Record<string, Trade>

const MAX_DEPTH = 8

/** Each side of a trade: what every team got, and what each got out of it (lineup points in the regular
 * season with that team), with the split bar on top. `playerId`: the player whose page shows it, in bold. */
export function TradeSides({ trade, playerId, wide = false }: { trade: Trade; playerId?: string; wide?: boolean }) {
  const { openPlayer } = useSelectedPlayer()
  const color = useTeamColor()
  // Grouped by the team that received them, with what each got out of it
  const teams = [...new Set(trade.items.map(i => i.to))]
  const got = (team: string) => trade.items.filter(i => i.to === team)
  const total = (team: string) => got(team).reduce((t, i) => t + (i.result?.points ?? 0), 0)
  const starts = (team: string) => got(team).reduce((t, i) => t + (i.result?.starts ?? 0), 0)
  const sides = teams.filter(t => t !== '(Drop)')
  const sum = sides.reduce((t, team) => t + total(team), 0)
  const ongoing = trade.items.some(i => i.result?.ongoing)
  return (
    <>
      {sides.length > 1 && sum > 0 && (
        <div className="mb-2">
          <div className="flex h-2 overflow-hidden rounded-full">
            {sides.map(team => (
              <div key={team} style={{ width: `${(total(team) / sum) * 100}%`, background: color(team) }} title={`${team}: ${formatPoints(total(team))}`} />
            ))}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Points each side got out of it{ongoing ? ', so far' : ''} (lineup, regular season)
          </div>
        </div>
      )}
      <div className={cn('grid gap-2', wide && 'gap-x-6 gap-y-3 md:grid-cols-2')}>
        {teams.map(team => (
          <div key={team} className="min-w-0">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              {team !== '(Drop)' && <TeamLogo teamName={team} size={16} className="shrink-0" />}
              <span className="truncate">{team === '(Drop)' ? 'Released' : `${team} got`}</span>
              {team !== '(Drop)' && (
                <span className="ml-auto shrink-0 tabular-nums text-foreground">
                  {formatPoints(total(team))} pts · {starts(team)} starts
                </span>
              )}
            </div>
            <ul className="space-y-0.5 text-sm">
              {got(team).map((item, k) => (
                <li key={k} className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1">
                    {item.kind === 'player' && item.player_id && item.player_id !== playerId ? (
                      <button type="button" onClick={() => openPlayer(item.player_id!)} className="font-medium underline-offset-2 hover:underline">
                        {item.label}
                      </button>
                    ) : (
                      <span className={cn(item.kind === 'player' ? 'font-medium' : 'text-muted-foreground', item.player_id === playerId && 'font-bold')}>
                        {item.label}
                      </span>
                    )}
                    {item.became && (
                      <span className="text-muted-foreground">
                        {' → '}{item.became.round === 1 ? `#${item.became.pick}` : `R${item.became.round} #${item.became.pick}`}{' '}
                        {item.became.player_id === playerId ? (
                          <span className="font-bold text-foreground">{item.became.player ?? 'him'}</span>
                        ) : (
                          <button type="button" onClick={() => openPlayer(item.became!.player_id)} className="font-medium text-foreground underline-offset-2 hover:underline">
                            {item.became.player ?? 'a player'}
                          </button>
                        )}
                        {!item.became.certain && <span title="The round-2 order is partly inferred"> (likely)</span>}
                      </span>
                    )}
                  </span>
                  {item.result && (
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {item.result.traded_on ? `traded on (${teamCode(item.result.drafted_by)} used it)` : `${formatPoints(item.result.points)} pts${item.result.ongoing ? ' +' : ''}`}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  )
}

/** The items a team got in a trade where it sent `sent` (matched by player or pick; names are as at the time) */
function cameBack(trade: Trade, sent: Item, team: string): { team: string; items: Item[] } {
  const same = trade.items.find(i => i.kind === sent.kind && (sent.player_id ? i.player_id === sent.player_id
    : sent.became ? i.became?.player_id === sent.became.player_id : i.label === sent.label))
    ?? (sent.became ? trade.items.find(i => i.player_id === sent.became!.player_id) : undefined)
  const name = same?.from ?? team
  return { team: name, items: trade.items.filter(i => i.to === name) }
}

/** Everything the tree got the team: lineup points, regular season, over every item in it */
function treePoints(items: Item[], team: string, trades: Trades, seen: Set<string>, depth = 0): number {
  return items.reduce((total, item) => {
    let points = total + (item.result?.points ?? 0)
    const next = item.next
    if (next && 'trade' in next && trades[next.trade] && !seen.has(next.trade) && depth < MAX_DEPTH) {
      const back = cameBack(trades[next.trade], item, team)
      points += treePoints(back.items, back.team, trades, new Set([...seen, next.trade]), depth + 1)
    }
    return points
  }, 0)
}

function Node({ item, team, trades, seen, depth }: { item: Item; team: string; trades: Trades; seen: Set<string>; depth: number }) {
  const { openPlayer } = useSelectedPlayer()
  const { openTrade } = useSelectedTrade()
  const next = item.next
  const traded = next && 'trade' in next ? trades[next.trade] : undefined
  const back = traded && !seen.has(next && 'trade' in next ? next.trade : '') && depth < MAX_DEPTH ? cameBack(traded, item, team) : null
  const who = item.kind === 'player' ? { id: item.player_id, name: item.label } : item.became ? { id: item.became.player_id, name: item.became.player } : null
  // A pick with no path: one for a draft still to come, or one the logs can't follow (2020-21's draft order)
  const year = Number(item.label.slice(0, 4))
  const now = new Date()
  const nextDraft = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear()
  const unknown = item.kind === 'pick' && !item.became && !next && !item.result
  return (
    <li className="relative pl-4 before:absolute before:left-0 before:top-[0.7rem] before:h-px before:w-3 before:bg-border">
      <div className="flex items-baseline gap-2 py-0.5 text-sm">
        <span className="min-w-0 flex-1">
          {item.kind === 'pick' && <span className="text-muted-foreground">{item.label}{item.became ? ' → ' : ''}</span>}
          {who?.id ? (
            <button type="button" onClick={() => openPlayer(who.id!)} className="font-medium underline-offset-2 hover:underline">
              {who.name ?? 'a player'}
            </button>
          ) : item.kind !== 'pick' && <span className="text-muted-foreground">{item.label}</span>}
          <span className="ml-1.5 text-xs text-muted-foreground">
            {next && 'dropped' in next && `dropped ${formatDate(next.dropped)}`}
            {next && 'kept' in next && 'still there'}
            {item.result?.traded_on && !traded && `traded on (${teamCode(item.result.drafted_by)} used it)`}
            {unknown && (year >= nextDraft ? 'not used yet' : 'not traced')}
            {traded && next && 'trade' in next && (
              <>
                <button type="button" onClick={() => openTrade(next.trade)} className="underline underline-offset-2 hover:text-foreground"
                        title="Open this trade">
                  traded{traded.date ? ` ${formatDate(traded.date)}` : ''}
                </button>
                {' for:'}
              </>
            )}
          </span>
        </span>
        {item.result && !item.result.traded_on && (
          <span className="shrink-0 text-xs tabular-nums">{formatPoints(item.result.points)}{item.result.ongoing ? '+' : ''}</span>
        )}
      </div>
      {back && back.items.length > 0 && (
        <ul className="ml-1 border-l">
          {back.items.map((child, k) => (
            <Node key={k} item={child} team={back.team} trades={trades} seen={new Set([...seen, next && 'trade' in next ? next.trade : ''])} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}

export function TradeTree({ tradeId }: { tradeId: string }) {
  const { data: trades, isLoading, error } = useTrades(true)
  if (isLoading) return <div className="mt-2 text-xs text-muted-foreground">Loading every trade…</div>
  if (error || !trades) return <div className="mt-2 text-xs text-muted-foreground">The trades couldn&apos;t be loaded.</div>
  const trade = trades[tradeId]
  if (!trade) return null
  const sides = [...new Set(trade.items.map(i => i.to))].filter(t => t !== '(Drop)')
  const seen = new Set([tradeId])
  return (
    <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
      <p className="text-xs leading-snug text-muted-foreground md:col-span-2">
        What each team did with what it got: kept, dropped, or traded on (and what came back, and so on). Points are
        lineup points in the regular season with that team; + is still counting.
      </p>
      {sides.map(team => {
        const items = trade.items.filter(i => i.to === team)
        return (
          <div key={team} className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <TeamLogo teamName={team} size={16} className="shrink-0" />
              <span className="truncate">{team}{team.endsWith('s') ? '\u2019' : '\u2019s'} tree</span>
              <span className="ml-auto shrink-0 tabular-nums">{formatPoints(treePoints(items, team, trades, seen))} pts in all</span>
            </div>
            <ul className={cn('ml-2 mt-1 border-l')}>
              {items.map((item, k) => <Node key={k} item={item} team={team} trades={trades} seen={seen} depth={0} />)}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
