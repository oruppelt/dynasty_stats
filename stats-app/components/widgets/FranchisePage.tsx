import { ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Crown, Flame, Maximize2, Medal, Quote, Shirt, Sparkles, Swords, Trophy, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { WidgetSkeleton } from './WidgetSkeleton'
import { ErrorState } from './ErrorState'
import { TeamLogo } from './TeamLogo'
import { PlayerName } from './PlayerName'
import { Select } from './PlayersWidgets'
import { useTeamColor } from './PlayerTimeline'
import { FINISH_LABEL, useAllTime } from '@/lib/alltime'
import { FranchisePrestige, Honor, Prestige, signed, usePrestige } from '@/lib/prestige'
import { useSelectedFranchise } from '@/lib/selected-franchise'
import { textOn } from '@/lib/chart-theme'
import { formatPoints } from '@/lib/standings'
import { teamCode } from '@/lib/teams'
import { cn } from '@/lib/utils'

// History → Franchise: one franchise's page, shareable as ?franchise=<team> (lib/selected-franchise.ts).
// Prestige by season is the main show; then the banners (titles and finals), retired jerseys, highlights,
// legends and rivals. Every panel opens full screen. From data/prestige.json (pipeline/prestige.py) and
// data/alltime.json.

const ordinal = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 >= 11 && n % 100 <= 13 ? 0 : n % 10] ?? 'th'}`
const SHORT = (season: string) => season.slice(2) // 2024-25 → 24-25

/** A panel that opens full screen (Esc or the close button to leave) */
function Panel({ title, icon: Icon, note, children, full, className }: {
  title: string; icon: typeof Trophy; note?: ReactNode; children: ReactNode; full?: ReactNode; className?: string
}) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow }
  }, [open])
  return (
    <Card className={cn('flex min-w-0 flex-col', className)}>
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0 pb-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base"><Icon className="h-4 w-4 text-muted-foreground" />{title}</CardTitle>
          {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
        </div>
        <button type="button" onClick={() => setOpen(true)} aria-label={`Open ${title} full screen`} title="Full screen"
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
          <Maximize2 className="h-4 w-4" />
        </button>
      </CardHeader>
      <CardContent className="flex-1">{children}</CardContent>
      {open && createPortal(
        <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 overflow-y-auto bg-background">
          <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3">
              <h2 className="flex items-center gap-2 text-lg font-semibold"><Icon className="h-5 w-5 text-muted-foreground" />{title}</h2>
              <button type="button" onClick={() => setOpen(false)} autoFocus aria-label="Close"
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="mx-auto max-w-5xl px-4 py-6">{full ?? children}</div>
        </div>,
        document.body,
      )}
    </Card>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">{children}</p>
}

/** An honor in a few words */
function honorText(e: Honor) {
  switch (e.kind) {
    case 'title': return `Champion${e.opponent ? `, beat ${teamCode(e.opponent)}` : ''}${e.series ? ` ${e.series}` : ''}`
    case 'final': return `Runner-up${e.opponent ? ` to ${teamCode(e.opponent)}` : ''}${e.series ? ` ${e.series}` : ''}`
    case 'first_seed': return 'Regular-season winner'
    case 'season_high': return `Season-high ${formatPoints(e.score ?? 0)}`
    case 'bottom_three': return `${e.rank === e.of ? 'Last' : `${ordinal(e.rank ?? 0)} of ${e.of}`}`
    case 'player_5000': return `${e.player}: 5,000 points`
    case 'player_16000': return `${e.player}: 16,000 points`
  }
}

function HonorChip({ e }: { e: Honor }) {
  const tone = e.points < 0 ? 'border-destructive/40 text-destructive'
    : e.kind === 'title' ? 'border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-300'
    : 'text-foreground'
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs', tone)} title={e.label}>
      <span className="font-semibold tabular-nums">{signed(e.points)}</span>
      <span className="truncate">{honorText(e)}</span>
    </span>
  )
}

// ---------------------------------------------------------------------------------------------------- Prestige

function SeasonRows({ f, max }: { f: FranchisePrestige; max: number }) {
  return (
    <ul className="divide-y">
      {[...f.seasons].reverse().map(s => (
        <li key={s.season} className="grid grid-cols-[4rem_1fr_3rem] items-start gap-x-3 gap-y-1 py-2 sm:grid-cols-[4.5rem_10rem_1fr_10rem_3rem]">
          <span className="col-start-1 row-start-1 whitespace-nowrap font-medium tabular-nums">{s.season}</span>
          <span className="col-start-2 row-start-1 text-xs text-muted-foreground sm:pt-0.5">
            {s.wins !== undefined && `${s.wins}-${s.losses}, ${ordinal(s.rank ?? 0)}`}
            {s.finish ? ` · ${FINISH_LABEL[s.finish]}` : s.wins !== undefined ? ' · in progress' : ''}
          </span>
          <span className="col-span-3 col-start-1 row-start-2 flex flex-wrap gap-1 empty:hidden sm:col-span-1 sm:col-start-3 sm:row-start-1">
            {s.events.map((e, i) => <HonorChip key={i} e={e} />)}
          </span>
          {/* A bar either side of zero */}
          <span className="hidden h-2.5 self-center sm:col-start-4 sm:row-start-1 sm:flex" aria-hidden>
            <span className="flex w-1/4 justify-end">
              {s.points < 0 && <span className="h-full rounded-l bg-destructive/70" style={{ width: `${(-s.points / max) * 300}%`, maxWidth: '100%' }} />}
            </span>
            <span className="w-px bg-border" />
            <span className="flex w-3/4">
              {s.points > 0 && <span className="h-full rounded-r bg-primary" style={{ width: `${(s.points / max) * 100}%` }} />}
            </span>
          </span>
          <span className={cn('col-start-3 row-start-1 text-right font-semibold tabular-nums sm:col-start-5', s.points < 0 && 'text-destructive', !s.points && 'text-muted-foreground')}>
            {signed(s.points)}
          </span>
        </li>
      ))}
    </ul>
  )
}

function Leaderboard({ data, team }: { data: Prestige; team: string }) {
  const { setFranchise } = useSelectedFranchise()
  const rows = Object.entries(data.franchises).sort((a, b) => a[1].rank - b[1].rank || a[0].localeCompare(b[0]))
  const top = Math.max(...rows.map(([, f]) => f.prestige), 1)
  return (
    <ol className="space-y-1">
      {rows.map(([t, f]) => (
        <li key={t}>
          <button type="button" onClick={() => setFranchise(t)}
                  className={cn('flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-muted', t === team && 'bg-muted font-semibold')}>
            <span className="w-6 text-right tabular-nums text-muted-foreground">{f.rank}</span>
            <TeamLogo teamName={t} size={18} className="shrink-0" />
            <span className="w-36 truncate sm:w-48">{t}</span>
            <span className="hidden h-2 flex-1 sm:block"><span className="block h-full rounded bg-primary/70" style={{ width: `${Math.max(0, f.prestige) / top * 100}%` }} /></span>
            <span className="ml-auto w-10 text-right tabular-nums">{f.prestige}</span>
          </button>
        </li>
      ))}
    </ol>
  )
}

function Rules({ data }: { data: Prestige }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div>
        <h3 className="mb-2 text-sm font-semibold">How prestige is earned</h3>
        <ul className="space-y-1 text-sm">
          {data.honors.map(h => (
            <li key={h.kind} className="flex justify-between gap-3">
              <span>{h.label}</span><span className={cn('tabular-nums font-medium', h.points < 0 && 'text-destructive')}>{signed(h.points)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          A finished season earns its honors; a player milestone counts in the season it happens (regular-season
          lineup points for the franchise, every season added up). Nothing earned is taken away. Every season since
          2019-20 counts.
        </p>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">What it buys</h3>
        <ul className="space-y-1 text-sm">
          {data.rewards.map(r => (
            <li key={r.kind} className="flex justify-between gap-3"><span>{r.label}</span><span className="tabular-nums font-medium">{r.cost}</span></li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          Ask the commissioner. A jersey can be retired for a player with {formatPoints(data.jersey_points)} points
          for the franchise.
        </p>
      </div>
    </div>
  )
}

function PrestigePanel({ data, team, f }: { data: Prestige; team: string; f: FranchisePrestige }) {
  const max = Math.max(...Object.values(data.franchises).flatMap(x => x.seasons.map(s => Math.abs(s.points))), 1)
  return (
    <Panel title="Prestige by season" icon={Crown} className="md:col-span-2"
           note="Earned from rare honors: titles, finals, the regular season's best record, the season's highest score and franchise milestones by its players. A bottom-three finish costs some."
           full={
             <div className="space-y-8">
               <SeasonRows f={f} max={max} />
               <Rules data={data} />
               <div>
                 <h3 className="mb-2 text-sm font-semibold">Every franchise</h3>
                 <Leaderboard data={data} team={team} />
               </div>
             </div>
           }>
      <SeasonRows f={f} max={max} />
    </Panel>
  )
}

// ---------------------------------------------------------------------------------------------------- Banners

function Banner({ e, team, big }: { e: Honor; team: string; big?: boolean }) {
  const color = useTeamColor()(team)
  const title = e.kind === 'title'
  const fg = title ? textOn(color) : undefined
  return (
    <div
      className={cn('flex shrink-0 flex-col items-center justify-start gap-1 px-2 pb-6 pt-3 text-center shadow-sm',
        big ? 'w-32' : 'w-24', !title && 'border bg-muted text-foreground')}
      style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 86%, 0 100%)', ...(title ? { background: color, color: fg } : {}) }}
      title={honorText(e)}
    >
      {title ? <Trophy className={big ? 'h-7 w-7' : 'h-5 w-5'} /> : <Medal className={big ? 'h-6 w-6' : 'h-4 w-4'} />}
      <span className={cn('font-black uppercase leading-tight tracking-wider', big ? 'text-sm' : 'text-[10px]')}>
        {title ? 'Champions' : 'Finalists'}
      </span>
      <span className={cn('font-bold tabular-nums', big ? 'text-base' : 'text-xs')}>{e.season}</span>
      {e.opponent && <span className={cn('opacity-80', big ? 'text-xs' : 'text-[10px]')}>
        {title ? 'over' : 'to'} {teamCode(e.opponent)}{e.series ? ` ${e.series}` : ''}
      </span>}
    </div>
  )
}

function BannersPanel({ team, f }: { team: string; f: FranchisePrestige }) {
  const titles = f.cups.filter(c => c.kind === 'title')
  const finals = f.cups.filter(c => c.kind === 'final')
  const row = (big?: boolean) => (
    <div className="flex flex-wrap items-start gap-3">
      {[...titles, ...finals].map(c => <Banner key={c.kind + c.season} e={c} team={team} big={big} />)}
    </div>
  )
  return (
    <Panel title="Banners" icon={Trophy} className="md:col-span-2"
           note={titles.length ? `${titles.length} title${titles.length > 1 ? 's' : ''}${finals.length ? `, ${finals.length} more final${finals.length > 1 ? 's' : ''}` : ''}.`
             : finals.length ? `No title yet; ${finals.length} final${finals.length > 1 ? 's' : ''}.` : undefined}
           full={f.cups.length ? row(true) : undefined}>
      {f.cups.length ? row() : <Empty>No banners yet. A title (or a final) hangs one here.</Empty>}
    </Panel>
  )
}

// ---------------------------------------------------------------------------------------------------- Jerseys

function Jersey({ name, sub, team, big }: { name: string; sub: string; team: string; big?: boolean }) {
  const color = useTeamColor()(team)
  const fg = textOn(color)
  const surname = name.split(' ').slice(1).join(' ') || name
  return (
    <figure className={cn('flex shrink-0 flex-col items-center', big ? 'w-36' : 'w-24')}>
      <svg viewBox="0 0 100 110" className="w-full drop-shadow-sm" role="img" aria-label={`${name}, retired`}>
        <path d="M30 4 L40 4 Q50 20 60 4 L70 4 L73 24 Q78 32 88 30 L88 106 L12 106 L12 30 Q22 32 27 24 Z"
              fill={color} stroke="currentColor" strokeOpacity="0.15" />
        <text x="50" y="52" textAnchor="middle" fill={fg} fontSize={surname.length > 9 ? 9 : 12} fontWeight="800"
              style={{ textTransform: 'uppercase', letterSpacing: 1 }}>{surname}</text>
        <Crown x="38" y="64" width="24" height="24" color={fg} />
      </svg>
      <figcaption className="mt-1 text-center text-xs text-muted-foreground">{sub}</figcaption>
    </figure>
  )
}

function JerseysPanel({ data, team, f }: { data: Prestige; team: string; f: FranchisePrestige }) {
  const eligible = f.legends.filter(l => l.eligible && !l.retired)
  const cost = data.rewards.find(r => r.kind === 'jersey')?.cost ?? 0
  const body = (big?: boolean) => (
    <div className="space-y-4">
      {f.jerseys.length ? (
        <div className="flex flex-wrap gap-4">
          {f.jerseys.map(j => (
            <Jersey key={j.player_id} name={j.player ?? ''} team={team} big={big}
                    sub={`${j.first?.slice(0, 4)}–${j.last?.slice(5)} · ${formatPoints(j.points ?? 0)} pts · retired ${j.season}`} />
          ))}
        </div>
      ) : <Empty>No jerseys retired yet. Retiring one costs {cost} prestige.</Empty>}
      {eligible.length > 0 && (
        <div className="text-sm">
          <div className="mb-1 text-xs font-medium text-muted-foreground">
            Eligible ({formatPoints(data.jersey_points)}+ points for the franchise):
          </div>
          <ul className="flex flex-wrap gap-x-3 gap-y-1">
            {(big ? eligible : eligible.slice(0, 6)).map(l => (
              <li key={l.player_id}>
                <PlayerName id={l.player_id} name={l.player} className="inline" />{' '}
                <span className="text-xs tabular-nums text-muted-foreground">{formatPoints(l.points)}</span>
              </li>
            ))}
            {!big && eligible.length > 6 && <li className="text-xs text-muted-foreground">+{eligible.length - 6} more</li>}
          </ul>
        </div>
      )}
    </div>
  )
  return <Panel title="Retired jerseys" icon={Shirt} full={body(true)}>{body()}</Panel>
}

// ---------------------------------------------------------------------------------------------------- Highlights

function Tile({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  )
}

function HighlightsPanel({ f }: { f: FranchisePrestige }) {
  const h = f.highlights
  const tiles = (
    <div className="grid gap-2 sm:grid-cols-2">
      {h.best_season && <Tile label="Best season" value={`${h.best_season.season}, ${h.best_season.wins}-${h.best_season.losses}`}
                              sub={`${ordinal(h.best_season.rank)} in the regular season · ${FINISH_LABEL[h.best_season.finish]}`} />}
      {h.highest_score && <Tile label="Highest score" value={formatPoints(h.highest_score.score)}
                                sub={`${h.highest_score.season}, period ${h.highest_score.period}, vs ${teamCode(h.highest_score.opponent)} (${formatPoints(h.highest_score.opp_score)})`} />}
      {h.biggest_win && <Tile label="Biggest win" value={`by ${formatPoints(h.biggest_win.margin)}`}
                              sub={`${formatPoints(h.biggest_win.score)}-${formatPoints(h.biggest_win.opp_score)} vs ${teamCode(h.biggest_win.opponent)}, ${h.biggest_win.season}`} />}
      {h.longest_streak && <Tile label="Longest win streak" value={`${h.longest_streak.length} games`}
                                 sub={`${h.longest_streak.season}, periods ${h.longest_streak.start}–${h.longest_streak.end}`} />}
      {h.best_player_season && <Tile label="Best player season"
                                     value={<PlayerName id={h.best_player_season.player_id} name={h.best_player_season.player} className="inline" />}
                                     sub={`${formatPoints(h.best_player_season.points)} pts in ${h.best_player_season.starts} starts, ${h.best_player_season.season}`} />}
    </div>
  )
  const moments = f.moments.length ? (
    <ul className="mb-3 space-y-2">
      {f.moments.map((m, i) => (
        <li key={i} className="rounded-md border-l-4 border-primary bg-muted/40 px-3 py-2">
          <div className="font-medium">{m.title}</div>
          {m.text && <p className="text-sm text-muted-foreground">{m.text}</p>}
        </li>
      ))}
    </ul>
  ) : null
  return (
    <Panel title="Highlights" icon={Sparkles} note={moments ? undefined : 'Worked out from the games. A featured moment, picked by the franchise, goes on top.'}
           full={<>{moments}{tiles}</>}>
      {moments}{tiles}
    </Panel>
  )
}

// ---------------------------------------------------------------------------------------------------- Legends

function LegendRows({ f, n }: { f: FranchisePrestige; n?: number }) {
  return (
    <ol className="divide-y text-sm">
      {f.legends.slice(0, n).map((l, i) => (
        <li key={l.player_id} className="flex items-baseline gap-2 py-1.5">
          <span className="w-5 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</span>
          <span className="min-w-0 flex-1 truncate">
            <PlayerName id={l.player_id} name={l.player} className="inline font-medium" />
            {l.retired && <Shirt className="ml-1 inline h-3.5 w-3.5 text-primary" aria-label="Jersey retired" />}
            <span className="ml-1.5 text-xs text-muted-foreground">{l.first === l.last ? l.first : `${SHORT(l.first)} to ${SHORT(l.last)}`}</span>
          </span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{l.starts} starts</span>
          <span className="w-14 shrink-0 text-right tabular-nums">{formatPoints(l.points)}</span>
        </li>
      ))}
    </ol>
  )
}

function LegendsPanel({ f }: { f: FranchisePrestige }) {
  return (
    <Panel title="Legends" icon={Flame} note="Regular-season lineup points for the franchise."
           full={<LegendRows f={f} />}>
      {f.legends.length ? <LegendRows f={f} n={6} /> : <Empty>No player data.</Empty>}
    </Panel>
  )
}

// ---------------------------------------------------------------------------------------------------- Rivals

function RivalsPanel({ f }: { f: FranchisePrestige }) {
  const { setFranchise } = useSelectedFranchise()
  const rows: [string, string | undefined, string?][] = [
    ['Declared rival', f.declared_rival ?? undefined],
    ['Played most', f.rivals.most_played?.team, f.rivals.most_played && `${f.rivals.most_played.wins}-${f.rivals.most_played.losses}`],
    ['Nemesis', f.rivals.nemesis?.team, f.rivals.nemesis && `${f.rivals.nemesis.wins}-${f.rivals.nemesis.losses}`],
    ['Favorite opponent', f.rivals.favorite?.team, f.rivals.favorite && `${f.rivals.favorite.wins}-${f.rivals.favorite.losses}`],
  ]
  const body = (
    <ul className="divide-y text-sm">
      {rows.map(([label, team, record]) => (
        <li key={label} className="flex items-center gap-2 py-2">
          <span className="w-32 shrink-0 text-xs text-muted-foreground">{label}</span>
          {team ? (
            <button type="button" onClick={() => setFranchise(team)} className="flex min-w-0 items-center gap-1.5 hover:underline">
              <TeamLogo teamName={team} size={18} className="shrink-0" /><span className="truncate">{team}</span>
            </button>
          ) : <span className="text-muted-foreground">{label === 'Declared rival' ? 'None yet' : '—'}</span>}
          {record && <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">{record}</span>}
        </li>
      ))}
    </ul>
  )
  return <Panel title="Rivals" icon={Swords} note="Every game, playoffs included. Nemesis and favorite: 6 games or more.">{body}</Panel>
}

// ---------------------------------------------------------------------------------------------------- The page

export function FranchisePageWidget({ selectedTeam }: { selectedTeam: string }) {
  const { data, isLoading, error } = usePrestige()
  const { data: alltime } = useAllTime()
  const { franchise, setFranchise } = useSelectedFranchise()
  const color = useTeamColor()

  if (isLoading) return <WidgetSkeleton variant="list" />
  if (error || !data) return <ErrorState />
  const teams = Object.keys(data.franchises).sort()
  const team = franchise && data.franchises[franchise] ? franchise : data.franchises[selectedTeam] ? selectedTeam : teams[0]
  const f = data.franchises[team]
  const career = alltime?.franchises.find(x => x.team === team)
  const accent = color(team)

  return (
    <div className="w-full space-y-4">
      <Card className="overflow-hidden">
        <div className="h-2" style={{ background: accent }} />
        <CardContent className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-center">
          <TeamLogo teamName={team} size={112} className="shrink-0 self-center" />
          <div className="min-w-0 flex-1 space-y-2 text-center sm:text-left">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{team}</h2>
            <p className="flex items-center justify-center gap-1.5 text-sm sm:justify-start">
              <Quote className="h-4 w-4 shrink-0 text-muted-foreground" />
              {f.motto ? <span className="italic">{f.motto}</span>
                : <span className="text-muted-foreground">No motto yet ({data.rewards.find(r => r.kind === 'motto')?.cost} prestige).</span>}
            </p>
            {career && (
              <p className="text-sm text-muted-foreground">
                {career.seasons} seasons · {career.wins}-{career.losses} · {career.playoffs} playoffs · {career.finals} final{career.finals === 1 ? '' : 's'} · {career.titles} title{career.titles === 1 ? '' : 's'}
              </p>
            )}
            <div className="flex justify-center sm:justify-start">
              <Select label="Franchise" value={team} onChange={setFranchise} options={teams.map(t => [t, t])} />
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-center gap-6 rounded-lg border px-5 py-3 sm:flex-col sm:gap-1 sm:text-center">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Prestige</div>
              <div className="text-4xl font-black tabular-nums" style={{ color: accent }}>{f.prestige}</div>
            </div>
            <div className="text-sm text-muted-foreground">
              <div><span className="font-semibold text-foreground">#{f.rank}</span> of {teams.length}</div>
              <div>{f.balance} to spend</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <PrestigePanel data={data} team={team} f={f} />
        <BannersPanel team={team} f={f} />
        <JerseysPanel data={data} team={team} f={f} />
        <HighlightsPanel f={f} />
        <LegendsPanel f={f} />
        <RivalsPanel f={f} />
      </div>
    </div>
  )
}
