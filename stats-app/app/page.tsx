import { Dashboard } from "@/components/Dashboard"
import { Header } from "@/components/layout/Header"
import { Sidebar } from "@/components/layout/Sidebar"

// Force dynamic rendering to prevent build-time data fetching
export const dynamic = 'force-dynamic'

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="flex h-[calc(100vh-64px)]">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <Dashboard />
        </main>
      </div>
    </div>
  )
}

