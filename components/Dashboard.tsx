"use client"

import { useState, useEffect } from "react"
import { PointsWidget } from "./widgets/PointsWidget"
import { AllVsAllWidget } from "./widgets/AllVsAllWidget"
import { ScheduleStrengthWidget } from "./widgets/ScheduleStrengthWidget"
import { TeamStrengthWidget } from "./widgets/TeamStrengthWidget"
import { ScheduleLuckWidget } from "./widgets/ScheduleLuckWidget"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useQuery } from '@tanstack/react-query'
import { useLogger } from '@/lib/logger'
import { handleQueryError, handleQuerySuccess, statsApi } from '@/lib/api-client'
import { Target, TrendingUp, Calendar, Shuffle, Zap } from "lucide-react"
import { motion } from "framer-motion"

interface TeamsData {
  teams: string[];
  // ... other fields
}

export function Dashboard() {
  const logger = useLogger('Dashboard');
  const [selectedTeam, setSelectedTeam] = useState<string>("")

  useEffect(() => {
    logger.info('Dashboard mounted');
    return () => logger.info('Dashboard unmounted');
  }, [logger]);

  const handleTabChange = (newTab: string) => {
    logger.userAction('widget_changed', {
      newWidget: newTab
    });
  };

  // Fetch teams list from any of the endpoints that provide it
  const { data } = useQuery<TeamsData>({
    queryKey: ['strength'],
    queryFn: async () => {
      try {
        logger.info('Fetching teams data for dashboard');
        const response = await statsApi.getStrength();
        handleQuerySuccess(response.data, 'strength');
        return response.data as TeamsData;
      } catch (err) {
        logger.error('Failed to fetch teams data', undefined, err as Error);
        handleQueryError(err, 'strength');
        throw err;
      }
    }
  })

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-8">
      {/* Team Filter */}
      {data?.teams && (
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
              onChange={(e) => {
                const newTeam = e.target.value;
                logger.userAction('team_selection_changed', {
                  previousTeam: selectedTeam,
                  newTeam,
                  availableTeams: data?.teams?.length
                });
                setSelectedTeam(newTeam);
              }}
              className="px-4 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring min-w-[250px] transition-all"
            >
              <option value="">All Teams</option>
              {data.teams.map(team => (
                <option key={team} value={team}>
                  {team}
                </option>
              ))}
            </select>
          </div>
        </motion.div>
      )}

      {/* Tabs Navigation */}
      <Tabs defaultValue="points" className="w-full" onValueChange={handleTabChange}>
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

