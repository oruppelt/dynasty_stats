"use client"

import { useEffect, useState } from "react"
import { MyTeamWidget } from "./widgets/MyTeamWidget"
import { StandingsWidget } from "./widgets/StandingsWidget"
import { PointsWidget } from "./widgets/PointsWidget"
import { AllVsAllWidget } from "./widgets/AllVsAllWidget"
import { LuckWidget } from "./widgets/LuckWidget"
import { RecapWidget } from "./widgets/RecapWidget"
import { SeasonWidget } from "./widgets/SeasonWidget"
import { WidgetSkeleton } from "./widgets/WidgetSkeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useLeagueData } from '@/lib/league-data'
import { useInitSelectedTeam, useSelectedTeam } from '@/lib/selected-team'
import { getUrlParam, setUrlParam } from '@/lib/url'
import { CalendarDays, Clover, ListOrdered, Shuffle, Target, TrendingUp, User } from "lucide-react"
import type { LucideIcon } from "lucide-react"

interface TabDef {
  value: string
  label: string
  icon: LucideIcon
  render: (selectedTeam: string, openRecap: (period: number) => void) => React.ReactNode
}

const TABS: TabDef[] = [
  { value: "myteam", label: "My Team", icon: User, render: (team, openRecap) => <MyTeamWidget selectedTeam={team} onOpenRecap={openRecap} /> },
  { value: "recap", label: "Recap", icon: CalendarDays, render: team => <RecapWidget selectedTeam={team} /> },
  { value: "standings", label: "Standings", icon: ListOrdered, render: team => <StandingsWidget selectedTeam={team} /> },
  { value: "season", label: "Season", icon: TrendingUp, render: team => <SeasonWidget selectedTeam={team} /> },
  { value: "points", label: "Points", icon: Target, render: team => <PointsWidget selectedTeam={team} /> },
  { value: "allvsall", label: "All vs All", icon: Shuffle, render: team => <AllVsAllWidget selectedTeam={team} /> },
  { value: "luck", label: "Luck", icon: Clover, render: team => <LuckWidget selectedTeam={team} /> },
]

export function Dashboard() {
  const { data: league, error } = useLeagueData()
  useInitSelectedTeam(league?.matchups.teams)
  const { team: selectedTeam, ready } = useSelectedTeam()
  // Until the viewer picks a tab: their team if they have one, else the league
  const [tab, setTab] = useState<string | null>(null)
  // A shared recap link (?period=) opens on the recap
  useEffect(() => {
    if (getUrlParam('period')) setTab("recap")
  }, [])

  // Same as following a ?period= link: the recap reads the period when it opens
  const openRecap = (period: number) => {
    setUrlParam("period", String(period))
    setTab("recap")
    window.scrollTo({ top: 0 })
  }

  if (!ready && !error) {
    return (
      <div className="w-full max-w-6xl mx-auto px-4 py-6">
        <WidgetSkeleton variant="list" />
      </div>
    )
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-6">
      <Tabs
        value={tab ?? (selectedTeam ? "myteam" : "standings")}
        onValueChange={value => {
          setTab(value)
          // The link names a period only while the recap is open
          if (value !== "recap") setUrlParam("period", "")
        }}
        className="w-full"
      >
        <TabsList className="grid h-auto w-full grid-cols-4 gap-1 md:grid-cols-7 mb-6">
          {TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="flex flex-col gap-1 px-1 text-[11px] sm:flex-row sm:gap-2 sm:px-2 sm:text-sm"
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS.map(({ value, render }) => (
          <TabsContent key={value} value={value} className="mt-0">
            {render(selectedTeam, openRecap)}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
