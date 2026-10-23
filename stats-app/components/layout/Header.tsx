"use client"

import { ThemeToggle } from "@/components/theme-toggle"
import { TeamLogo } from "@/components/widgets/TeamLogo"
import { useLeagueData, useSeasons } from "@/lib/league-data"
import { useSelectedSeason } from "@/lib/selected-season"
import { useSelectedTeam } from "@/lib/selected-team"
import { BarChart3 } from "lucide-react"

export function Header() {
  const { data: league } = useLeagueData()
  const { data: seasons } = useSeasons()
  const setSeason = useSelectedSeason(s => s.setSeason)
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
              <div className="flex items-center text-xs text-muted-foreground">
                {seasons && seasons.seasons.length > 1 ? (
                  <label className="shrink-0">
                    <span className="sr-only">Season</span>
                    <select
                      value={league.meta.season}
                      onChange={(e) => setSeason(e.target.value, seasons.default)}
                      className="-ml-1 rounded-sm bg-transparent px-0.5 font-medium text-foreground focus:outline-hidden focus:ring-2 focus:ring-ring"
                    >
                      {seasons.seasons.map(s => <option key={s.id} value={s.id}>{s.id}</option>)}
                    </select>
                  </label>
                ) : (
                  <span className="shrink-0">{league.meta.season}</span>
                )}
                <span className="truncate" title="When the league data last changed">
                  &nbsp;· {league.playoffs?.champion ? 'Final' : (
                    <>
                      <span className="sm:hidden">Period {league.meta.latest_period}</span>
                      <span className="hidden sm:inline">Through period {league.meta.latest_period}</span>
                    </>
                  )}
                  <span className="hidden sm:inline"> · Updated {updatedAt}</span>
                </span>
              </div>
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
