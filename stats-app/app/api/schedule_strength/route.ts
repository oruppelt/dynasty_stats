import { NextResponse} from 'next/server'

// Force dynamic rendering (no pre-rendering at build time)
export const dynamic = 'force-dynamic'

// Revalidate every 5 minutes (300 seconds)
export const revalidate = 120

export async function GET() {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}schedule_strength`, {
      next: { revalidate: 120 }
    })
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    const data = await response.json()

    // Pass through cache headers from backend
    const headers = new Headers()
    const cacheStatus = response.headers.get('X-Cache-Status')
    if (cacheStatus) {
      headers.set('X-Cache-Status', cacheStatus)
    }
    headers.set('Cache-Control', 'public, max-age=300')

    return NextResponse.json(data, { headers })
  } catch (error) {
    console.error('Error fetching schedule strength data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch schedule strength data' },
      { status: 500 }
    )
  }
} 