import { ReactNode, useMemo } from 'react'
import { ArrowLeftRight, ArrowRight, Flame, Handshake, Medal, Repeat, Shirt, Swords, Trophy, Zap } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { WidgetSkeleton } from './WidgetSkeleton'
import { ErrorState } from './ErrorState'
import { TeamLogo } from './TeamLogo'
import { PlayerName } from './PlayerName'
import { formatDate } from './PlayerTimeline'
import { teamColors } from './FranchisePage'
import { SeasonRivalry } from './RivalryWidget'
import { useAllTime } from '@/lib/alltime'
import { useLeagueData } from '@/lib/league-data'
import { Meeting, Rivalry, RivalryTrade, Side, Streak, TradeItem, stageLabel, useRivalries } from '@/lib/rivalry'
import { useSelectedRivalry } from '@/lib/selected-rivalry'
import { useSelectedTrade } from '@/lib/selected-trade'
import { upcomingGames } from '@/lib/schedule'
import { formatScore } from '@/lib/season'
import { formatCount, formatPoints, formatRecord } from '@/lib/standings'
import { useChartTheme } from '@/lib/chart-theme'
import { teamLineColor } from '@/lib/nba-team-colors'
import { teamCode } from '@/lib/teams'
import { cn } from '@/lib/utils'

// History → Rivalry: two franchises over every season, shareable as ?rivals=<team>,<team>
// (lib/selected-rivalry.ts). A header in both teams' colors with the all-time record, storylines worked out from
// the data, the timeline of every meeting and trade, the rivalry's records, its players, and this season's
// comparison (RivalryWidget's SeasonRivalry). From data/rivalries/<team>.json (pipeline/rivalry.py).

const SHORT = (season: string) => season.slice(2) // 2024-25 → 24-25
const at = (m: { season: string; period: number }) => `${SHORT(m.season)} P${m.period}`

/** Whose side a Side is */
const who = (side: Side | null | undefined, a: string, b: string) => side === 'team' ? a : side === 'opponent' ? b : null

/** The default pair: the viewer's team and its next opponent (else the latest), or the first two teams */
function useDefaultPair(selectedTeam: string, teams: string[]): [string, string] | null {
  const { data: league } = useLeagueData()
  if (!teams.length) return null
  const a = selectedTeam && teams.includes(selectedTeam) ? selectedTeam : teams[0]
  const next = league ? upcomingGames(league, a, 99).find(g => g.opponent)?.opponent : null
  const latest = league?.results.filter(r => r.team === a).sort((x, y) => y.period - x.period)[0]?.opponent
  const b = [next, latest, teams.find(t => t !== a)].find(t => t && t !== a && teams.includes(t)) as string
  return [a, b]
}

// ---------------------------------------------------------------------------------------------------- Hero

function TeamSide({ team, align }: { team: string; align: 'left' | 'right' }) {
  return (
    <div className={cn('flex min-w-0 flex-col items-center gap-2 text-center sm:flex-row sm:gap-4',
      align === 'right' && 'sm:flex-row-reverse sm:text-right', align === 'left' && 'sm:text-left')}>
      <div className="shrink-0 rounded-full bg-white/90 p-2 shadow-lg ring-4 ring-white/20 sm:p-2.5">
        <TeamLogo key={team} teamName={team} size={56} />
      </div>
      <div className="min-w-0 text-base font-black leading-tight tracking-tight sm:text-2xl">{team}</div>
    </div>
  )
}

function Hero({ a, b, r, teams, onPick }: {
  a: string; b: string; r: Rivalry; teams: string[]; onPick: (a: string, b: string) => void
}) {
  const ca = teamColors(a)
  const cb = teamColors(b)
  const leader = r.wins > r.losses ? a : r.losses > r.wins ? b : null
  const streakTeam = r.streak ? who(r.streak.side, a, b) : null
  const last = r.meetings[r.meetings.length - 1]
  const pick = (side: 'a' | 'b', team: string) => {
    const other = side === 'a' ? b : a
    if (team === other) onPick(b, a)
    else onPick(side === 'a' ? team : a, side === 'b' ? team : b)
  }
  return (
    <div className="relative overflow-hidden rounded-xl border shadow-sm text-white">
      {/* Each team's half in its color, meeting on a slant */}
      <div className="absolute inset-0" style={{ background: ca.primary }} />
      <div className="absolute inset-0" style={{ background: cb.primary, clipPath: 'polygon(58% 0, 100% 0, 100% 100%, 42% 100%)' }} />
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 to-black/40" />
      <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-2 p-4 sm:gap-6 sm:p-6">
        <div style={{ color: ca.fg }}><TeamSide team={a} align="left" /></div>
        <div className="rounded-xl bg-black/35 px-3 py-3 text-center backdrop-blur-sm sm:px-6">
          <div className="text-[10px] font-semibold uppercase tracking-widest opacity-80 sm:text-xs">All-time</div>
          <div className="text-4xl font-black tabular-nums leading-none sm:text-6xl">
            {formatCount(r.wins)}<span className="mx-1 opacity-60">–</span>{formatCount(r.losses)}
          </div>
          <div className="mt-1 text-xs opacity-90 sm:text-sm">
            {r.games ? 'regular season' : 'never met'}
          </div>
          {r.playoff_games > 0 && (
            <div className="mt-1.5 rounded-md bg-amber-400/20 px-2 py-0.5 text-xs font-semibold text-amber-200 sm:text-sm">
              Playoffs {formatRecord(r.playoff_wins, r.playoff_losses)}
            </div>
          )}
        </div>
        <div style={{ color: cb.fg }}><TeamSide team={b} align="right" /></div>
      </div>
      <div className="relative flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-black/40 px-4 py-2 text-center text-xs sm:text-sm">
        {leader && <span><span className="font-semibold">{teamCode(leader)}</span> leads the series</span>}
        {!leader && r.games > 0 && <span>Dead even</span>}
        {r.streak && streakTeam && (
          <span className="inline-flex items-center gap-1">
            <Flame className="h-3.5 w-3.5 text-amber-300" />
            {teamCode(streakTeam)} {r.streak.length > 1 ? `has won ${r.streak.length} straight` : 'won the last one'}
          </span>
        )}
        {last && <span className="opacity-80">Last met {at(last)}: {formatScore(last.score)}–{formatScore(last.opp_score)}</span>}
        {r.meetings.length > 0 && (
          <span className="opacity-80">
            Avg {formatScore(r.points_for / r.meetings.length)}–{formatScore(r.points_against / r.meetings.length)}
          </span>
        )}
      </div>
      <div className="relative flex items-center gap-2 bg-black/55 px-3 py-2 [&_select]:h-8 [&_select]:min-w-0 [&_select]:flex-1 [&_select]:rounded-md [&_select]:border [&_select]:border-white/30 [&_select]:bg-black/30 [&_select]:px-2 [&_select]:text-sm [&_select]:text-white">
        <select aria-label="First team" value={a} onChange={e => pick('a', e.target.value)}>
          {teams.map(t => <option key={t} value={t} className="text-black">{t}</option>)}
        </select>
        <button type="button" onClick={() => onPick(b, a)} aria-label="Swap the teams" title="Swap"
                className="shrink-0 rounded-md border border-white/30 p-1.5 hover:bg-white/10">
          <ArrowLeftRight className="h-4 w-4" />
        </button>
        <select aria-label="Second team" value={b} onChange={e => pick('b', e.target.value)}>
          {teams.map(t => <option key={t} value={t} className="text-black">{t}</option>)}
        </select>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------- Storylines

interface Story { icon: typeof Flame; title: string; text: ReactNode; tone?: 'gold' }

export function stories(a: string, b: string, r: Rivalry): Story[] {
  const out: Story[] = []
  const name = (side: Side | null | undefined) => who(side, a, b) ?? ''
  const total = r.games + r.playoff_games
  // One side's dominance
  if (r.games >= 4) {
    const share = r.wins / r.games
    if (share >= 0.7 || share <= 0.3) {
      const top = share >= 0.7 ? a : b
      out.push({ icon: Swords, title: 'One-way traffic', text: <>{top} has won {Math.round(Math.max(share, 1 - share) * 100)}% of their regular-season games.</> })
    } else if (Math.abs(r.wins - r.losses) <= 1) {
      out.push({ icon: Swords, title: 'Neck and neck', text: <>{formatRecord(r.wins, r.losses)} after {r.games} regular-season games.</> })
    }
  }
  if (r.streak && r.streak.length >= 3) {
    out.push({ icon: Flame, title: `${r.streak.length} in a row`, text: <>{name(r.streak.side)} has won the last {r.streak.length} meetings, since {at(r.streak.from)}.</> })
  }
  const series = r.series
  if (series.length) {
    const final = series.find(s => s.round === 'Final')
    out.push({
      icon: Trophy, tone: final ? 'gold' : undefined,
      title: final ? 'They met in a final' : `Playoff series: ${series.length}`,
      text: <>{series.map((s, i) => (
        <span key={i}>{i > 0 && '; '}{s.round} {s.season}: {s.won ? a : b} {Math.max(s.wins, s.losses)}-{Math.min(s.wins, s.losses)}</span>
      ))}.</>,
    })
  } else if (r.playoff_games) {
    out.push({ icon: Trophy, title: 'Playoff meetings', text: <>{r.playoff_games} in the playoffs: {a} {formatRecord(r.playoff_wins, r.playoff_losses)}.</> })
  }
  // The rivalry's top scorer, either side
  const scorers = [...r.players.team.map(p => ({ ...p, side: 'team' as Side })), ...r.players.opponent.map(p => ({ ...p, side: 'opponent' as Side }))]
    .sort((x, y) => y.points - x.points)
  if (scorers[0]) {
    const p = scorers[0]
    out.push({ icon: Zap, title: 'Rivalry killer', text: <><PlayerName id={p.player_id} name={p.player} className="inline font-semibold" /> has scored {formatPoints(p.points)} for {name(p.side)} in {p.games} games against {name(p.side === 'team' ? 'opponent' : 'team')}.</> })
  }
  if (r.trades.length) {
    const got = r.trades.reduce((s, t) => s + t.got_points, 0)
    const gave = r.trades.reduce((s, t) => s + t.gave_points, 0)
    const ahead = got > gave ? a : gave > got ? b : null
    out.push({
      icon: Handshake, title: `${r.trades.length} trade${r.trades.length > 1 ? 's' : ''}`,
      text: ahead
        ? <>{ahead} came out ahead: its new players scored {formatPoints(Math.max(got, gave))} for it, against {formatPoints(Math.min(got, gave))}.</>
        : <>Even so far: what each got has scored the same.</>,
    })
  }
  if (r.players.both[0]) {
    const p = r.players.both[0]
    const n = r.players.both.length
    out.push({ icon: Repeat, title: n > 1 ? `${n} played for both` : 'Played for both', text: <><PlayerName id={p.player_id} name={p.player} className="inline font-semibold" /> scored {formatPoints(p.team_points)} for {a} and {formatPoints(p.opponent_points)} for {b}{n > 1 ? `, the most of the ${n}` : ''}.</> })
  }
  if (!total) out.push({ icon: Swords, title: 'Never met', text: <>{a} and {b} haven&apos;t played each other yet.</> })
  return out
}

function Storylines({ a, b, r }: { a: string; b: string; r: Rivalry }) {
  const list = stories(a, b, r)
  if (!list.length) return null
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {list.map(s => (
        <Card key={s.title} className={cn(s.tone === 'gold' && 'border-amber-500/50 bg-amber-500/5')}>
          <CardContent className="flex gap-3 p-3 sm:p-4">
            <s.icon className={cn('mt-0.5 h-5 w-5 shrink-0', s.tone === 'gold' ? 'text-amber-500' : 'text-muted-foreground')} />
            <div className="min-w-0">
              <div className="font-semibold">{s.title}</div>
              <div className="text-sm text-muted-foreground">{s.text}</div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------- Timeline

type Entry = { kind: 'game'; m: Meeting } | { kind: 'trade'; t: RivalryTrade }

function Items({ items, team }: { items: TradeItem[]; team: string }) {
  return (
    <div className="flex min-w-0 gap-2 text-sm">
      <span className="w-10 shrink-0 font-semibold">{teamCode(team)}</span>
      <span className="min-w-0 text-muted-foreground">
        {items.length ? items.map((i, n) => (
          <span key={n}>
            {n > 0 && ', '}
            {i.kind === 'player' && i.player_id
              ? <PlayerName id={i.player_id} name={i.label} className="inline text-foreground" />
              : <span className="text-foreground">{i.label}</span>}
            {i.kind === 'pick' && i.player && i.player_id && <> (<PlayerName id={i.player_id} name={i.player} className="inline" />)</>}
            {i.points !== undefined && i.points > 0 && <span className="tabular-nums"> {formatPoints(i.points)}</span>}
          </span>
        )) : 'nothing'}
      </span>
    </div>
  )
}

function Timeline({ a, b, r }: { a: string; b: string; r: Rivalry }) {
  const { isDark } = useChartTheme()
  const openTrade = useSelectedTrade(state => state.openTrade)
  const entries: Entry[] = [...r.meetings.map(m => ({ kind: 'game' as const, m })), ...r.trades.map(t => ({ kind: 'trade' as const, t }))]
    .sort((x, y) => {
      const key = (e: Entry) => e.kind === 'game' ? [e.m.season, e.m.period, 1] : [e.t.season, e.t.period ?? 0, 0]
      const [sx, px, kx] = key(x), [sy, py, ky] = key(y)
      return sx < sy ? -1 : sx > sy ? 1 : (px as number) - (py as number) || (kx as number) - (ky as number)
    })
  const seasons = [...new Set(entries.map(e => e.kind === 'game' ? e.m.season : e.t.season))]
  const big = r.records.biggest_win
  const high = r.records.highest_score
  const close = r.records.closest_game
  const same = (x: Meeting | undefined, m: Meeting) => !!x && x.season === m.season && x.period === m.period && x.stage === m.stage

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg"><Swords className="h-5 w-5 text-muted-foreground" />Timeline</CardTitle>
        <CardDescription>
          Every meeting and every trade between them, oldest first: {a}&apos;s score on the left, the winner&apos;s logo
          in front. Playoff games in gold.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!entries.length && <p className="text-sm text-muted-foreground">Nothing yet.</p>}
        <ol className="space-y-5">
          {seasons.map(season => (
            <li key={season}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{season}</div>
              <ol className="relative space-y-2 border-l-2 border-border pl-5">
                {entries.filter(e => (e.kind === 'game' ? e.m.season : e.t.season) === season).map((e, i) => {
                  if (e.kind === 'trade') {
                    const t = e.t
                    return (
                      <li key={`t${t.id}`} className="relative rounded-lg border border-dashed bg-muted/40 p-3">
                        <span className="absolute -left-[31px] top-3 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-muted-foreground text-background">
                          <ArrowLeftRight className="h-3 w-3" />
                        </span>
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold">
                            Trade · {formatDate(t.date)}{t.others?.length ? ` (with ${t.others.map(teamCode).join(', ')})` : ''}
                          </span>
                          <button type="button" onClick={() => openTrade(t.id)}
                                  className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline">
                            Trade <ArrowRight className="h-3 w-3" />
                          </button>
                        </div>
                        <Items items={t.got} team={a} />
                        <Items items={t.gave} team={b} />
                      </li>
                    )
                  }
                  const m = e.m
                  const winner = m.win === 1 ? a : m.win === 0 ? b : null
                  const stage = stageLabel(m)
                  const tags = [same(high, m) && 'Highest score', same(big, m) && 'Biggest win', same(close, m) && 'Closest'].filter(Boolean) as string[]
                  return (
                    <li key={`g${i}-${m.period}-${m.stage}`} className={cn('relative flex items-center gap-2 rounded-lg px-2 py-1.5 sm:gap-3',
                      stage && 'bg-amber-500/10 ring-1 ring-amber-500/40')}>
                      <span className="absolute -left-[27px] top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-background"
                            style={{ background: winner ? teamLineColor(winner, isDark) : 'gray' }} />
                      <span className="w-9 shrink-0 text-xs text-muted-foreground tabular-nums sm:w-14">
                        P{m.period}
                        {stage && <span className="block font-semibold text-amber-700 dark:text-amber-300">{stage}</span>}
                      </span>
                      {winner ? <TeamLogo teamName={winner} size={24} className="shrink-0" /> : <span className="w-6 shrink-0" />}
                      <div className="min-w-0 flex-1">
                        {/* The first team's score always on the left (team codes from sm up) */}
                        <div className="whitespace-nowrap text-sm tabular-nums sm:text-base">
                          <span className={cn(m.win === 1 && 'font-bold')}><span className="hidden sm:inline">{teamCode(a)} </span>{formatScore(m.score)}</span>
                          <span className="text-muted-foreground"> – </span>
                          <span className={cn(m.win === 0 && 'font-bold')}>{formatScore(m.opp_score)}<span className="hidden sm:inline"> {teamCode(b)}</span></span>
                        </div>
                        {tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {tags.map(t => <span key={t} className="rounded-full bg-muted px-1.5 text-[10px] font-semibold uppercase tracking-wide">{t}</span>)}
                          </div>
                        )}
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums sm:text-sm">
                        {winner ? `+${formatScore(Math.abs(m.score - m.opp_score))}` : 'Tie'}
                      </span>
                    </li>
                  )
                })}
              </ol>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------------------------------- Records

function RecordRow({ label, team, value, detail }: { label: string; team: string | null; value: string; detail: string }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      {team ? <TeamLogo teamName={team} size={28} className="shrink-0" /> : <span className="w-7 shrink-0" />}
      <div className="min-w-0 flex-1">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="truncate text-sm">{detail}</div>
      </div>
      <span className="shrink-0 text-lg font-bold tabular-nums">{value}</span>
    </li>
  )
}

function Records({ a, b, r }: { a: string; b: string; r: Rivalry }) {
  const { highest_score: high, biggest_win: big, closest_game: close, highest_combined: combined } = r.records
  if (!high) return null
  const score = (m: Meeting) => `${teamCode(a)} ${formatScore(m.score)}–${formatScore(m.opp_score)} ${teamCode(b)}, ${at(m)}`
  const streak = (s: Streak | null) => s && `${at(s.from)} to ${at(s.to)}`
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="flex items-center gap-2 text-lg"><Medal className="h-5 w-5 text-muted-foreground" />Rivalry records</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          <RecordRow label="Highest score" team={who(high.side, a, b)} value={formatScore(Math.max(high.score, high.opp_score))} detail={score(high)} />
          {big && big.side && <RecordRow label="Biggest win" team={who(big.side, a, b)} value={`+${formatScore(big.margin)}`} detail={score(big)} />}
          {close && <RecordRow label="Closest game" team={who(close.side, a, b)} value={close.margin ? `+${formatScore(close.margin)}` : 'Tie'} detail={score(close)} />}
          {combined && <RecordRow label="Most points, both teams" team={null} value={formatScore(combined.combined)} detail={score(combined)} />}
          {r.longest_streak && <RecordRow label={`Longest streak, ${teamCode(a)}`} team={a} value={`${r.longest_streak.length}`} detail={streak(r.longest_streak) ?? ''} />}
          {r.opponent_longest_streak && <RecordRow label={`Longest streak, ${teamCode(b)}`} team={b} value={`${r.opponent_longest_streak.length}`} detail={streak(r.opponent_longest_streak) ?? ''} />}
        </ul>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------------------------------- Players

function Scorers({ team, list }: { team: string; list: Rivalry['players']['team'] }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <TeamLogo teamName={team} size={20} className="shrink-0" />{teamCode(team)}
      </div>
      {list.length ? (
        <ol className="space-y-1">
          {list.map((p, i) => (
            <li key={p.player_id} className="flex items-baseline gap-2 text-sm">
              <span className="w-4 shrink-0 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1"><PlayerName id={p.player_id} name={p.player} /></span>
              <span className="shrink-0 font-semibold tabular-nums">{formatPoints(p.points)}</span>
            </li>
          ))}
        </ol>
      ) : <p className="text-sm text-muted-foreground">No player data.</p>}
    </div>
  )
}

function Players({ a, b, r }: { a: string; b: string; r: Rivalry }) {
  const { best_game: best, both } = r.players
  if (!r.players.team.length && !r.players.opponent.length && !both.length) return null
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg"><Shirt className="h-5 w-5 text-muted-foreground" />Players</CardTitle>
        <CardDescription>Lineup points in their games, every season.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Scorers team={a} list={r.players.team} />
          <Scorers team={b} list={r.players.opponent} />
        </div>
        {best && (
          <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
            <Zap className="h-5 w-5 shrink-0 text-amber-500" />
            <div className="min-w-0 flex-1 text-sm">
              <div className="text-muted-foreground">Best game by a player</div>
              <div className="flex flex-wrap items-baseline gap-x-1">
                <PlayerName id={best.player_id} name={best.player} className="inline font-semibold" />
                <span className="text-muted-foreground">for {teamCode(who(best.side, a, b) ?? '')}, {at(best)}</span>
              </div>
            </div>
            <span className="shrink-0 text-xl font-bold tabular-nums">{formatScore(best.points)}</span>
          </div>
        )}
        {both.length > 0 && (
          <div>
            <div className="mb-1 text-sm font-semibold">Played for both</div>
            <ul className="space-y-1">
              {both.map(p => (
                <li key={p.player_id} className="flex items-baseline gap-2 text-sm">
                  <span className="min-w-0 flex-1"><PlayerName id={p.player_id} name={p.player} /></span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {teamCode(a)} {formatPoints(p.team_points)} · {teamCode(b)} {formatPoints(p.opponent_points)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------------------------------- Trades

function Trades({ a, b, r }: { a: string; b: string; r: Rivalry }) {
  const { isDark } = useChartTheme()
  if (!r.trades.length) return null
  const got = r.trades.reduce((s, t) => s + t.got_points, 0)
  const gave = r.trades.reduce((s, t) => s + t.gave_points, 0)
  const sum = got + gave || 1
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg"><Handshake className="h-5 w-5 text-muted-foreground" />Trades</CardTitle>
        <CardDescription>
          {r.trades.length} trade{r.trades.length > 1 ? 's' : ''} (on the timeline). The points the players each team got went on to
          score for it, picks once drafted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex justify-between text-sm font-semibold tabular-nums">
          <span>{teamCode(a)} {formatPoints(got)}</span>
          <span>{formatPoints(gave)} {teamCode(b)}</span>
        </div>
        <div className="flex h-3 overflow-hidden rounded-full bg-muted">
          <span style={{ width: `${(got / sum) * 100}%`, background: teamLineColor(a, isDark) }} />
          <span style={{ width: `${(gave / sum) * 100}%`, background: teamLineColor(b, isDark) }} />
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------------------------------- Page

export function RivalryPageWidget({ selectedTeam }: { selectedTeam: string }) {
  const { data: alltime, isLoading: loadingTeams, error: teamsError } = useAllTime()
  const { data: league } = useLeagueData()
  const teams = useMemo(() => [...(alltime?.head_to_head.teams ?? [])].sort(), [alltime])
  const { pair, setPair } = useSelectedRivalry()
  const fallback = useDefaultPair(selectedTeam, teams)
  const [a, b] = pair && teams.includes(pair[0]) && teams.includes(pair[1]) ? pair : fallback ?? ['', '']
  const { data, isLoading, error } = useRivalries(a || null)

  if (loadingTeams || isLoading) return <WidgetSkeleton variant="list" />
  if (teamsError || error || !alltime || !data || !a || !b) return <ErrorState />
  const r = data.opponents[b]
  if (!r) return <ErrorState />
  const inSeason = league?.matchups.teams.includes(a) && league?.matchups.teams.includes(b)

  return (
    <div className="w-full space-y-4">
      <Hero a={a} b={b} r={r} teams={teams} onPick={setPair} />
      <Storylines a={a} b={b} r={r} />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <Timeline a={a} b={b} r={r} />
        <div className="space-y-4">
          <Records a={a} b={b} r={r} />
          <Players a={a} b={b} r={r} />
          <Trades a={a} b={b} r={r} />
        </div>
      </div>
      {inSeason && (
        <div className="space-y-3 pt-2">
          <h3 className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <ArrowRight className="h-5 w-5 text-muted-foreground" />This season{league ? ` (${league.meta.season})` : ''}
          </h3>
          <SeasonRivalry a={a} b={b} />
        </div>
      )}
    </div>
  )
}

/** A button that opens the rivalry page on two teams */
export function RivalryLink({ a, b, children, className }: { a: string; b: string; children: ReactNode; className?: string }) {
  const openRivalry = useSelectedRivalry(state => state.openRivalry)
  return (
    <Button variant="outline" size="sm" className={cn('h-9 gap-1.5', className)} onClick={() => openRivalry(a, b)}>
      {children}
    </Button>
  )
}

/** My Team's card: the next opponent as a rivalry (the record over every season, the last meeting, two
 * storylines) and the way into the rivalry page. Nothing when no opponent is set yet. */
export function NextRivalCard({ team, opponent, when }: { team: string; opponent: string; when: string }) {
  const { data } = useRivalries(team)
  const openRivalry = useSelectedRivalry(state => state.openRivalry)
  const r = data?.opponents[opponent]
  if (!r) return null
  const last = r.meetings[r.meetings.length - 1]
  const lead = r.wins > r.losses ? 'You lead' : r.wins < r.losses ? 'You trail' : 'Even'
  const shown = stories(team, opponent, r).filter(s => s.title !== 'Never met').slice(0, 2)
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-2">
        <div className="min-w-0 space-y-1.5">
          <CardTitle className="text-lg">Next: {opponent}</CardTitle>
          <CardDescription>{when}</CardDescription>
        </div>
        <Button variant="outline" size="sm" className="h-9 shrink-0 gap-1.5" onClick={() => openRivalry(team, opponent)}>
          Rivalry <ArrowRight className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <TeamLogo teamName={opponent} size={40} className="shrink-0" />
          <div className="min-w-0">
            <div className="text-2xl font-bold tabular-nums">
              {r.games + r.playoff_games ? formatRecord(r.wins + r.playoff_wins, r.losses + r.playoff_losses) : 'First meeting'}
            </div>
            <div className="text-sm text-muted-foreground">
              {r.games + r.playoff_games ? <>{lead} all-time{r.playoff_games ? ` (${formatRecord(r.playoff_wins, r.playoff_losses)} in the playoffs)` : ''}</> : 'They have never played each other'}
              {last && <>. Last met {at(last)}: {last.win === 1 ? 'won' : last.win === 0 ? 'lost' : 'tied'} {formatScore(last.score)}–{formatScore(last.opp_score)}</>}
            </div>
          </div>
        </div>
        {shown.length > 0 && (
          <ul className="space-y-2 border-t pt-3">
            {shown.map(s => (
              <li key={s.title} className="flex gap-2 text-sm">
                <s.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 text-muted-foreground"><span className="font-medium text-foreground">{s.title}.</span> {s.text}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
