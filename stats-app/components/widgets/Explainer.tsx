import { ChevronRight } from 'lucide-react'

/** Collapsible "What does this mean?" under a view's title. */
export function Explainer({ children }: { children: React.ReactNode }) {
  return (
    <details className="group text-sm text-muted-foreground">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 font-medium text-primary [&::-webkit-details-marker]:hidden">
        <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
        What does this mean?
      </summary>
      <div className="mt-2 space-y-2">{children}</div>
    </details>
  )
}
