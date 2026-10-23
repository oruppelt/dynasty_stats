import { useMemo, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Share2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { WidgetSkeleton } from './WidgetSkeleton'
import { TeamLogo } from './TeamLogo'
import { ErrorState } from './ErrorState'
import { PeriodResult, useLeagueData } from '@/lib/league-data'
import { Game, formatScore, periodRecap, resultsByPeriod } from '@/lib/season'
import { formatCount } from '@/lib/standings'
import { getUrlParam, setUrlParam } from '@/lib/url'
import { cn } from '@/lib/utils'

const others = (r: PeriodResult) => r.all_play_wins + r.all_play_losses
const score = (r: PeriodResult) => `${formatScore(r.score)}–${formatScore(r.opp_score)}`

function HighlightTile({ label, team, value, detail }: {
  label: string;
  team: string;
  value: string;
  detail: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="mt-2 flex items-center gap-2">
          <TeamLogo teamName={team} size={28} className="shrink-0" />
          <span className="min-w-0 truncate font-semibold">{team}</span>
        </div>
        <div className="mt-2 text-3xl font-bold tabular-nums">{value}</div>
        <div className="mt-1 text-sm text-muted-foreground">{detail}</div>
      </CardContent>
    </Card>
  )
}

function GameSide({ r, won }: { r: PeriodResult; won: boolean }) {
  return (
    <div className={cn('flex items-center gap-2', !won && 'text-muted-foreground')}>
      <TeamLogo teamName={r.team} size={24} className="shrink-0" />
      <span className={cn('min-w-0 flex-1 truncate', won && 'font-semibold')}>{r.team}</span>
      <span className={cn('tabular-nums', won && 'font-semibold')}>{formatScore(r.score)}</span>
      <span className="w-14 shrink-0 text-right text-xs text-muted-foreground tabular-nums">beat {formatCount(r.all_play_wins)}</span>
    </div>
  )
}

function PeriodPicker({ period, periods, onChange }: {
  period: number;
  periods: number[];
  onChange: (period: number) => void;
}) {
  const index = periods.indexOf(period)
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon"
        className="h-9 w-9"
        disabled={index <= 0}
        onClick={() => onChange(periods[index - 1])}
        aria-label="Previous period"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <select
        value={period}
        onChange={e => onChange(Number(e.target.value))}
        aria-label="Scoring period"
        className="h-9 rounded-md border bg-background px-2 text-sm font-medium"
      >
        {[...periods].reverse().map(p => <option key={p} value={p}>Period {p}</option>)}
      </select>
      <Button
        variant="outline"
        size="icon"
        className="h-9 w-9"
        disabled={index >= periods.length - 1}
        onClick={() => onChange(periods[index + 1])}
        aria-label="Next period"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
}

/** Shares a link to this period's recap: the share sheet on phones, else the clipboard. */
function ShareButton({ period }: { period: number }) {
  const [copied, setCopied] = useState(false)

  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}?period=${period}`
    try {
      if (navigator.share) {
        await navigator.share({ title: `Period ${period} recap`, url })
      } else {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch {
      // Share sheet closed, or clipboard blocked: nothing to do
    }
  }

  return (
    <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={share}>
      {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
      {copied ? 'Link copied' : 'Share'}
    </Button>
  )
}

export function RecapWidget({ selectedTeam }: { selectedTeam: string }) {
  const { data: league, isLoading, error } = useLeagueData()
  const byPeriod = useMemo(() => league ? resultsByPeriod(league.results) : new Map<number, PeriodResult[]>(), [league])
  // null: follow the latest period, also after the data refreshes. A ?period= link picks one.
  const [picked, setPicked] = useState<number | null>(() => Number(getUrlParam('period')) || null)

  const pick = (period: number) => {
    setPicked(period)
    setUrlParam('period', String(period))
  }

  if (isLoading) return <WidgetSkeleton variant="list" />
  if (error || !league) return <ErrorState />

  const periods = [...byPeriod.keys()]
  const period = picked !== null && byPeriod.has(picked) ? picked : periods[periods.length - 1]
  const rows = byPeriod.get(period)
  if (!rows) return <ErrorState />

  const recap = periodRecap(rows)
  const isMine = (g: Game) => g.winner.team === selectedTeam || g.loser.team === selectedTeam
  // The viewer's own game goes first
  const games = [...recap.games.filter(isMine), ...recap.games.filter(g => !isMine(g))]

  return (
    <div className="w-full space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle>Period {period} recap</CardTitle>
            <CardDescription>
              {period === league.meta.latest_period ? 'The latest scoring period. ' : ''}
              &ldquo;Beat 12&rdquo; next to a score: it beat 12 of the other {rows.length - 1} teams&apos; scores that period.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <PeriodPicker period={period} periods={periods} onChange={pick} />
            <ShareButton period={period} />
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <HighlightTile
          label="Top score"
          team={recap.top.team}
          value={formatScore(recap.top.score)}
          detail={`${recap.top.win === 1 ? 'Beat' : 'Lost to'} ${recap.top.opponent}`}
        />
        <HighlightTile
          label="Lowest score"
          team={recap.lowest.team}
          value={formatScore(recap.lowest.score)}
          detail={`${recap.lowest.win === 1 ? 'Beat' : 'Lost to'} ${recap.lowest.opponent}`}
        />
        {recap.unluckiestLoss && (
          <HighlightTile
            label="Unluckiest loss"
            team={recap.unluckiestLoss.team}
            value={score(recap.unluckiestLoss)}
            detail={`Lost to ${recap.unluckiestLoss.opponent} with a score that beat ${formatCount(recap.unluckiestLoss.all_play_wins)} of the other ${others(recap.unluckiestLoss)} teams`}
          />
        )}
        {recap.luckiestWin && (
          <HighlightTile
            label="Luckiest win"
            team={recap.luckiestWin.team}
            value={score(recap.luckiestWin)}
            detail={`Beat ${recap.luckiestWin.opponent} with a score that beat only ${formatCount(recap.luckiestWin.all_play_wins)} of the other ${others(recap.luckiestWin)} teams`}
          />
        )}
        <HighlightTile
          label="Biggest blowout"
          team={recap.blowout.winner.team}
          value={`+${formatScore(recap.blowout.margin)}`}
          detail={`Beat ${recap.blowout.loser.team} ${score(recap.blowout.winner)}`}
        />
        <HighlightTile
          label="Closest game"
          team={recap.closest.winner.team}
          value={recap.closest.margin === 0 ? 'Tie' : `+${formatScore(recap.closest.margin)}`}
          detail={`${recap.closest.margin === 0 ? 'Tied' : 'Beat'} ${recap.closest.loser.team} ${score(recap.closest.winner)}`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">All games</CardTitle>
          <CardDescription>Highest winning score first{selectedTeam ? '; your game at the top' : ''}.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
            {games.map(g => (
              <li
                key={g.winner.team}
                className={cn('space-y-1.5 border-b px-2 py-2 text-sm', isMine(g) && 'rounded-md border-transparent bg-muted')}
              >
                <GameSide r={g.winner} won={g.margin > 0} />
                <GameSide r={g.loser} won={false} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
