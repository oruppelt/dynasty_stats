"use client"

import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { useLayoutStore } from "@/lib/layout-store"
import { useQuery } from "@tanstack/react-query"
import { BarChart3, Menu } from "lucide-react"

interface DataMetadata {
  updated_at: string
}

export function Header() {
  const { toggleSidebar } = useLayoutStore()

  // Written by pipeline/build_data.py whenever the league data changes
  const { data: metadata } = useQuery<DataMetadata>({
    queryKey: ['metadata'],
    queryFn: async () => {
      const response = await fetch('/data/metadata.json')
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.json()
    },
  })
  const updatedAt = metadata?.updated_at
    ? new Date(metadata.updated_at).toLocaleString(undefined, {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : null

  return (
    <header className="sticky top-0 z-50 w-full border-b gradient-header backdrop-blur">
      <div className="container flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <BarChart3 className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">NBA Fantasy Stats</h1>
            <p className="text-xs text-muted-foreground">Advanced Analytics Dashboard</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {updatedAt && (
            <span className="text-xs text-muted-foreground" title="When the league data last changed">
              Updated {updatedAt}
            </span>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
