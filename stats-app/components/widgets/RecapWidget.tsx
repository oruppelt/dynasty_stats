import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { Check, ChevronLeft, ChevronRight, FileDown, Loader2, Share2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { WidgetSkeleton } from './WidgetSkeleton'
import { ErrorState } from './ErrorState'
import { GameList, RecapHighlights } from './RecapParts'
import { RecapReport } from './RecapReport'
import { LeagueData, PeriodResult, useLeagueData } from '@/lib/league-data'
import { Game, Recap, periodRecap, resultsByPeriod } from '@/lib/season'
import { periodDates } from '@/lib/schedule'
import { savePdf } from '@/lib/pdf'
import { getUrlParam, setUrlParam } from '@/lib/url'

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

/** The recap as a PDF to download or share. The report is drawn off screen only while the file is made. */
function PdfButton({ league, period, recap }: { league: LeagueData; period: number; recap: Recap }) {
  const [busy, setBusy] = useState(false)
  const report = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!busy || !report.current) return
    savePdf(report.current, `recap-${league.meta.season}-period-${period}.pdf`, `Period ${period} recap, ${league.meta.season}`)
      .catch(() => toast.error('Could not make the PDF. Try again?'))
      .finally(() => setBusy(false))
  }, [busy, league, period])

  return (
    <>
      <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setBusy(true)} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
        PDF
      </Button>
      {busy && createPortal(
        <div aria-hidden className="pointer-events-none fixed top-0 -left-[10000px]">
          <RecapReport ref={report} league={league} period={period} recap={recap} />
        </div>,
        document.body,
      )}
    </>
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
              {periodDates(league, period) && <span className="font-medium text-foreground">{periodDates(league, period)}. </span>}
              {period === league.meta.latest_period ? 'The latest scoring period. ' : ''}
              &ldquo;Beat 12&rdquo; next to a score: it beat 12 of the other {rows.length - 1} teams&apos; scores that period.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PeriodPicker period={period} periods={periods} onChange={pick} />
            <ShareButton period={period} />
            <PdfButton league={league} period={period} recap={recap} />
          </div>
        </CardHeader>
      </Card>

      <RecapHighlights recap={recap} className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">All games</CardTitle>
          <CardDescription>Highest winning score first{selectedTeam ? '; your game at the top' : ''}.</CardDescription>
        </CardHeader>
        <CardContent>
          <GameList games={games} className="grid-cols-1 md:grid-cols-2" isMine={isMine} />
        </CardContent>
      </Card>
    </div>
  )
}
