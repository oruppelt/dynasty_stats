import { Card, CardContent } from '@/components/ui/card'
import { TeamLogo } from './TeamLogo'
import type { PeriodResult } from '@/lib/league-data'
import { Game, Recap, formatScore } from '@/lib/season'
import { formatCount } from '@/lib/standings'
import { cn } from '@/lib/utils'

// The pieces the Recap view and its PDF (RecapReport) share. `eager` loads the logos right away,
// which the PDF needs: it is drawn off screen, where lazy images never load.

const others = (r: PeriodResult) => r.all_play_wins + r.all_play_losses
const score = (r: PeriodResult) => `${formatScore(r.score)}–${formatScore(r.opp_score)}`

function HighlightTile({ label, team, value, detail, eager }: {
  label: string;
  team: string;
  value: string;
  detail: string;
  eager?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="mt-2 flex items-center gap-2">
          <TeamLogo teamName={team} size={28} className="shrink-0" eager={eager} />
          <span className="min-w-0 truncate font-semibold">{team}</span>
        </div>
        <div className="mt-2 text-3xl font-bold tabular-nums">{value}</div>
        <div className="mt-1 text-sm text-muted-foreground">{detail}</div>
      </CardContent>
    </Card>
  )
}

/** The period's six highlights; `className` sets the grid's columns. */
export function RecapHighlights({ recap, className, eager }: { recap: Recap; className: string; eager?: boolean }) {
  return (
    <div className={cn('grid gap-4', className)}>
      <HighlightTile
        eager={eager}
        label="Top score"
        team={recap.top.team}
        value={formatScore(recap.top.score)}
        detail={`${recap.top.win === 1 ? 'Beat' : 'Lost to'} ${recap.top.opponent}`}
      />
      <HighlightTile
        eager={eager}
        label="Lowest score"
        team={recap.lowest.team}
        value={formatScore(recap.lowest.score)}
        detail={`${recap.lowest.win === 1 ? 'Beat' : 'Lost to'} ${recap.lowest.opponent}`}
      />
      {recap.unluckiestLoss && (
        <HighlightTile
          eager={eager}
          label="Unluckiest loss"
          team={recap.unluckiestLoss.team}
          value={score(recap.unluckiestLoss)}
          detail={`Lost to ${recap.unluckiestLoss.opponent} with a score that beat ${formatCount(recap.unluckiestLoss.all_play_wins)} of the other ${others(recap.unluckiestLoss)} teams`}
        />
      )}
      {recap.luckiestWin && (
        <HighlightTile
          eager={eager}
          label="Luckiest win"
          team={recap.luckiestWin.team}
          value={score(recap.luckiestWin)}
          detail={`Beat ${recap.luckiestWin.opponent} with a score that beat only ${formatCount(recap.luckiestWin.all_play_wins)} of the other ${others(recap.luckiestWin)} teams`}
        />
      )}
      <HighlightTile
        eager={eager}
        label="Biggest blowout"
        team={recap.blowout.winner.team}
        value={`+${formatScore(recap.blowout.margin)}`}
        detail={`Beat ${recap.blowout.loser.team} ${score(recap.blowout.winner)}`}
      />
      <HighlightTile
        eager={eager}
        label="Closest game"
        team={recap.closest.winner.team}
        value={recap.closest.margin === 0 ? 'Tie' : `+${formatScore(recap.closest.margin)}`}
        detail={`${recap.closest.margin === 0 ? 'Tied' : 'Beat'} ${recap.closest.loser.team} ${score(recap.closest.winner)}`}
      />
    </div>
  )
}

function GameSide({ r, won, eager }: { r: PeriodResult; won: boolean; eager?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2', !won && 'text-muted-foreground')}>
      <TeamLogo teamName={r.team} size={24} className="shrink-0" eager={eager} />
      <span className={cn('min-w-0 flex-1 truncate', won && 'font-semibold')}>{r.team}</span>
      <span className={cn('tabular-nums', won && 'font-semibold')}>{formatScore(r.score)}</span>
      <span className="w-14 shrink-0 text-right text-xs text-muted-foreground tabular-nums">beat {formatCount(r.all_play_wins)}</span>
    </div>
  )
}

/** Every game, winner on top; `className` sets the grid's columns. */
export function GameList({ games, className, isMine = () => false, eager }: {
  games: Game[];
  className: string;
  isMine?: (g: Game) => boolean;
  eager?: boolean;
}) {
  return (
    <ul className={cn('grid gap-x-8', className)}>
      {games.map(g => (
        <li
          key={g.winner.team}
          className={cn('space-y-1.5 border-b px-2 py-2 text-sm', isMine(g) && 'rounded-md border-transparent bg-muted')}
        >
          <GameSide r={g.winner} won={g.margin > 0} eager={eager} />
          <GameSide r={g.loser} won={false} eager={eager} />
        </li>
      ))}
    </ul>
  )
}
