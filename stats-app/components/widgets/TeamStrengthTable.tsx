"use client"

import { ColumnDef } from "@tanstack/react-table"
import { DataTable, SortableHeader } from "@/components/ui/data-table"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"

interface TeamStrengthRow {
  rank: number
  team: string
  strength: number
  category: string
  percentile: number
}

const getStrengthCategory = (strength: number) => {
  if (strength >= 0.7) return { label: 'Elite', color: 'bg-green-500' }
  if (strength >= 0.6) return { label: 'Strong', color: 'bg-blue-500' }
  if (strength >= 0.5) return { label: 'Average', color: 'bg-yellow-500' }
  if (strength >= 0.4) return { label: 'Below Average', color: 'bg-orange-500' }
  return { label: 'Weak', color: 'bg-red-500' }
}

const columns: ColumnDef<TeamStrengthRow>[] = [
  {
    accessorKey: "rank",
    header: ({ column }) => <SortableHeader column={column}>Rank</SortableHeader>,
    cell: ({ row }) => (
      <div className="font-bold text-lg">#{row.getValue("rank")}</div>
    ),
  },
  {
    accessorKey: "team",
    header: ({ column }) => <SortableHeader column={column}>Team</SortableHeader>,
    cell: ({ row }) => (
      <div className="font-medium">{row.getValue("team")}</div>
    ),
  },
  {
    accessorKey: "strength",
    header: ({ column }) => <SortableHeader column={column}>Win Rate</SortableHeader>,
    cell: ({ row }) => {
      const strength = row.getValue("strength") as number
      const category = getStrengthCategory(strength)
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Progress value={strength * 100} className="w-32" />
            <span className="font-semibold text-sm">
              {(strength * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      )
    },
  },
  {
    accessorKey: "category",
    header: "Category",
    cell: ({ row }) => {
      const strength = row.getValue("strength") as number
      const category = getStrengthCategory(strength)
      return (
        <Badge variant="outline" className={`${category.color} text-white`}>
          {category.label}
        </Badge>
      )
    },
  },
  {
    accessorKey: "percentile",
    header: ({ column }) => <SortableHeader column={column}>Percentile</SortableHeader>,
    cell: ({ row }) => (
      <div className="text-muted-foreground">
        Top {row.getValue("percentile")}%
      </div>
    ),
  },
]

interface TeamStrengthTableProps {
  data: Array<{
    'Team1 ': string
    Strength: number
    Rank: number
  }>
}

export function TeamStrengthTable({ data }: TeamStrengthTableProps) {
  const rankingsData = [...data].sort((a, b) => a.Rank - b.Rank)

  const tableData: TeamStrengthRow[] = rankingsData.map((team) => {
    const percentile = Math.round(((rankingsData.length - team.Rank + 1) / rankingsData.length) * 100)
    const category = getStrengthCategory(team.Strength)

    return {
      rank: team.Rank,
      team: team['Team1 '],
      strength: team.Strength,
      category: category.label,
      percentile,
    }
  })

  return (
    <DataTable
      columns={columns}
      data={tableData}
      searchKey="team"
      searchPlaceholder="Search teams..."
    />
  )
}
