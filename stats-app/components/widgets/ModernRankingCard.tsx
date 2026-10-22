import { TeamLogo } from './TeamLogo'

interface ModernRankingCardProps {
  rank: number;
  teamName: string;
  value: number;
  label: string;
  isSelected?: boolean;
  onClick?: () => void;
  children?: React.ReactNode; // For custom content like progress bars
}

export function ModernRankingCard({ 
  rank, 
  teamName, 
  value, 
  label, 
  isSelected = false, 
  onClick,
  children 
}: ModernRankingCardProps) {
  
  const getRankingBadge = (rank: number) => {
    if (rank === 1) return { emoji: '🥇', bgColor: 'gradient-gold', textColor: 'text-white', borderColor: 'border-yellow-400' };
    if (rank === 2) return { emoji: '🥈', bgColor: 'gradient-silver', textColor: 'text-white', borderColor: 'border-gray-400' };
    if (rank === 3) return { emoji: '🥉', bgColor: 'gradient-bronze', textColor: 'text-white', borderColor: 'border-orange-400' };
    return { emoji: '', bgColor: 'bg-muted', textColor: 'text-muted-foreground', borderColor: 'border-border' };
  };

  const badge = getRankingBadge(rank);

  return (
    <div
      className={`
        relative p-4 rounded-lg border-2 transition-all duration-200 cursor-pointer
        ${isSelected
          ? 'bg-primary/5 border-primary shadow-lg'
          : 'bg-card border-border hover:border-primary/50 hover:shadow-md'
        }
      `}
      onClick={onClick}
    >
      {/* Ranking Badge */}
      <div className={`
        absolute -top-2 -left-2 w-8 h-8 rounded-full border-2 
        flex items-center justify-center text-sm font-bold
        ${badge.bgColor} ${badge.textColor} ${badge.borderColor}
      `}>
        {badge.emoji || `#${rank}`}
      </div>

      <div className="flex items-center gap-4">
        {/* Team Logo */}
        <TeamLogo 
          teamName={teamName} 
          size={48}
          className="flex-shrink-0"
        />

        {/* Team Info */}
        <div className="flex-grow min-w-0">
          <h3 className={`font-semibold text-lg truncate ${
            isSelected ? 'text-primary' : 'text-foreground'
          }`}>
            {teamName}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-sm font-medium ${
              isSelected ? 'text-primary/80' : 'text-muted-foreground'
            }`}>
              {label}:
            </span>
            <span className={`text-lg font-bold ${
              isSelected ? 'text-primary' : 'text-foreground'
            }`}>
              {typeof value === 'number' ? value.toFixed(3) : value}
            </span>
          </div>

          {/* Custom content area (progress bars, etc.) */}
          {children && (
            <div className="mt-3">
              {children}
            </div>
          )}
        </div>

        {/* Rank Display */}
        <div className={`text-right flex-shrink-0 ${
          isSelected ? 'text-primary' : 'text-muted-foreground'
        }`}>
          <div className="text-2xl font-bold">
            #{rank}
          </div>
        </div>
      </div>
    </div>
  );
}