import { useSelectedPlayer } from '@/lib/selected-player'
import { cn } from '@/lib/utils'

/** A player's name that opens their player page (Players → Player). Truncates in a narrow column. */
export function PlayerName({ id, name, className }: { id: string; name: string; className?: string }) {
  const openPlayer = useSelectedPlayer(state => state.openPlayer)
  return (
    <button
      type="button"
      onClick={() => openPlayer(id)}
      title={`${name}: career`}
      className={cn(
        'block max-w-full truncate text-left underline-offset-2 hover:underline focus-visible:underline focus:outline-hidden',
        className,
      )}
    >
      {name}
    </button>
  )
}
