"use client"

import { useState } from "react"
import { PointsWidget } from "./widgets/PointsWidget"
import { AllVsAllWidget } from "./widgets/AllVsAllWidget"
import { ScheduleStrengthWidget } from "./widgets/ScheduleStrengthWidget"
import { TeamStrengthWidget } from "./widgets/TeamStrengthWidget"
import { ScheduleLuckWidget } from "./widgets/ScheduleLuckWidget"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useLeagueData } from '@/lib/league-data'
import { Target, TrendingUp, Calendar, Shuffle, Zap } from "lucide-react"
import { motion } from "framer-motion"

export function Dashboard() {
  const [selectedTeam, setSelectedTeam] = useState<string>("")
  const teams = useLeagueData().data?.strength.teams

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-8">
      {/* Team Filter */}
      {teams && (
        <motion.div
          className="mb-6 flex justify-center"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="inline-flex flex-col gap-2">
            <label className="text-sm font-medium text-muted-foreground">
              Filter by Team
            </label>
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="px-4 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring min-w-[250px] transition-all"
            >
              <option value="">All Teams</option>
              {teams.map(team => (
                <option key={team} value={team}>
                  {team}
                </option>
              ))}
            </select>
          </div>
        </motion.div>
      )}

      {/* Tabs Navigation */}
      <Tabs defaultValue="points" className="w-full">
        <TabsList className="grid w-full grid-cols-5 mb-8">
          <TabsTrigger value="points" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            <span className="hidden sm:inline">Points</span>
          </TabsTrigger>
          <TabsTrigger value="allvsall" className="flex items-center gap-2">
            <Shuffle className="h-4 w-4" />
            <span className="hidden sm:inline">All vs All</span>
          </TabsTrigger>
          <TabsTrigger value="teamstrength" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">Strength</span>
          </TabsTrigger>
          <TabsTrigger value="schedule" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span className="hidden sm:inline">Schedule</span>
          </TabsTrigger>
          <TabsTrigger value="scheduleluck" className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            <span className="hidden sm:inline">Luck</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="points" className="mt-0">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <PointsWidget selectedTeam={selectedTeam} />
          </motion.div>
        </TabsContent>

        <TabsContent value="allvsall" className="mt-0">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <AllVsAllWidget selectedTeam={selectedTeam} />
          </motion.div>
        </TabsContent>

        <TabsContent value="teamstrength" className="mt-0">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <TeamStrengthWidget selectedTeam={selectedTeam} />
          </motion.div>
        </TabsContent>

        <TabsContent value="schedule" className="mt-0">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <ScheduleStrengthWidget selectedTeam={selectedTeam} />
          </motion.div>
        </TabsContent>

        <TabsContent value="scheduleluck" className="mt-0">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <ScheduleLuckWidget selectedTeam={selectedTeam} />
          </motion.div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

