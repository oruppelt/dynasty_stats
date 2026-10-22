interface BidirectionalBarProps {
  value: number;
  minValue: number;
  maxValue: number;
  height?: number;
  className?: string;
}

export function BidirectionalBar({ 
  value, 
  minValue, 
  maxValue, 
  height = 20,
  className = "" 
}: BidirectionalBarProps) {
  
  // Calculate the range and normalize the value
  const range = maxValue - minValue;
  const normalizedValue = (value - minValue) / range; // 0 to 1
  const percentage = Math.abs(value) / Math.max(Math.abs(minValue), Math.abs(maxValue)) * 100;
  
  // Determine color based on value (negative = harder = red, positive = easier = green)
  const getColor = (val: number) => {
    if (val < -0.5) return 'bg-very-unlucky';
    if (val < 0) return 'bg-unlucky';
    if (val === 0) return 'bg-neutral';
    if (val < 0.5) return 'bg-lucky';
    return 'bg-very-lucky';
  };

  const getLuckCategory = (val: number) => {
    if (val <= -1.0) return { label: 'Very Unlucky', emoji: '😰' };
    if (val <= -0.5) return { label: 'Unlucky', emoji: '😔' };
    if (val < 0.5 && val > -0.5) return { label: 'Average', emoji: '😐' };
    if (val <= 1.0) return { label: 'Lucky', emoji: '😊' };
    return { label: 'Very Lucky', emoji: '🍀' };
  };

  const category = getLuckCategory(value);
  const color = getColor(value);

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Bar container */}
      <div className="flex-grow relative">
        <div 
          className="rounded-full bg-muted relative overflow-hidden"
          style={{ height }}
        >
          {/* Center line */}
          <div 
            className="absolute top-0 w-0.5 bg-muted-foreground z-10"
            style={{ 
              height: '100%',
              left: '50%',
              transform: 'translateX(-50%)'
            }}
          />
          
          {/* Value bar */}
          <div 
            className={`absolute top-0 h-full ${color} transition-all duration-300 rounded-full`}
            style={{
              width: `${percentage}%`,
              [value >= 0 ? 'left' : 'right']: '50%'
            }}
          />
        </div>
      </div>

      {/* Category indicator */}
      <div className="flex items-center gap-1 min-w-0">
        <span className="text-lg">{category.emoji}</span>
        <span className="text-sm font-medium text-foreground truncate">
          {category.label}
        </span>
      </div>
    </div>
  );
}