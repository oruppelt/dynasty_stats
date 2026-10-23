import { useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { WidgetSkeleton } from './WidgetSkeleton'
import { TeamLogo } from './TeamLogo'
import { ErrorState } from './ErrorState'
import { HeatmapScale, MatrixHeatmap } from './MatrixHeatmap'
import { AllTime, useAllTime } from '@/lib/alltime'
import type { MatrixRow } from '@/lib/league-data'
import { formatRecord } from '@/lib/standings'
import { cn } from '@/lib/utils'

const SCALE: HeatmapScale = {
  edges: [0.2, 0.35, 0.45, 0.55, 0.65, 0.8],
  edgeLabels: ['20%', '35%', '45%', '55%', '65%', '80%'],
  lowCaption: 'Row team usually loses',
  highCaption: 'Usually wins',
}

const pctLabel = (pct: number) => `${Math.round(pct * 100)}%`

interface Meeting {
  opponent: string;
  wins: number;
  games: number;
  playoffWins: number;
  playoffGames: number;
}

function meetings(data: AllTime, team: string): Meeting[] {
  const h = data.head_to_head
  const row = (m: MatrixRow[]) => m.find(r => r.Team === team)
  const [wins, games, pWins, pGames] = [h.wins, h.games, h.playoff_wins, h.playoff_games].map(row)
  return h.teams
    .filter(o => o !== team && typeof games?.[o] === 'number')
    .map(o => ({
      opponent: o,
      wins: wins?.[o] as number,
      games: games?.[o] as number,
      playoffWins: (pWins?.[o] as number | null) ?? 0,
      playoffGames: (pGames?.[o] as number | null) ?? 0,
    }))
    .sort((a, b) => b.wins / b.games - a.wins / a.games || b.games - a.games || a.opponent.localeCompare(b.opponent))
}

/** A bar from the middle: right of it for a winning record, left for a losing one. */
function PctBar({ pct }: { pct: number }) {
  const width = `${Math.abs(pct - 0.5) * 100}%`
  return (
    <span className="relative hidden h-2 w-24 shrink-0 rounded-full bg-muted sm:block">
      <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
      <span
        className={cn('absolute inset-y-0 rounded-full', pct >= 0.5 ? 'left-1/2 bg-lucky' : 'right-1/2 bg-very-unlucky')}
        style={{ width }}
      />
    </span>
  )
}

function TeamMeetings({ data, team, onTeam }: { data: AllTime; team: string; onTeam: (team: string) => void }) {
  const list = meetings(data, team)
  const playoffMeetings = list.filter(m => m.playoffGames > 0)

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Head to head, all seasons</CardTitle>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Team</span>
            <select
              value={team}
              onChange={e => onTeam(e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm font-medium"
            >
              {data.head_to_head.teams.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </div>
        <CardDescription>
          {team}&apos;s regular-season record against every team since {data.seasons[data.seasons.length - 1].season},
          best first.
          {playoffMeetings.length > 0 && ' Playoff games are listed separately.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-3 sm:px-6">
        <ol className="divide-y">
          {list.map(m => {
            const pct = m.wins / m.games
            return (
              <li key={m.opponent} className="flex items-center gap-2 px-1.5 py-1.5 text-sm">
                <TeamLogo teamName={m.opponent} size={22} className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="truncate">{m.opponent}</div>
                  {m.playoffGames > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Playoffs: {formatRecord(m.playoffWins, m.playoffGames - m.playoffWins)}
                    </div>
                  )}
                </div>
                <PctBar pct={pct} />
                <span className="w-14 shrink-0 text-right font-semibold tabular-nums">{formatRecord(m.wins, m.games - m.wins)}</span>
                <span className="w-10 shrink-0 text-right text-muted-foreground tabular-nums">{pctLabel(pct)}</span>
              </li>
            )
          })}
        </ol>
      </CardContent>
    </Card>
  )
}

export function CareerHeadToHeadWidget({ selectedTeam }: { selectedTeam: string }) {
  const { data, isLoading, error } = useAllTime()
  const [picked, setPicked] = useState<string | null>(null)
  const pcts = useMemo<MatrixRow[]>(() => {
    if (!data) return []
    const games = new Map(data.head_to_head.games.map(r => [r.Team, r]))
    return data.head_to_head.wins.map(row => {
      const out: MatrixRow = { Team: row.Team }
      for (const o of data.head_to_head.teams) {
        const g = games.get(row.Team)?.[o]
        out[o] = typeof g === 'number' && g > 0 ? (row[o] as number) / g : null
      }
      return out
    })
  }, [data])

  if (isLoading) return <WidgetSkeleton variant="list" />
  if (error || !data) return <ErrorState />

  const teams = data.head_to_head.teams
  const team = picked ?? (selectedTeam || teams[0])
  const record = (a: string, b: string) => {
    const m = meetings(data, a).find(m => m.opponent === b)
    return m ? formatRecord(m.wins, m.games - m.wins) : ''
  }

  return (
    <div className="w-full space-y-4">
      <TeamMeetings data={data} team={team} onTeam={setPicked} />
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Every pairing</CardTitle>
          <CardDescription>The row team&apos;s regular-season win rate against the column team, all seasons.</CardDescription>
        </CardHeader>
        <CardContent>
          <MatrixHeatmap
            teams={teams}
            matrix={pcts}
            selectedTeam={selectedTeam}
            scale={SCALE}
            formatCell={p => String(Math.round(p * 100))}
            formatValue={pctLabel}
            minLabelWidth={24}
            listTitle={t => `${t} against each team`}
            detail={(t, o) => record(t, o)}
            tooltip={(t, o, p) => (
              <>
                <div className="font-semibold">{t} vs {o}</div>
                <div className="mt-1 text-muted-foreground">
                  <span className="font-semibold text-foreground tabular-nums">{record(t, o)}</span> ({pctLabel(p)})
                </div>
              </>
            )}
          />
        </CardContent>
      </Card>
    </div>
  )
}
