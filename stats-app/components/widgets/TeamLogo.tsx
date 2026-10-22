import Image from 'next/image'
import { useState } from 'react'
import { getTeamColor } from '@/lib/nba-team-colors'

interface TeamLogoProps {
  teamName: string;
  size?: number;
  className?: string;
}

export function TeamLogo({ teamName, size = 32, className = "" }: TeamLogoProps) {
  const [imageError, setImageError] = useState(false);

  if (imageError) {
    // Fallback to team initials with colored background
    const initials = teamName
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .substring(0, 3)
      .toUpperCase();

    // Use official NBA team colors or generate consistent color as fallback
    const { primary: backgroundColor } = getTeamColor(teamName);

    return (
      <div
        className={`flex items-center justify-center rounded-full text-white font-bold ${className}`}
        style={{
          width: size,
          height: size,
          backgroundColor,
          fontSize: size * 0.4
        }}
        title={teamName}
      >
        {initials}
      </div>
    );
  }

  // Logos sit on a white disc: several have dark ink (Nets, Spurs) that would
  // vanish on the dark theme's background
  return (
    <div
      className={`flex items-center justify-center rounded-full bg-white ring-1 ring-border ${className}`}
      style={{ width: size, height: size, padding: Math.round(size * 0.1) }}
    >
      <Image
        src={`/logos/${teamName}.png`}
        alt={teamName}
        width={size}
        height={size}
        className="h-full w-full object-contain"
        onError={() => setImageError(true)}
      />
    </div>
  );
}
