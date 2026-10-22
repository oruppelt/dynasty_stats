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
  const [isLoading, setIsLoading] = useState(true);

  const handleImageError = () => {
    setImageError(true);
    setIsLoading(false);
  };

  const handleImageLoad = () => {
    setIsLoading(false);
  };

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

  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      {isLoading && (
        <div 
          className="absolute inset-0 bg-muted rounded-full animate-pulse"
          style={{ width: size, height: size }}
        />
      )}
      <Image
        src={`/logos/${teamName}.png`}
        alt={teamName}
        width={size}
        height={size}
        className={`object-contain rounded-full ${isLoading ? 'opacity-0' : 'opacity-100'} transition-opacity`}
        onError={handleImageError}
        onLoad={handleImageLoad}
        priority={false}
      />
    </div>
  );
}