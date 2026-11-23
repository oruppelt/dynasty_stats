import { ArrowRight, Crown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { TeamLogo } from './TeamLogo'
import { PlayerName } from './PlayerName'
import { TeamAchievement, achievementLine, signed, useHonor } from '@/lib/honor'
import { ordinal as ordinalRank } from '@/lib/standings'
import { useSelectedFranchise } from '@/lib/selected-franchise'
import { cn } from '@/lib/utils'

// Honor achievements as a list (pipeline/honor.py, data/honor.json): the Recap's "Honor this period" (and its
// PDF, `plain`: no links, logos loaded right away) and My Team's season. Positive honor first.

const isMilestone = (e: TeamAchievement) => e.kind === 'player_6000' || e.kind === 'player_17000'

/** The honor badge: gold for a title or the top milestone, red when honor is lost */
export function HonorBadge({ e, className }: { e: TeamAchievement; className?: string }) {
  const tone = e.points < 0 ? 'bg-destructive/10 text-destructive'
    : e.kind === 'title' || e.kind === 'player_17000' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
    : 'bg-primary/10 text-primary'
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-bold tabular-nums', tone, className)}>
      <Crown className="h-3.5 w-3.5" aria-hidden />{signed(e.points)}
    </span>
  )
}

export function HonorList({ events, showTeam = true, plain, className }: {
  events: TeamAchievement[];
  /** The team's logo and name on each row (off on My Team: it's all one team) */
  showTeam?: boolean;
  plain?: boolean;
  className?: string;
}) {
  const openFranchise = useSelectedFranchise(state => state.openFranchise)
  return (
    <ul className={cn('grid gap-x-8', className)}>
      {events.map((e, i) => (
        <li key={`${e.team}-${e.kind}-${e.player_id ?? ''}-${i}`} className="flex items-center gap-3 border-b py-2.5">
          {showTeam && <TeamLogo teamName={e.team} size={32} className="shrink-0" eager={plain} />}
          <div className="min-w-0 flex-1">
            {showTeam && (plain
              ? <div className="truncate font-semibold">{e.team}</div>
              : (
                <button type="button" onClick={() => openFranchise(e.team)} title={`${e.team}: franchise page`}
                        className="block max-w-full truncate text-left font-semibold underline-offset-2 hover:underline focus:outline-hidden focus-visible:underline">
                  {e.team}
                </button>
              ))}
            <div className={cn('text-sm', showTeam ? 'text-muted-foreground' : 'text-foreground')}>
              {isMilestone(e) && e.player ? (
                <span className="inline-flex max-w-full flex-wrap items-baseline gap-x-1">
                  {plain || !e.player_id
                    ? <span className="font-medium text-foreground">{e.player}</span>
                    : <PlayerName id={e.player_id} name={e.player} className="inline font-medium text-foreground" />}
                  <span>{achievementLine(e)}</span>
                </span>
              ) : achievementLine(e)}
              {!showTeam && e.recap_period && isMilestone(e) && <span className="text-muted-foreground"> · period {e.recap_period}</span>}
            </div>
          </div>
          <HonorBadge e={e} />
        </li>
      ))}
    </ul>
  )
}

/** The Recap's card: the honor earned in a period; nothing when there's none. In the regular season's last
 * period, also what the season's end decided (title, final, standings, season high and low). */
export function PeriodHonorCard({ events, plain }: { events: TeamAchievement[]; plain?: boolean }) {
  if (!events.length) return null
  const seasonEnd = events.some(e => !isMilestone(e))
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Crown className="h-5 w-5 text-amber-500" aria-hidden />Honor this period
        </CardTitle>
        <CardDescription>
          {seasonEnd
            ? 'The season is decided: the honor for the title, the final, the standings and the season’s high and low, with this period’s milestones.'
            : 'Honor earned this period: players passing a points milestone for their franchise.'}
          {!plain && ' Tap a team for its franchise page.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <HonorList events={events} plain={plain} className={plain ? 'grid-cols-2' : 'grid-cols-1 md:grid-cols-2'} />
      </CardContent>
    </Card>
  )
}

/** My Team's card: every bit of honor the team has earned this season, its season total, and the franchise's
 * honor over every season (with a way to its franchise page). */
export function SeasonHonorCard({ team, season }: { team: string; season: string }) {
  const { data } = useHonor()
  const openFranchise = useSelectedFranchise(state => state.openFranchise)
  const f = data?.franchises[team]
  if (!f) return null
  const row = f.seasons.find(s => s.season === season)
  const events = (row?.events ?? []).map(e => ({ ...e, team }))
    .sort((a, b) => (a.recap_period ?? 0) - (b.recap_period ?? 0) || b.points - a.points)
  const points = row?.points ?? 0
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Crown className="h-5 w-5 text-amber-500" aria-hidden />Honor this season
          </CardTitle>
          <CardDescription>
            Rare achievements earn honor (a title, a milestone); the standings&apos; bottom costs some. The franchise
            spends it on rewards: a retired jersey, a motto.
          </CardDescription>
        </div>
        <div className="shrink-0 text-right">
          <div className={cn('text-3xl font-bold tabular-nums', points < 0 && 'text-destructive')}>{signed(points)}</div>
          <div className="text-xs text-muted-foreground">{season}</div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {events.length
          ? <HonorList events={events} showTeam={false} className="grid-cols-1" />
          : <p className="text-sm text-muted-foreground">No honor yet this season. A player passing 6,000 or 17,000 points for the franchise earns some; the rest is decided at the season&apos;s end.</p>}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
          <span className="text-muted-foreground">
            The franchise: <span className="font-semibold text-foreground tabular-nums">{f.honor}</span> honor, {ordinalRank(f.rank)} in the league
            {f.spent ? <>, <span className="tabular-nums">{f.balance}</span> left to spend</> : ''}
          </span>
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => openFranchise(team)}>
            Franchise page <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
