import { ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Crown, Flame, Maximize2, Plus, Quote, Shirt, Sparkles, Swords, Trophy, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { WidgetSkeleton } from './WidgetSkeleton'
import { ErrorState } from './ErrorState'
import { TeamLogo } from './TeamLogo'
import { PlayerName } from './PlayerName'
import { Select } from './PlayersWidgets'
import { formatDate } from './PlayerTimeline'
import { FINISH_LABEL, Finish, useAllTime } from '@/lib/alltime'
import { FranchiseHonor, Achievement, Honor, HighlightIdea, Reward, RewardKind, signed, useHonor } from '@/lib/honor'
import { useSelectedFranchise } from '@/lib/selected-franchise'
import { textOn } from '@/lib/chart-theme'
import { getTeamColor } from '@/lib/nba-team-colors'
import { formatPoints } from '@/lib/standings'
import { teamCode } from '@/lib/teams'
import { cn } from '@/lib/utils'

// History → Franchise: one franchise's page, shareable as ?franchise=<team> (lib/selected-franchise.ts).
// The header carries what comes free (the title banners, small) and the motto. Three tabs:
// - Trophy room: what the franchise spends its honor on (retired jerseys in the rafters, declared highlights
//   and rivals), each with an empty slot showing its price, and ideas worked out from the games;
// - Honor: earned season by season, the rules, what was spent, every franchise;
// - Legends: the top scorers for the franchise.
// From data/honor.json (pipeline/honor.py) and data/alltime.json.

const ordinal = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 >= 11 && n % 100 <= 13 ? 0 : n % 10] ?? 'th'}`
const SHORT = (season: string) => season.slice(2) // 2024-25 → 24-25
const record = (o: { wins: number; losses: number }) => `${Math.round(o.wins)}-${Math.round(o.losses)}`

/** The team's two colors and the text on the first */
function teamColors(team: string) {
  const { primary, secondary } = getTeamColor(team)
  const second = /^#[0-9a-f]{6}$/i.test(secondary) && secondary.toLowerCase() !== primary.toLowerCase() ? secondary : primary
  return { primary, secondary: second, fg: textOn(primary) }
}

/** Opens its content full screen (Esc or the close button to leave) */
function useFullScreen(title: string, Icon: typeof Trophy, content: ReactNode) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow }
  }, [open])
  const button = (
    <button type="button" onClick={() => setOpen(true)} aria-label={`Open ${title} full screen`} title="Full screen"
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
      <Maximize2 className="h-4 w-4" />
    </button>
  )
  const overlay = open && createPortal(
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
      <div className="mx-auto max-w-5xl px-4 py-6">{content}</div>
    </div>,
    document.body,
  )
  return { button, overlay }
}

/** A card that opens full screen */
function Panel({ title, icon: Icon, note, children, full, className }: {
  title: string; icon: typeof Trophy; note?: ReactNode; children: ReactNode; full?: ReactNode; className?: string
}) {
  const { button, overlay } = useFullScreen(title, Icon, full ?? children)
  return (
    <Card className={cn('flex min-w-0 flex-col', className)}>
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0 pb-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base"><Icon className="h-4 w-4 text-muted-foreground" />{title}</CardTitle>
          {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
        </div>
        {button}
      </CardHeader>
      <CardContent className="flex-1">{children}</CardContent>
      {overlay}
    </Card>
  )
}

/** The price of a reward, and whether the franchise can pay it now */
function Price({ cost, balance, className }: { cost: number; balance: number; className?: string }) {
  const can = balance >= cost
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
      can ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-muted text-muted-foreground', className)}
          title={can ? 'Enough honor to buy it now' : `${cost - balance} more honor needed`}>
      <Crown className="h-3 w-3" />{cost}
    </span>
  )
}

/** Where a reward goes once bought: a dashed slot with its price */
function Slot({ icon: Icon, title, cost, balance, children, className }: {
  icon: typeof Trophy; title: string; cost: number; balance: number; children?: ReactNode; className?: string
}) {
  const can = balance >= cost
  return (
    <div className={cn('flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed p-4 text-center',
      can ? 'border-amber-500/50' : 'border-border', className)}>
      <span className={cn('flex h-9 w-9 items-center justify-center rounded-full', can ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300' : 'bg-muted text-muted-foreground')}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="text-sm font-semibold">{title}</div>
      <Price cost={cost} balance={balance} />
      <p className="text-xs leading-snug text-muted-foreground">
        {can ? 'Enough honor to buy it now. Ask the commissioner.' : `${cost - balance} more honor needed.`}
      </p>
      {children}
    </div>
  )
}

function SectionTitle({ icon: Icon, title, note, right }: { icon: typeof Trophy; title: string; note?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-lg font-bold tracking-tight"><Icon className="h-5 w-5 text-muted-foreground" />{title}</h3>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </div>
      {right}
    </div>
  )
}

/** An achievement in a few words */
function achievementText(e: Achievement) {
  switch (e.kind) {
    case 'title': return `Champion${e.opponent ? `, beat ${teamCode(e.opponent)}` : ''}${e.series ? ` ${e.series}` : ''}`
    case 'final': return `Runner-up${e.opponent ? ` to ${teamCode(e.opponent)}` : ''}${e.series ? ` ${e.series}` : ''}`
    case 'first_seed': return 'Regular-season winner'
    case 'season_high': return `Season-high ${formatPoints(e.score ?? 0)}`
    case 'bottom_three': return `${e.rank === e.of ? 'Last' : `${ordinal(e.rank ?? 0)} of ${e.of}`}`
    case 'player_6000': return `${e.player}: 6,000 points`
    case 'player_16000': return `${e.player}: 16,000 points`
  }
}

function AchievementChip({ e }: { e: Achievement }) {
  const tone = e.points < 0 ? 'border-destructive/40 text-destructive'
    : e.kind === 'title' ? 'border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-300'
    : 'text-foreground'
  return (
    <span className={cn('inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs', tone)}
          title={`${e.label}${e.date ? `, ${formatDate(e.date)}` : ''}${e.period ? ` (period ${e.period})` : ''}`}>
      <span className="font-semibold tabular-nums">{signed(e.points)}</span>
      <span className="truncate">{achievementText(e)}</span>
      {e.date && <span className="shrink-0 opacity-70">· {formatDate(e.date)}</span>}
    </span>
  )
}

/** A reward's picture (stats-app/public/honor/, from the reward's row) */
function Picture({ src, alt, className }: { src: string; alt: string; className?: string }) {
  // A plain img: the export serves the file as it is (no image optimization)
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" className={cn('block bg-muted', className)} />
}

// ---------------------------------------------------------------------------------------------------- Header

/** A small title pennant: free, so it stays small */
function Pennant({ e, color, fg }: { e: Achievement; color: string; fg: string }) {
  return (
    <div className="flex w-11 shrink-0 flex-col items-center gap-0.5 pb-3 pt-1.5 text-center shadow-md ring-1 ring-black/10"
         style={{ background: color, color: fg, clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 80%, 0 100%)' }}
         title={`${e.season} champions: ${achievementText(e)}${e.date ? `, ${formatDate(e.date)}` : ''}`}>
      <Trophy className="h-3.5 w-3.5" />
      <span className="text-[9px] font-black leading-none tabular-nums">{SHORT(e.season)}</span>
    </div>
  )
}

function Hero({ data, team, f, teams, onPick }: {
  data: Honor; team: string; f: FranchiseHonor; teams: string[]; onPick: (t: string) => void
}) {
  const { data: alltime } = useAllTime()
  const career = alltime?.franchises.find(x => x.team === team)
  const { primary, secondary, fg } = teamColors(team)
  const motto = data.rewards.find(r => r.kind === 'motto')?.cost ?? 0
  return (
    <div className="relative overflow-hidden rounded-xl border shadow-sm"
         style={{ background: `linear-gradient(120deg, ${primary} 0%, ${primary} 55%, ${secondary} 140%)`, color: fg }}>
      {/* The title banners hang from the top edge */}
      {f.banners.length > 0 && (
        <div className="absolute right-3 top-0 flex gap-1.5 sm:right-56" aria-label={`${f.banners.length} title${f.banners.length > 1 ? 's' : ''}`}>
          {f.banners.map(b => <Pennant key={b.season} e={b} color={secondary} fg={textOn(secondary)} />)}
        </div>
      )}
      <div className="flex flex-col gap-5 p-5 pt-12 sm:flex-row sm:items-center sm:p-6">
        <div className="flex shrink-0 items-center justify-center self-center rounded-full bg-white/90 p-3 shadow-lg ring-4 ring-white/20">
          <TeamLogo teamName={team} size={96} />
        </div>
        <div className="min-w-0 flex-1 space-y-2 text-center sm:text-left">
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">{team}</h2>
          {career && (
            <p className="text-sm opacity-80">
              {career.seasons} seasons · {career.wins}-{career.losses} · {career.playoffs} playoffs · {career.titles} title{career.titles === 1 ? '' : 's'}
            </p>
          )}
          {f.motto ? (
            <blockquote className="relative pt-1 font-serif text-xl italic leading-snug sm:text-2xl">
              <Quote className="mb-1 inline h-5 w-5 -translate-y-1 opacity-60" /> {f.motto}
            </blockquote>
          ) : (
            <div className="inline-flex items-center gap-2 rounded-full border-2 border-dashed border-current/40 px-3 py-1 text-sm opacity-80"
                 style={{ borderColor: `${fg}66` }}>
              <Quote className="h-4 w-4" /> No motto yet · a motto costs {motto} honor
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center justify-center gap-6 rounded-xl bg-black/20 px-5 py-3 backdrop-blur-sm sm:flex-col sm:gap-1 sm:text-center">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest opacity-80">Honor</div>
            <div className="text-5xl font-black tabular-nums leading-none">{f.honor}</div>
          </div>
          <div className="text-sm">
            <div><span className="font-bold">#{f.rank}</span> <span className="opacity-80">of {teams.length}</span></div>
            <div><span className="font-bold tabular-nums">{f.balance}</span> <span className="opacity-80">to spend</span></div>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 bg-black/25 px-5 py-2 text-xs">
        <span className="opacity-90">
          {f.banners.length ? `${f.banners.length} title banner${f.banners.length > 1 ? 's' : ''}` : 'No title banner yet'}
          {f.spent ? ` · ${f.spent} honor spent` : ''}
        </span>
        <span className="[&_span]:text-white [&_select]:h-8 [&_select]:border-white/30 [&_select]:bg-black/30 [&_select]:text-white">
          <Select label="Franchise" value={team} onChange={onPick} options={teams.map(t => [t, t])} />
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------- Shop

const REWARD_ICON: Record<RewardKind, typeof Trophy> = { jersey: Shirt, rival: Swords, highlight: Sparkles, motto: Quote }

/** What honor buys, what the franchise has of each and whether it can buy one now */
function Shop({ data, f }: { data: Honor; f: FranchiseHonor }) {
  const owned: Record<RewardKind, number> = {
    jersey: f.jerseys.length, rival: f.rivals.length, highlight: f.highlights.length, motto: f.motto ? 1 : 0,
  }
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {data.rewards.map(r => {
        const Icon = REWARD_ICON[r.kind]
        const can = f.balance >= r.cost
        return (
          <div key={r.kind} className={cn('flex items-center gap-2 rounded-xl border p-2.5 sm:gap-3 sm:p-3', can && 'border-amber-500/50 bg-amber-500/5')}>
            <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10', can ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300' : 'bg-muted text-muted-foreground')}>
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-tight">{r.label}</div>
              <div className="flex items-center gap-1.5">
                <Price cost={r.cost} balance={f.balance} />
                <span className="text-xs text-muted-foreground">{owned[r.kind] ? `${owned[r.kind]} owned` : ''}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------- Jerseys

function Jersey({ name, sub, team, big, image, caption }: {
  name: string; sub: string; team: string; big?: boolean; image?: string; caption?: string
}) {
  const { primary, secondary, fg } = teamColors(team)
  const surname = name.split(' ').slice(1).join(' ') || name
  return (
    <figure className={cn('flex shrink-0 flex-col items-center', big ? 'w-48' : 'w-32')}>
      {/* The string it hangs from */}
      <span className="h-4 w-px bg-white/40" aria-hidden />
      {image ? (
        <div className="w-full overflow-hidden rounded-md shadow-xl ring-1 ring-white/20">
          <Picture src={image} alt={`${name}, retired`} className="aspect-[3/4] w-full object-cover" />
          <div className="px-2 py-1 text-center text-xs font-black uppercase tracking-wider" style={{ background: primary, color: fg }}>{surname}</div>
        </div>
      ) : (
        <svg viewBox="0 0 100 110" className="w-full drop-shadow-[0_8px_16px_rgba(0,0,0,0.5)]" role="img" aria-label={`${name}, retired`}>
          <path d="M30 4 L40 4 Q50 20 60 4 L70 4 L73 24 Q78 32 88 30 L88 106 L12 106 L12 30 Q22 32 27 24 Z" fill={primary} stroke={secondary} strokeWidth="2.5" />
          <path d="M40 4 Q50 20 60 4" fill="none" stroke={secondary} strokeWidth="3" />
          <text x="50" y="50" textAnchor="middle" fill={fg} fontSize={surname.length > 9 ? 9 : 12} fontWeight="900"
                style={{ textTransform: 'uppercase', letterSpacing: 1 }}>{surname}</text>
          <Crown x="37" y="62" width="26" height="26" color={fg} />
        </svg>
      )}
      <figcaption className="mt-2 text-center text-xs text-white/75">
        {caption && <span className="block italic text-white">{caption}</span>}{sub}
      </figcaption>
    </figure>
  )
}

/** An empty jersey outline: the next one to retire, and its price */
function EmptyJersey({ cost, balance, big }: { cost: number; balance: number; big?: boolean }) {
  const can = balance >= cost
  return (
    <figure className={cn('flex shrink-0 flex-col items-center', big ? 'w-48' : 'w-32')}>
      <span className="h-4 w-px bg-white/20" aria-hidden />
      <svg viewBox="0 0 100 110" className="w-full" role="img" aria-label={`Retire a jersey: ${cost} honor`}>
        <path d="M30 4 L40 4 Q50 20 60 4 L70 4 L73 24 Q78 32 88 30 L88 106 L12 106 L12 30 Q22 32 27 24 Z"
              fill="none" stroke={can ? '#f59e0b' : 'rgba(255,255,255,0.35)'} strokeWidth="2" strokeDasharray="5 4" />
        <Plus x="38" y="40" width="24" height="24" color={can ? '#f59e0b' : 'rgba(255,255,255,0.5)'} />
        <text x="50" y="84" textAnchor="middle" fill={can ? '#fbbf24' : 'rgba(255,255,255,0.6)'} fontSize="11" fontWeight="800">{cost} honor</text>
      </svg>
      <figcaption className="mt-2 text-center text-xs text-white/60">{can ? 'Ready to retire one' : `${cost - balance} more needed`}</figcaption>
    </figure>
  )
}

function Rafters({ data, team, f }: { data: Honor; team: string; f: FranchiseHonor }) {
  const eligible = f.legends.filter(l => l.eligible && !l.retired)
  const cost = data.rewards.find(r => r.kind === 'jersey')?.cost ?? 0
  const wall = (big?: boolean) => (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-b from-slate-950 via-slate-900 to-slate-800 px-4 pb-5 shadow-inner">
      {/* The beam */}
      <div className="mx-[-1rem] h-2 bg-gradient-to-b from-slate-600 to-slate-800" aria-hidden />
      <div className="flex flex-wrap justify-center gap-x-6 gap-y-4 sm:justify-start">
        {f.jerseys.map(j => (
          <Jersey key={j.player_id} name={j.player ?? ''} team={team} big={big} image={j.image} caption={j.caption}
                  sub={`${j.first?.slice(0, 4)}–${j.last?.slice(5)} · ${formatPoints(j.points ?? 0)} pts · retired ${j.season}`} />
        ))}
        <EmptyJersey cost={cost} balance={f.balance} big={big} />
        {!f.jerseys.length && (
          <p className="hidden max-w-xs self-center text-sm text-white/50 sm:block">
            No jersey hangs here yet. The first one retired goes up in the franchise&apos;s colors, or with a picture of the player.
          </p>
        )}
      </div>
    </div>
  )
  const candidates = (big?: boolean) => eligible.length > 0 && (
    <div className="mt-3">
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">
        Can be retired ({formatPoints(data.jersey_points)}+ points for the franchise, playoffs included):
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {(big ? eligible : eligible.slice(0, 8)).map(l => (
          <li key={l.player_id} className="rounded-full border bg-muted/40 px-2.5 py-0.5 text-sm">
            <PlayerName id={l.player_id} name={l.player} className="inline" />{' '}
            <span className="text-xs tabular-nums text-muted-foreground">{formatPoints(l.points)}</span>
          </li>
        ))}
        {!big && eligible.length > 8 && <li className="px-1 py-0.5 text-xs text-muted-foreground">+{eligible.length - 8} more</li>}
      </ul>
    </div>
  )
  const { button, overlay } = useFullScreen('Retired jerseys', Shirt, <>{wall(true)}{candidates(true)}</>)
  return (
    <section>
      <SectionTitle icon={Shirt} title="Retired jerseys"
                    note={f.jerseys.length ? `${f.jerseys.length} in the rafters.` : 'The rafters are empty. Retiring a jersey is the biggest honor a franchise can give.'}
                    right={button} />
      {wall()}
      {candidates()}
      {overlay}
    </section>
  )
}

// ---------------------------------------------------------------------------------------------------- Highlights

/** A worked-out highlight in words: label, the big line, the small one */
function ideaText(kind: HighlightIdea, d: Record<string, string | number>): { label: string; value: ReactNode; sub: string } {
  switch (kind) {
    case 'best_season': return {
      label: 'Best season', value: `${d.season}, ${d.wins}-${d.losses}`,
      sub: `${ordinal(Number(d.rank))} in the regular season · ${FINISH_LABEL[d.finish as Finish]}`,
    }
    case 'highest_score': return {
      label: 'Highest score', value: formatPoints(Number(d.score)),
      sub: `${d.season}, period ${d.period}, vs ${teamCode(String(d.opponent))} (${formatPoints(Number(d.opp_score))})`,
    }
    case 'biggest_win': return {
      label: 'Biggest win', value: `by ${formatPoints(Number(d.margin))}`,
      sub: `${formatPoints(Number(d.score))}-${formatPoints(Number(d.opp_score))} vs ${teamCode(String(d.opponent))}, ${d.season}`,
    }
    case 'longest_streak': return {
      label: 'Longest win streak', value: `${d.length} games`, sub: `${d.season}, periods ${d.start}–${d.end}`,
    }
    case 'best_player_season': return {
      label: 'Best player season', value: <PlayerName id={String(d.player_id)} name={String(d.player)} className="inline" />,
      sub: `${formatPoints(Number(d.points))} pts in ${d.starts} starts, ${d.season}`,
    }
  }
}

function HighlightCard({ h, team, big }: { h: Reward; team: string; big?: boolean }) {
  const { primary, fg } = teamColors(team)
  const idea = h.of && h.detail ? ideaText(h.of, h.detail) : null
  return (
    <article className="overflow-hidden rounded-xl border bg-card shadow-sm">
      {h.image && <Picture src={h.image} alt={h.title ?? idea?.label ?? ''}
                           className={big ? 'max-h-[75vh] w-full object-contain' : 'aspect-video w-full object-cover'} />}
      <div className="flex">
        <div className="w-1.5 shrink-0" style={{ background: primary }} />
        <div className="min-w-0 flex-1 p-4">
          <div className="flex items-center gap-2">
            <span className="rounded px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider" style={{ background: primary, color: fg }}>
              {idea?.label ?? 'Highlight'}
            </span>
            <span className="text-xs text-muted-foreground">declared {h.season}</span>
          </div>
          <div className="mt-2 text-xl font-bold leading-tight">{h.title ?? idea?.value}</div>
          {idea && <div className="mt-0.5 text-sm text-muted-foreground">{h.title ? <>{idea.value} · </> : null}{idea.sub}</div>}
          {h.text && <p className="mt-2 text-sm">{h.text}</p>}
          {h.caption && <p className="mt-1 text-xs italic text-muted-foreground">{h.caption}</p>}
        </div>
      </div>
    </article>
  )
}

function Highlights({ data, team, f }: { data: Honor; team: string; f: FranchiseHonor }) {
  const cost = data.rewards.find(r => r.kind === 'highlight')?.cost ?? 0
  const declared = new Set(f.highlights.map(h => h.of))
  const ideas = (Object.entries(f.highlight_ideas) as [HighlightIdea, Record<string, string | number>][]).filter(([k]) => !declared.has(k))
  const body = (big?: boolean) => (
    <div className="space-y-3">
      {f.highlights.map((h, i) => <HighlightCard key={i} h={h} team={team} big={big} />)}
      <Slot icon={Sparkles} title={f.highlights.length ? 'Declare another highlight' : 'Declare a highlight'} cost={cost} balance={f.balance}>
        <p className="max-w-sm text-xs leading-snug text-muted-foreground">A season, a game, a player, a trade: the moment the franchise wants remembered, with a picture if it likes.</p>
      </Slot>
      {ideas.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">Ideas, from the games</div>
          <ul className="divide-y rounded-lg border text-sm text-muted-foreground">
            {ideas.map(([k, d]) => {
              const t = ideaText(k, d)
              return (
                <li key={k} className="flex flex-wrap items-baseline gap-x-2 px-3 py-1.5">
                  <span className="w-32 shrink-0 text-xs">{t.label}</span>
                  <span className="font-medium text-foreground/80">{t.value}</span>
                  <span className="text-xs">{t.sub}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
  const { button, overlay } = useFullScreen('Highlights', Sparkles, body(true))
  return (
    <section className="min-w-0">
      <SectionTitle icon={Sparkles} title="Highlights" right={button}
                    note={f.highlights.length ? 'Declared by the franchise.' : 'None declared yet.'} />
      {body()}
      {overlay}
    </section>
  )
}

// ---------------------------------------------------------------------------------------------------- Rivals

function RivalCard({ r, team }: { r: Reward; team: string }) {
  const { setFranchise } = useSelectedFranchise()
  const me = teamColors(team)
  const them = teamColors(r.opponent ?? '')
  const rec = r.record
  return (
    <article className="overflow-hidden rounded-xl border shadow-sm">
      <div className="relative grid grid-cols-[1fr_auto_1fr] items-center"
           style={{ background: `linear-gradient(100deg, ${me.primary} 0%, ${me.primary} 46%, ${them.primary} 54%, ${them.primary} 100%)` }}>
        <div className="flex flex-col items-center gap-1 p-4" style={{ color: me.fg }}>
          <span className="rounded-full bg-white/90 p-1.5"><TeamLogo teamName={team} size={52} /></span>
          <span className="text-xs font-bold">{teamCode(team)}</span>
        </div>
        <span className="z-10 rounded-full bg-black px-2.5 py-1.5 text-sm font-black italic text-white shadow-lg ring-2 ring-white/70">VS</span>
        <button type="button" onClick={() => r.opponent && setFranchise(r.opponent)} className="flex flex-col items-center gap-1 p-4 hover:opacity-90"
                style={{ color: them.fg }} title={`Open ${r.opponent}`}>
          <span className="rounded-full bg-white/90 p-1.5"><TeamLogo teamName={r.opponent ?? ''} size={52} /></span>
          <span className="text-xs font-bold">{teamCode(r.opponent ?? '')}</span>
        </button>
      </div>
      <div className="flex items-center justify-between gap-2 bg-card px-4 py-2.5">
        <div>
          <div className="text-2xl font-black tabular-nums leading-none">{rec ? record(rec) : '0-0'}</div>
          <div className="text-xs text-muted-foreground">
            all-time{rec?.playoff_games ? `, ${rec.playoff_games} in the playoffs` : ''}
          </div>
        </div>
        <span className="text-xs text-muted-foreground">declared {r.season}</span>
      </div>
    </article>
  )
}

function Rivals({ data, team, f }: { data: Honor; team: string; f: FranchiseHonor }) {
  const { setFranchise } = useSelectedFranchise()
  const cost = data.rewards.find(r => r.kind === 'rival')?.cost ?? 0
  const declared = new Set(f.rivals.map(r => r.opponent))
  const ideas = ([
    ['Played most', f.rival_ideas.most_played],
    ['Nemesis', f.rival_ideas.nemesis],
    ['Favorite opponent', f.rival_ideas.favorite],
  ] as const).filter(([, o]) => o && !declared.has(o.team))
  const body = (
    <div className="space-y-3">
      {f.rivals.map(r => <RivalCard key={r.opponent} r={r} team={team} />)}
      <Slot icon={Swords} title={f.rivals.length ? 'Declare another rival' : 'Declare a rival'} cost={cost} balance={f.balance}>
        <p className="max-w-sm text-xs leading-snug text-muted-foreground">Name the team you most want to beat. Its record against you goes up here.</p>
      </Slot>
      {ideas.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">Ideas, from every game (playoffs included)</div>
          <ul className="divide-y rounded-lg border text-sm text-muted-foreground">
            {ideas.map(([label, o]) => o && (
              <li key={label} className="flex items-center gap-2 px-3 py-1.5">
                <span className="w-32 shrink-0 text-xs">{label}</span>
                <button type="button" onClick={() => setFranchise(o.team)} className="flex min-w-0 items-center gap-1.5 text-foreground/80 hover:underline">
                  <TeamLogo teamName={o.team} size={16} className="shrink-0" /><span className="truncate">{o.team}</span>
                </button>
                <span className="ml-auto shrink-0 text-xs tabular-nums">{record(o)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
  const { button, overlay } = useFullScreen('Rivals', Swords, body)
  return (
    <section className="min-w-0">
      <SectionTitle icon={Swords} title="Rivals" right={button}
                    note={f.rivals.length ? 'Declared by the franchise.' : 'None declared yet.'} />
      {body}
      {overlay}
    </section>
  )
}

function TrophyRoom({ data, team, f }: { data: Honor; team: string; f: FranchiseHonor }) {
  return (
    <div className="space-y-8">
      <section>
        <SectionTitle icon={Crown} title="What honor buys"
                      note={<>{team} has <span className="font-semibold text-foreground">{f.balance}</span> honor to spend. Ask the commissioner to buy something; it shows up here.</>} />
        <Shop data={data} f={f} />
      </section>
      <Rafters data={data} team={team} f={f} />
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <Highlights data={data} team={team} f={f} />
        <Rivals data={data} team={team} f={f} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------- Honor

function SeasonRows({ f, max }: { f: FranchiseHonor; max: number }) {
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
            {s.events.map((e, i) => <AchievementChip key={i} e={e} />)}
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

function Leaderboard({ data, team }: { data: Honor; team: string }) {
  const { setFranchise } = useSelectedFranchise()
  const rows = Object.entries(data.franchises).sort((a, b) => a[1].rank - b[1].rank || a[0].localeCompare(b[0]))
  const top = Math.max(...rows.map(([, f]) => f.honor), 1)
  return (
    <ol className="space-y-1">
      {rows.map(([t, f]) => (
        <li key={t}>
          <button type="button" onClick={() => setFranchise(t)}
                  className={cn('flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-muted', t === team && 'bg-muted font-semibold')}>
            <span className="w-6 text-right tabular-nums text-muted-foreground">{f.rank}</span>
            <TeamLogo teamName={t} size={18} className="shrink-0" />
            <span className="w-36 truncate sm:w-48">{t}</span>
            <span className="hidden h-2 flex-1 sm:block"><span className="block h-full rounded bg-primary/70" style={{ width: `${Math.max(0, f.honor) / top * 100}%` }} /></span>
            <span className="ml-auto w-10 text-right tabular-nums">{f.honor}</span>
          </button>
        </li>
      ))}
    </ol>
  )
}

function Rules({ data }: { data: Honor }) {
  return (
    <div className="grid gap-6">
      <div>
        <h3 className="mb-2 text-sm font-semibold">How honor is earned</h3>
        <ul className="space-y-1 text-sm">
          {data.achievements.map(h => (
            <li key={h.kind} className="flex justify-between gap-3">
              <span>{h.label}</span><span className={cn('tabular-nums font-medium', h.points < 0 && 'text-destructive')}>{signed(h.points)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          A finished season earns its achievements; a player milestone counts on the day it happens (lineup points
          for the franchise, playoffs included, every season added up). Each achievement has its date, so it can be
          put next to whoever ran the team then. Nothing earned is taken away. Every season since 2019-20 counts.
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
          for the franchise. Title banners are free.
        </p>
      </div>
    </div>
  )
}

function Ledger({ f }: { f: FranchiseHonor }) {
  if (!f.rewards.length) return <p className="text-sm text-muted-foreground">Nothing spent yet.</p>
  const what = (r: Reward) => r.kind === 'jersey' ? r.player : r.kind === 'rival' ? r.opponent
    : r.kind === 'motto' ? `“${r.text}”` : r.title ?? (r.of && r.detail ? ideaText(r.of, r.detail).label : '')
  return (
    <ul className="divide-y text-sm">
      {f.rewards.map((r, i) => (
        <li key={i} className="flex items-baseline gap-3 py-1.5">
          <span className="w-16 shrink-0 tabular-nums text-muted-foreground">{r.season}</span>
          <span className="min-w-0 flex-1 truncate">{r.label}: <span className="font-medium">{what(r)}</span></span>
          <span className="shrink-0 tabular-nums text-destructive">−{r.cost}</span>
        </li>
      ))}
    </ul>
  )
}

function HonorTab({ data, team, f }: { data: Honor; team: string; f: FranchiseHonor }) {
  const max = Math.max(...Object.values(data.franchises).flatMap(x => x.seasons.map(s => Math.abs(s.points))), 1)
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Panel title="Honor by season" icon={Crown} className="md:col-span-2"
             note="Earned from rare achievements: titles, finals, the regular season's best record, the season's highest score and franchise milestones by its players. A bottom-three finish costs some."
             full={<div className="space-y-8"><SeasonRows f={f} max={max} /><Rules data={data} /></div>}>
        <SeasonRows f={f} max={max} />
      </Panel>
      <div className="flex min-w-0 flex-col gap-4">
        <Card className="min-w-0"><CardContent className="pt-6"><Rules data={data} /></CardContent></Card>
        <Panel title="Spent" icon={Sparkles} note={`${f.spent} of ${f.honor} honor spent, ${f.balance} left.`}>
          <Ledger f={f} />
        </Panel>
      </div>
      <Panel title="Every franchise" icon={Trophy}>
        <Leaderboard data={data} team={team} />
      </Panel>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------- Legends

function LegendRows({ f, n }: { f: FranchiseHonor; n?: number }) {
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
          <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:inline">{l.starts} starts</span>
          <span className={cn('w-14 shrink-0 text-right tabular-nums', l.eligible && 'font-semibold')}>{formatPoints(l.points)}</span>
        </li>
      ))}
    </ol>
  )
}

function LegendsTab({ data, f }: { data: Honor; f: FranchiseHonor }) {
  return (
    <Panel title="Legends" icon={Flame}
           note={`Lineup points for the franchise, playoffs included. In bold: ${formatPoints(data.jersey_points)}+, a jersey that can be retired.`}>
      {f.legends.length ? <LegendRows f={f} /> : <p className="text-sm text-muted-foreground">No player data.</p>}
    </Panel>
  )
}

// ---------------------------------------------------------------------------------------------------- The page

const TABS = [
  { value: 'trophies', label: 'Trophy room', icon: Trophy },
  { value: 'honor', label: 'Honor', icon: Crown },
  { value: 'legends', label: 'Legends', icon: Flame },
] as const
type Tab = typeof TABS[number]['value']

export function FranchisePageWidget({ selectedTeam }: { selectedTeam: string }) {
  const { data, isLoading, error } = useHonor()
  const { franchise, setFranchise } = useSelectedFranchise()
  const [tab, setTab] = useState<Tab>('trophies')

  if (isLoading) return <WidgetSkeleton variant="list" />
  if (error || !data) return <ErrorState />
  const teams = Object.keys(data.franchises).sort()
  const team = franchise && data.franchises[franchise] ? franchise : data.franchises[selectedTeam] ? selectedTeam : teams[0]
  const f = data.franchises[team]

  return (
    <div className="w-full space-y-5">
      <Hero data={data} team={team} f={f} teams={teams} onPick={setFranchise} />
      <div role="tablist" className="flex w-full gap-1 border-b">
        {TABS.map(({ value, label, icon: Icon }) => (
          <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}
                  className={cn('-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold transition-colors',
                    tab === value ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>
      {tab === 'trophies' && <TrophyRoom data={data} team={team} f={f} />}
      {tab === 'honor' && <HonorTab data={data} team={team} f={f} />}
      {tab === 'legends' && <LegendsTab data={data} f={f} />}
    </div>
  )
}
