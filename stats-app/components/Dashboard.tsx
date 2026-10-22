"use client"

import { useState } from "react"
import { MyTeamWidget } from "./widgets/MyTeamWidget"
import { StandingsWidget } from "./widgets/StandingsWidget"
import { PointsWidget } from "./widgets/PointsWidget"
import { AllVsAllWidget } from "./widgets/AllVsAllWidget"
import { ScheduleStrengthWidget } from "./widgets/ScheduleStrengthWidget"
import { WidgetSkeleton } from "./widgets/WidgetSkeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useLeagueData } from '@/lib/league-data'
import { useInitSelectedTeam, useSelectedTeam } from '@/lib/selected-team'
import { Calendar, ListOrdered, Shuffle, Target, User } from "lucide-react"
import { motion } from "framer-motion"
import type { LucideIcon } from "lucide-react"

interface TabDef {
  value: string
  label: string
  icon: LucideIcon
  render: (selectedTeam: string) => React.ReactNode
}

const TABS: TabDef[] = [
  { value: "myteam", label: "My Team", icon: User, render: team => <MyTeamWidget selectedTeam={team} /> },
  { value: "standings", label: "Standings", icon: ListOrdered, render: team => <StandingsWidget selectedTeam={team} /> },
  { value: "points", label: "Points", icon: Target, render: team => <PointsWidget selectedTeam={team} /> },
  { value: "allvsall", label: "All vs All", icon: Shuffle, render: team => <AllVsAllWidget selectedTeam={team} /> },
  { value: "schedule", label: "Schedule", icon: Calendar, render: team => <ScheduleStrengthWidget selectedTeam={team} /> },
]

export function Dashboard() {
  const { data: league, error } = useLeagueData()
  useInitSelectedTeam(league?.strength.teams)
  const { team: selectedTeam, ready } = useSelectedTeam()
  // Until the viewer picks a tab: their team if they have one, else the league
  const [tab, setTab] = useState<string | null>(null)

  if (!ready && !error) {
    return (
      <div className="w-full max-w-7xl mx-auto px-4 py-6">
        <WidgetSkeleton variant="list" />
      </div>
    )
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-6">
      <Tabs
        value={tab ?? (selectedTeam ? "myteam" : "standings")}
        onValueChange={setTab}
        className="w-full"
      >
        <TabsList className="grid h-auto w-full grid-cols-5 mb-6">
          {TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="flex flex-col gap-1 px-1 text-[11px] sm:flex-row sm:gap-2 sm:px-3 sm:text-sm"
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS.map(({ value, render }) => (
          <TabsContent key={value} value={value} className="mt-0">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              {render(selectedTeam)}
            </motion.div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
