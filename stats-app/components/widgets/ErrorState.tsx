import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useLeagueData } from '@/lib/league-data'

/** Shown by any view when league.json failed to load; Retry fetches it again. */
export function ErrorState() {
  const { refetch, isFetching } = useLeagueData()
  return (
    <Card className="w-full">
      <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
        <AlertTriangle className="h-8 w-8 text-warning" />
        <div className="font-semibold">Couldn&apos;t load the league data</div>
        <p className="max-w-sm text-sm text-muted-foreground">
          Check your connection and try again. If it keeps happening, the data may be updating; give it a minute.
        </p>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'Retrying…' : 'Retry'}
        </Button>
      </CardContent>
    </Card>
  )
}
