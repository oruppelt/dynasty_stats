# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a full-stack NBA fantasy stats analysis application consisting of:
- **Frontend**: Next.js 15 app (`stats-app/`) with TypeScript, Tailwind CSS, and React Query
- **Backend**: FastAPI Python server (`backend/`) that fetches data from Google Sheets

## Development Commands

### Frontend (stats-app/)
```bash
# Development server
cd stats-app && npm run dev

# Build for production
cd stats-app && npm run build

# Production server
cd stats-app && npm run start

# Lint code
cd stats-app && npm run lint
```

### Backend (backend/)
```bash
# Install dependencies
cd backend && pip install -r requirements.txt

# Run development server
cd backend && python app.py

# Alternative with uvicorn
cd backend && uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

## Architecture

### Backend Structure
- `app.py`: FastAPI main application with CORS middleware configured for localhost:3000
- `cache.py`: **Thread-safe in-memory cache with TTL and request coalescing** to prevent Google Sheets rate limiting
- `strength.py`: Team strength analysis router - calculates win rates and rankings with caching
- `for_against.py`: Points for/against analysis router with caching
- `schedule_strength.py`: Schedule strength calculations router with caching
- `constants.py`: Contains Google Sheets configuration (SHEET_ID, DATA_TAB)
- `logger_config.py`: Centralized logging with request ID tracking

### Frontend Structure
- `app/page.tsx`: Main dashboard page
- `components/Dashboard.tsx`: Central dashboard component with widget selection
- `components/widgets/`: Individual analysis widgets
  - `PointsWidget.tsx`: Points for/against visualization
  - `AllVsAllWidget.tsx`: Head-to-head matchup matrix
  - `TeamStrengthWidget.tsx`: Team strength rankings
  - `ScheduleStrengthWidget.tsx`: Schedule difficulty analysis
  - `ScheduleLuckWidget.tsx`: Schedule luck calculations
  - `HeatMap.tsx`, `StrengthHeatMap.tsx`: Chart visualization components

### Data Flow

The application uses **3-layer caching** to minimize Google Sheets API calls and prevent rate limiting:

1. **Backend Cache Layer** (`backend/cache.py`):
   - In-memory cache with 5-minute TTL
   - Request coalescing prevents duplicate concurrent fetches
   - When 10 requests arrive simultaneously, only 1 fetches from Google Sheets
   - Logs cache HIT/MISS for monitoring

2. **Next.js ISR Layer** (`app/api/*/route.ts`):
   - Server-side caching with 5-minute revalidation
   - `dynamic = 'force-dynamic'` prevents build-time pre-rendering
   - Reduces backend load

3. **React Query Layer** (`app/providers.tsx`):
   - Client-side cache with 5-minute stale time
   - Disabled refetch on window focus/reconnect
   - Exponential backoff retry logic

**Request Flow:**
1. Frontend widget requests data via React Query
2. React Query checks client cache (5 min) → If fresh, return cached data
3. If stale, call Next.js API route
4. Next.js checks ISR cache (5 min) → If fresh, return cached data
5. If stale, call backend endpoint
6. Backend checks in-memory cache (5 min) → If fresh, return cached data
7. If cache miss, fetch from Google Sheets, cache result, return data
8. Charts rendered using @nivo/heatmap, recharts, and chart.js libraries

**Performance:** First request ~4s, subsequent requests <10ms (cache hit)

### Key Technologies
- **Frontend**: Next.js 15, TypeScript, Tailwind CSS, React Query, Recharts/Nivo charts
- **Backend**: FastAPI, pandas, numpy, uvicorn
- **UI Components**: Custom components with shadcn/ui styling patterns
- **Data Source**: Google Sheets accessed via public CSV URLs

## API Endpoints

All endpoints return cache status headers for monitoring:
- `X-Cache-Status: HIT|MISS` - Indicates if response was served from cache
- `Cache-Control: public, max-age=300` - Browser/CDN caching instructions

**Backend Endpoints:**
- `GET /strength`: Team strength matrix and rankings
- `GET /for_against`: Points for/against statistics
- `GET /schedule_strength`: Schedule strength analysis

**Frontend API Routes (Next.js):**
- `GET /api/strength`: Proxies to backend `/strength` with ISR caching
- `GET /api/for_against`: Proxies to backend `/for_against` with ISR caching
- `GET /api/schedule_strength`: Proxies to backend `/schedule_strength` with ISR caching

## Caching & Rate Limiting Prevention

### The Problem
Google Sheets CSV export has rate limits (~100 requests per 100 seconds). During production deployments, concurrent requests cause **429 Rate Limit** errors.

### The Solution: 3-Layer Caching with Request Coalescing

#### 1. Backend Cache (`backend/cache.py`)
**Thread-safe in-memory cache with request coalescing:**
```python
# Usage in endpoints
result = await cache.get_or_compute(cache_key, _compute_strength)
```

**Features:**
- **5-minute TTL**: Data cached for 300 seconds
- **Request Coalescing**: If 10 requests arrive for same data simultaneously:
  - Request 1: Fetches from Google Sheets
  - Requests 2-10: Wait for Request 1 to complete
  - All get same cached result
- **Thread-safe**: Uses asyncio.Lock for concurrent request handling
- **Automatic cleanup**: Expired entries removed automatically

**Cache Monitoring:**
```python
cache.get_stats()  # Returns cache statistics
```

#### 2. Next.js ISR Cache
**Server-side caching with revalidation:**
```typescript
export const dynamic = 'force-dynamic'  // No build-time pre-rendering
export const revalidate = 300           // 5-minute revalidation
```

#### 3. React Query Cache
**Client-side cache configuration:**
```typescript
staleTime: 5 * 60 * 1000,          // 5 minutes
gcTime: 10 * 60 * 1000,            // Keep 10 minutes
refetchOnWindowFocus: false,        // Don't refetch on focus
refetchOnReconnect: false,          // Don't refetch on reconnect
```

#### 4. Static Data Fallback (Production Deployments) ⭐ RECOMMENDED
**Problem:** When backend/frontend services restart simultaneously on Render, concurrent requests cause 429 errors even with cache warmup, because Google Sheets is called during startup.

**Solution:** Commit static JSON snapshots of data. Backend loads instantly from JSON on startup, then refreshes from Google Sheets in background.

**Architecture:**
1. **Deployment:** JSON files committed in `backend/data/` directory (~120KB total)
2. **Startup (<1s):** Load from JSON files (instant, no Google Sheets calls)
3. **Background Refresh (after 5s):** Update cache from Google Sheets asynchronously
4. **Runtime:** Serve from cache with standard 5-min TTL

**Implementation in `backend/app.py`:**
```python
@app.on_event("startup")
async def startup_event():
    """Load static data on startup, then refresh in background"""
    cache = get_cache()

    # Load from JSON (instant, no API calls)
    strength_data = load_static_data("strength.json")
    cache.set("strength", strength_data)

    schedule_data = load_static_data("schedule_strength.json")
    cache.set("schedule_strength", schedule_data)

    # Start background refresh after 5 seconds
    asyncio.create_task(background_refresh())
```

**Updating Static Data:**
Before deployment or via cron, run:
```bash
cd backend
python snapshot_data.py  # Fetches latest data and saves as JSON
git add data/*.json      # Commit updated snapshots
git commit -m "Update data snapshot"
```

**Startup Logs:**
```
================================================================================
STARTUP: Loading static data from JSON files...
================================================================================
Loading 'strength' data from JSON...
✓ 'strength' data loaded successfully (teams: 30)
Loading 'schedule_strength' data from JSON...
✓ 'schedule_strength' data loaded successfully (teams: 30)
✓ 'for_against' will use the same cached data as 'strength'
================================================================================
STARTUP: Complete! All endpoints ready with static data.
Background refresh will start in 5 seconds...
================================================================================

[5 seconds later]
================================================================================
BACKGROUND REFRESH: Starting data refresh from Google Sheets...
================================================================================
✓ 'strength' cache refreshed successfully (teams: 30)
✓ 'schedule_strength' cache refreshed successfully (teams: 30)
================================================================================
BACKGROUND REFRESH: Complete! Cache updated with fresh data.
================================================================================
```

**Benefits:**
- ✅ **Zero 429 errors:** No Google Sheets calls during critical startup period
- ✅ **Instant startup:** Backend ready in <1s vs ~7s with API calls
- ✅ **Deployment safety:** Works even if both services restart simultaneously
- ✅ **Fresh data:** Background refresh updates cache within 5 seconds
- ✅ **Graceful degradation:** If Google Sheets is down, serves static data
- ✅ **Simple:** Just run snapshot script before deploying

**Trade-offs:**
- Data can be slightly stale for first 5 seconds after deployment (mitigated by frequent snapshots)
- Adds ~120KB to repository (negligible)

### Performance Impact
- **Before caching**: 30-50 Google Sheets requests/minute → 429 errors
- **After caching**: 1-2 Google Sheets requests/5 minutes → No errors
- **Speedup**: First request 4s, cached requests <10ms (99.7% faster)
- **Cold start**: With warmup, first user request <10ms (cache already populated)

## Logging and Error Handling

### Backend Logging
The application includes comprehensive logging for debugging data pipeline failures:
- **Logger Configuration**: `backend/logger_config.py` - Structured logging with request ID tracking
- **Request Middleware**: All API requests logged with timing and request IDs
- **Cache Operations**: Cache HIT/MISS, request coalescing, and TTL logging
- **Data Processing**: Each pandas operation logged with data shape and transformation details
- **Google Sheets Integration**: URL construction, fetch status, and column validation logged
- **Error Context**: Detailed error logging with processing time and failure context

### Frontend Logging  
- **Logger Utility**: `stats-app/lib/logger.ts` - Structured client-side logging
- **API Client**: `stats-app/lib/api-client.ts` - Request/response logging with retry logic
- **Error Boundaries**: `stats-app/components/ErrorBoundary.tsx` - Component error catching and logging
- **Component Lifecycle**: Mount/unmount and user interaction logging
- **Chart Rendering**: Chart data processing and rendering failure tracking

### Error Handling Strategy
- Backend: Comprehensive try-catch blocks with contextual error information
- Frontend: Error boundaries around widgets and chart components
- API Layer: Automatic retry logic with exponential backoff
- Request Correlation: Request IDs track requests across frontend/backend boundary

## Key Files for Understanding

### Caching Infrastructure
- `backend/cache.py`: Thread-safe in-memory cache with request coalescing
  - `SimpleCache` class with TTL support
  - `get_or_compute()` method prevents duplicate concurrent fetches
  - Cache statistics and monitoring
- `backend/snapshot_data.py`: Script to create JSON snapshots of Google Sheets data
  - Run before deployment to update static fallback data
- `backend/data/`: Static JSON snapshots for instant startup
  - `strength.json`: Team strength data (~61KB)
  - `schedule_strength.json`: Schedule strength data (~63KB)
  - `metadata.json`: Snapshot timestamp metadata

### Backend Core
- `backend/app.py`: API server setup and routing configuration with request middleware
- `backend/strength.py`: Team strength calculation with caching
  - `_compute_strength()`: Internal computation function
  - `strength()`: Endpoint handler using request coalescing
- `backend/for_against.py`: Points for/against analysis with caching
- `backend/schedule_strength.py`: Schedule strength calculations with caching
- `backend/logger_config.py`: Centralized logging configuration and utilities

### Frontend Core
- `stats-app/app/providers.tsx`: React Query configuration with aggressive caching
- `stats-app/components/Dashboard.tsx`: Widget management and team selection with user action logging
- `stats-app/lib/api-client.ts`: Enhanced API client with retry logic and logging
- `stats-app/lib/logger.ts`: Frontend logging system and component hooks

### Next.js API Routes (with ISR caching)
- `stats-app/app/api/strength/route.ts`: Strength endpoint proxy
- `stats-app/app/api/for_against/route.ts`: For/against endpoint proxy
- `stats-app/app/api/schedule_strength/route.ts`: Schedule strength endpoint proxy

## Troubleshooting

### 429 Rate Limit Errors
If you see `429 Too Many Requests` errors from Google Sheets:

1. **Verify cache warmup completed**: Check backend startup logs for:
   ```
   ================================================================================
   CACHE WARMUP: Complete! All endpoints ready to serve cached data.
   ================================================================================
   ```
   If you see `CACHE WARMUP FAILED`, the app continues but may experience 429 errors on first requests.

2. **Check cache is enabled**: Look for cache logs in backend
   ```
   Cache HIT: 'strength' (age: 7.1s, ttl: 300s)
   ```

3. **Verify request coalescing**: During high traffic, you should see:
   ```
   Request coalescing: Starting new fetch for 'strength'
   Request coalescing: Waiting for in-progress fetch of 'strength'
   ```

4. **Monitor cache headers**: API responses should include:
   ```
   X-Cache-Status: HIT
   Cache-Control: public, max-age=300
   ```

5. **Check Next.js dynamic rendering**: app/page.tsx must have:
   ```typescript
   export const dynamic = 'force-dynamic'
   ```
   This prevents Next.js from making API calls during build time.

### Cache Not Working
- Restart backend to reinitialize cache
- Check `cache.get_stats()` for cache state
- Verify TTL settings (default: 300 seconds)
- Look for cache errors in logs