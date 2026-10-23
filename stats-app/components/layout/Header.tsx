"use client"

import { ThemeToggle } from "@/components/theme-toggle"
import { TeamLogo } from "@/components/widgets/TeamLogo"
import { useLeagueData } from "@/lib/league-data"
import { useSelectedTeam } from "@/lib/selected-team"
import { BarChart3 } from "lucide-react"

export function Header() {
  const { data: league } = useLeagueData()
  const { team, ready, setTeam } = useSelectedTeam()

  // Set by pipeline/build_data.py whenever the league data changes
  const updatedAt = league
    ? new Date(league.meta.updated_at).toLocaleString(undefined, {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : null

  return (
    <header className="sticky top-0 z-50 w-full border-b gradient-header backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-2">
          <BarChart3 className="hidden h-6 w-6 shrink-0 text-primary sm:block" />
          <div className="min-w-0">
            <div className="truncate text-base font-bold sm:text-xl">
              <span className="sm:hidden">Fantasy Stats</span>
              <span className="hidden sm:inline">NBA Fantasy Stats</span>
            </div>
            {league && (
              <p className="truncate text-xs text-muted-foreground" title="When the league data last changed">
                Through period {league.meta.latest_period}
                <span className="hidden sm:inline"> · Updated {updatedAt}</span>
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {league && ready && (
            <label className="flex items-center gap-2">
              {team && <TeamLogo key={team} teamName={team} size={28} className="hidden sm:block" />}
              <span className="sr-only">Your team</span>
              <select
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                className="w-36 truncate rounded-lg border bg-background px-2 py-1.5 text-sm focus:outline-hidden focus:ring-2 focus:ring-ring sm:w-56"
              >
                <option value="">Pick your team</option>
                {league.matchups.teams.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
