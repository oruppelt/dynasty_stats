import { Dashboard } from "@/components/Dashboard"
import { Header } from "@/components/layout/Header"

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <Dashboard />
      </main>
    </div>
  )
}
