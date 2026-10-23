"use client"

import { Fragment, useState } from "react"
import { MyTeamWidget } from "./widgets/MyTeamWidget"
import { StandingsWidget } from "./widgets/StandingsWidget"
import { PointsWidget } from "./widgets/PointsWidget"
import { AllVsAllWidget } from "./widgets/AllVsAllWidget"
import { LuckWidget } from "./widgets/LuckWidget"
import { RecapWidget } from "./widgets/RecapWidget"
import { SeasonWidget } from "./widgets/SeasonWidget"
import { PlayoffsWidget } from "./widgets/PlayoffsWidget"
import { FormWidget } from "./widgets/FormWidget"
import { RecordsWidget } from "./widgets/RecordsWidget"
import { RivalryWidget } from "./widgets/RivalryWidget"
import { ScheduleSwapWidget } from "./widgets/ScheduleSwapWidget"
import { ChampionsWidget } from "./widgets/ChampionsWidget"
import { FranchisesWidget } from "./widgets/FranchisesWidget"
import { CareerHeadToHeadWidget } from "./widgets/CareerHeadToHeadWidget"
import { AllTimeRecordsWidget } from "./widgets/AllTimeRecordsWidget"
import { WidgetSkeleton } from "./widgets/WidgetSkeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useLeagueData, useSeasonInfo } from '@/lib/league-data'
import { useInitSelectedTeam, useSelectedTeam } from '@/lib/selected-team'
import { getUrlParam, setUrlParam } from '@/lib/url'
import { cn } from '@/lib/utils'
import { CalendarDays, Info, Landmark, ListOrdered, Swords, TrendingUp, User } from "lucide-react"
import type { LucideIcon } from "lucide-react"

type Render = (selectedTeam: string, openRecap: (period: number) => void) => React.ReactNode

interface View {
  value: string
  label: string
  render: Render
}

/** A top-level tab; one with several views shows them as a second row of buttons. */
interface Section {
  value: string
  label: string
  icon: LucideIcon
  views: View[]
  /** Every season together, not the one picked in the header */
  allSeasons?: boolean
}

const SECTIONS: Section[] = [
  {
    value: "myteam", label: "My Team", icon: User,
    views: [{ value: "myteam", label: "My Team", render: (team, openRecap) => <MyTeamWidget selectedTeam={team} onOpenRecap={openRecap} /> }],
  },
  {
    value: "recap", label: "Recap", icon: CalendarDays,
    views: [{ value: "recap", label: "Recap", render: team => <RecapWidget selectedTeam={team} /> }],
  },
  {
    value: "standings", label: "Standings", icon: ListOrdered,
    views: [
      { value: "standings", label: "Table", render: team => <StandingsWidget selectedTeam={team} /> },
      { value: "form", label: "Form", render: team => <FormWidget selectedTeam={team} /> },
      { value: "playoffs", label: "Playoffs", render: team => <PlayoffsWidget selectedTeam={team} /> },
    ],
  },
  {
    value: "season", label: "Season", icon: TrendingUp,
    views: [
      { value: "season", label: "Rank & luck", render: team => <SeasonWidget selectedTeam={team} /> },
      { value: "points", label: "Points", render: team => <PointsWidget selectedTeam={team} /> },
      { value: "records", label: "Records", render: team => <RecordsWidget selectedTeam={team} /> },
    ],
  },
  {
    value: "matchups", label: "Matchups", icon: Swords,
    views: [
      { value: "rivalry", label: "Rivalry", render: team => <RivalryWidget selectedTeam={team} /> },
      { value: "allvsall", label: "All vs All", render: team => <AllVsAllWidget selectedTeam={team} /> },
      { value: "luck", label: "Luck", render: team => <LuckWidget selectedTeam={team} /> },
      { value: "whatif", label: "What if", render: team => <ScheduleSwapWidget selectedTeam={team} /> },
    ],
  },
  {
    value: "history", label: "History", icon: Landmark, allSeasons: true,
    views: [
      { value: "champions", label: "Champions", render: team => <ChampionsWidget selectedTeam={team} /> },
      { value: "franchises", label: "Franchises", render: team => <FranchisesWidget selectedTeam={team} /> },
      { value: "h2h", label: "Head to head", render: team => <CareerHeadToHeadWidget selectedTeam={team} /> },
      { value: "records", label: "Records", render: team => <AllTimeRecordsWidget selectedTeam={team} /> },
    ],
  },
]

function ViewPicker({ views, value, onChange }: { views: View[]; value: string; onChange: (view: string) => void }) {
  return (
    <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto">
      {views.map(v => (
        <button
          key={v.value}
          type="button"
          role="tab"
          aria-selected={v.value === value}
          onClick={() => onChange(v.value)}
          className={cn(
            "shrink-0 rounded-full border px-3 py-1 text-sm font-medium transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
            v.value === value ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
          )}
        >
          {v.label}
        </button>
      ))}
    </div>
  )
}

export function Dashboard() {
  const { data: league, error } = useLeagueData()
  useInitSelectedTeam(league?.matchups.teams)
  const { team: selectedTeam, ready } = useSelectedTeam()
  const seasonInfo = useSeasonInfo()
  // Until the viewer picks a tab: their team if they have one, else the league.
  // A shared recap link (?period=) opens on the recap. (Reading the URL here is
  // safe: the tabs only render after the team list loads, well after hydration.)
  const [tab, setTab] = useState<string | null>(() => getUrlParam("period") ? "recap" : null)
  // The view open in each section (its first one until the viewer picks another)
  const [views, setViews] = useState<Record<string, string>>({})

  // Same as following a ?period= link: the recap reads the period when it opens
  const openRecap = (period: number) => {
    setUrlParam("period", String(period))
    setTab("recap")
    window.scrollTo({ top: 0 })
  }

  const currentTab = tab ?? (selectedTeam ? "myteam" : "standings")

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
        value={currentTab}
        onValueChange={value => {
          setTab(value)
          // The link names a period only while the recap is open
          if (value !== "recap") setUrlParam("period", "")
        }}
        className="w-full"
      >
        {seasonInfo?.note && !SECTIONS.find(s => s.value === currentTab)?.allSeasons && (
          <p className="mb-3 flex items-start gap-2 rounded-md border px-3 py-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span><span className="font-medium text-foreground">{seasonInfo.id}:</span> {seasonInfo.note}</span>
          </p>
        )}
        <TabsList className="mb-4 grid h-auto w-full grid-cols-6 gap-1">
          {SECTIONS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="flex flex-col gap-1 px-0.5 text-[11px] sm:flex-row sm:gap-2 sm:px-2 sm:text-sm"
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {SECTIONS.map(section => {
          const view = section.views.find(v => v.value === views[section.value]) ?? section.views[0]
          return (
            <TabsContent key={section.value} value={section.value} className="mt-0">
              {section.views.length > 1 && (
                <ViewPicker
                  views={section.views}
                  value={view.value}
                  onChange={value => setViews(current => ({ ...current, [section.value]: value }))}
                />
              )}
              {/* A new season starts each view afresh (picked period, round, ...) */}
              <Fragment key={section.allSeasons ? view.value : `${league?.meta.season}-${view.value}`}>{view.render(selectedTeam, openRecap)}</Fragment>
            </TabsContent>
          )
        })}
      </Tabs>
    </div>
  )
}
