import { forwardRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { GameList, RecapHighlights } from './RecapParts'
import type { LeagueData } from '@/lib/league-data'
import type { Recap } from '@/lib/season'
import { periodDates } from '@/lib/schedule'

export const REPORT_WIDTH = 800

/**
 * A period's recap laid out for the PDF: a fixed width and the light theme, so the file looks the same
 * from a phone or in dark mode. Fixed columns, not breakpoints (those follow the screen, not this box).
 */
export const RecapReport = forwardRef<HTMLDivElement, { league: LeagueData; period: number; recap: Recap }>(
  function RecapReport({ league, period, recap }, ref) {
    const dates = periodDates(league, period)
    const teams = league.matchups.teams.length
    return (
      <div ref={ref} className="theme-light space-y-4 bg-background p-8 text-foreground" style={{ width: REPORT_WIDTH }}>
        <div className="space-y-1">
          <div className="text-sm font-medium text-muted-foreground">NBA Fantasy Stats · {league.meta.season}</div>
          <div className="text-3xl font-bold tracking-tight">Period {period} recap</div>
          {dates && <div className="text-base text-muted-foreground">{dates}</div>}
        </div>

        <RecapHighlights recap={recap} className="grid-cols-3" eager />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">All games</CardTitle>
            <CardDescription>
              Highest winning score first. &ldquo;Beat 12&rdquo; next to a score: it beat 12 of the
              other {teams - 1} teams&apos; scores that period.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GameList games={recap.games} className="grid-cols-2" eager />
          </CardContent>
        </Card>

        <div className="text-xs text-muted-foreground">
          {window.location.origin}/?season={league.meta.season}&amp;period={period}
        </div>
      </div>
    )
  },
)
