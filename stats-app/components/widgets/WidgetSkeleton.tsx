import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

interface WidgetSkeletonProps {
  variant?: 'chart' | 'heatmap' | 'list' | 'scatter'
}

export function WidgetSkeleton({ variant = 'chart' }: WidgetSkeletonProps) {
  if (variant === 'chart') {
    return (
      <Card className="w-full">
        <CardHeader className="space-y-2">
          <div className="relative overflow-hidden">
            <Skeleton className="h-8 w-64" />
            <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          </div>
          <div className="relative overflow-hidden">
            <Skeleton className="h-4 w-96" />
            <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-around items-end h-[400px]">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="relative overflow-hidden w-12" style={{ height: `${Math.random() * 80 + 20}%` }}>
                <Skeleton className="w-full h-full" />
                <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (variant === 'heatmap') {
    return (
      <Card className="w-full">
        <CardHeader className="space-y-2">
          <div className="relative overflow-hidden">
            <Skeleton className="h-8 w-64" />
            <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-10 gap-2">
            {[...Array(100)].map((_, i) => (
              <div key={i} className="relative overflow-hidden">
                <Skeleton className="h-12 w-12" />
                <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (variant === 'list') {
    return (
      <Card className="w-full">
        <CardHeader className="space-y-2">
          <div className="relative overflow-hidden">
            <Skeleton className="h-8 w-64" />
            <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="relative overflow-hidden">
                <Skeleton className="h-24" />
                <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              </div>
            ))}
          </div>
          <div className="space-y-3">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="relative overflow-hidden">
                <Skeleton className="h-20 w-full" />
                <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (variant === 'scatter') {
    return (
      <Card className="w-full">
        <CardHeader className="space-y-2">
          <div className="relative overflow-hidden">
            <Skeleton className="h-8 w-64" />
            <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative overflow-hidden">
            <Skeleton className="h-[600px] w-full" />
            <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return null
}
