import { useMemo, useState } from 'react'
import { ChevronLeft, Search } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { WidgetSkeleton } from './WidgetSkeleton'
import { TeamLogo } from './TeamLogo'
import { ErrorState } from './ErrorState'
import { TradeSides, TradeTree } from './TradeTree'
import { formatDate } from './PlayerTimeline'
import { fold } from './PlayerPage'
import { Select } from './PlayersWidgets'
import { Trade, useTrades } from '@/lib/players'
import { useSelectedTrade } from '@/lib/selected-trade'
import { teamCode } from '@/lib/teams'

// Players → Trade: one trade, shareable as ?trade=<id> (lib/selected-trade.ts). Each side's items with what
// the team got out of them (TradeSides, shared with the trade panel on the player page) and the trade tree
// for every side. Before a pick: every trade, newest first, by team and by player. From
// data/players/trades.json (pipeline/lineage.py).

const PAGE = 25

type Entry = { id: string; trade: Trade; sides: string[]; text: string }

const sidesOf = (trade: Trade) => [...new Set(trade.items.map(i => i.to))].filter(t => t !== '(Drop)')

/** An item's name in a list: a pick shows who it became */
const itemName = (item: Trade['items'][number]) =>
  item.kind === 'pick' && item.became?.player ? `${item.label} → ${item.became.player}` : item.label

function TradeList({ entries, selectedTeam }: { entries: Entry[]; selectedTeam: string }) {
  const { setTrade } = useSelectedTrade()
  const teams = useMemo(() => [...new Set(entries.flatMap(e => e.sides))].sort(), [entries])
  const [team, setTeam] = useState(teams.includes(selectedTeam) ? selectedTeam : '')
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(PAGE)

  const q = fold(query.trim())
  const rows = entries.filter(e => (!team || e.sides.includes(team)) && (!q || e.text.includes(q)))

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select label="Team" value={team} onChange={v => { setTeam(v); setShown(PAGE) }}
                options={[['', 'Every team'], ...teams.map(t => [t, t] as [string, string])]} />
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={e => { setQuery(e.target.value); setShown(PAGE) }}
            placeholder="Find a player or pick"
            aria-label="Find a trade by player or pick"
            className="h-9 w-full rounded-md border bg-background pl-8 pr-2 text-sm"
          />
        </div>
        <span className="text-sm text-muted-foreground sm:ml-auto">{rows.length} trade{rows.length === 1 ? '' : 's'}</span>
      </div>
      <ul className="divide-y rounded-md border">
        {rows.slice(0, shown).map(({ id, trade, sides }) => (
          <li key={id}>
            <button type="button" onClick={() => setTrade(id)}
                    className="flex w-full flex-col gap-1 px-3 py-2 text-left hover:bg-muted/60 sm:flex-row sm:gap-4">
              <span className="shrink-0 text-xs text-muted-foreground sm:w-24 sm:pt-0.5">
                {trade.date ? formatDate(trade.date) : trade.season}
              </span>
              <span className="grid min-w-0 flex-1 gap-0.5">
                {sides.map(side => (
                  <span key={side} className="flex min-w-0 items-baseline gap-1.5 text-sm">
                    <TeamLogo teamName={side} size={16} className="shrink-0 self-center" />
                    <span className="w-9 shrink-0 font-medium">{teamCode(side)}</span>
                    <span className="line-clamp-2 min-w-0 text-muted-foreground sm:line-clamp-1">
                      {trade.items.filter(i => i.to === side).map(itemName).join(', ') || 'nothing'}
                    </span>
                  </span>
                ))}
              </span>
            </button>
          </li>
        ))}
        {!rows.length && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No trades match.</li>}
      </ul>
      {rows.length > shown && (
        <button type="button" onClick={() => setShown(shown + PAGE)} className="text-sm font-medium text-primary hover:underline">
          Show {Math.min(PAGE, rows.length - shown)} more
        </button>
      )}
    </div>
  )
}

function TradeView({ id, trade }: { id: string; trade: Trade }) {
  const sides = sidesOf(trade)
  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-x-2 gap-y-1 text-lg">
            {sides.map((side, i) => (
              <span key={side} className="inline-flex items-center gap-1.5">
                {i > 0 && <span className="text-muted-foreground">⇄</span>}
                <TeamLogo teamName={side} size={22} />
                {side}
              </span>
            ))}
          </CardTitle>
          <CardDescription>
            {trade.date ? formatDate(trade.date) : 'Date unknown'} · {trade.season}
            {trade.period > 1 ? `, period ${trade.period}` : ', before the season'}
            {' · '}{trade.items.length} item{trade.items.length === 1 ? '' : 's'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TradeSides trade={trade} wide />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">The trade tree</CardTitle>
        </CardHeader>
        <CardContent>
          <TradeTree tradeId={id} />
        </CardContent>
      </Card>
    </>
  )
}

export function TradePageWidget({ selectedTeam }: { selectedTeam: string }) {
  const { tradeId, setTrade } = useSelectedTrade()
  const { data: trades, isLoading, error } = useTrades(true)

  // Newest first; the text to search holds every player's name, and every pick's
  const entries = useMemo<Entry[]>(() => Object.entries(trades ?? {})
    .map(([id, trade]) => ({
      id, trade, sides: sidesOf(trade),
      text: fold(trade.items.map(i => `${i.label} ${i.player ?? ''} ${i.became?.player ?? ''}`).join(' ')),
    }))
    .sort((a, b) => (b.trade.date ?? b.trade.season).localeCompare(a.trade.date ?? a.trade.season)), [trades])

  if (isLoading) return <WidgetSkeleton variant="list" />
  if (error) return <ErrorState />
  const trade = tradeId ? trades?.[tradeId] : undefined

  return (
    <div className="w-full space-y-4">
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Trade</CardTitle>
              <CardDescription>
                Every trade since 2019-20 and how it turned out. Open one from a player&apos;s page or the list below; the link
                can be shared.
              </CardDescription>
            </div>
            {tradeId && (
              <button type="button" onClick={() => setTrade(null)}
                      className="inline-flex shrink-0 items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground">
                <ChevronLeft className="h-4 w-4" /> Every trade
              </button>
            )}
          </div>
          {tradeId && !trade && (
            <p className="text-sm text-muted-foreground">This trade isn&apos;t in the transaction log.</p>
          )}
        </CardHeader>
        {!trade && (
          <CardContent>
            {entries.length ? <TradeList entries={entries} selectedTeam={selectedTeam} />
              : <p className="text-sm text-muted-foreground">No trades yet.</p>}
          </CardContent>
        )}
      </Card>
      {trade && tradeId && <TradeView id={tradeId} trade={trade} />}
    </div>
  )
}
