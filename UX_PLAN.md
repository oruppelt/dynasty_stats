# UX/UI Improvement Plan

Started 2026-10-22 after a full review of `stats-app/` and `backend/`.
Supersedes the generic parts of `ROADMAP.md`. Focused on what the ~30 league
members actually use the app for.

## Guiding idea

People open the app to answer three questions:

1. **How is my team doing?**
2. **Am I actually good, or just lucky?**
3. **What happened this week?**

The current UI is a generic analytics dashboard: it opens on a scatter plot,
there is no plain standings table, and the most interesting stat (schedule
luck) is buried in the last tab as an unlabeled number like `-2.950`.

What the existing metrics mean (useful for labelling them in plain words):

- **Strength** (`/strength`, `matrix[].Strength`) = all-play win %: in each
  matchweek, how often the team's score beat every other team's score.
- **Schedule luck** (`/schedule_strength`, `matrix[].Strength`) = actual wins
  minus all-play expected wins, summed over opponents. Units are "wins".
- **`PERIOD`** column in the sheet = matchweek. It is read by the backend but
  then dropped, so no time dimension reaches the UI today.

## Why this order

- **Foundations before features.** Phases 2 and 3 both need new data (records,
  per-week numbers). Today every endpoint re-downloads the CSV and copy-pastes
  the same pandas pipeline; adding features on top would mean a 4th and 5th
  copy. One shared computation first makes every later phase smaller.
- **Decide the architecture once, early.** Static JSON vs. live backend
  changes *how* Phases 2–3 get their data. Deciding later means building the
  data layer twice.
- **Mobile and plain language are built into each feature**, not a separate
  pass at the end. New views are designed phone-first from the start.
- **Pick one chart library before building new charts** (Phase 3), so new
  work doesn't add a fourth.

## Working practices

- Each phase (or a meaningful chunk of one) gets its own branch in each
  affected repo, e.g. `ux/phase-1-foundations`. Commit in small, logical
  steps; merge to `main` when it is verified. `main` is what gets deployed.
- Before each commit: `npm run lint` and `tsc --noEmit` in `stats-app/`;
  for backend changes, run the computation once against the live sheet (or
  the tests from Phase 1.4).
- Verify UI changes in the browser in **light and dark mode** and at
  **phone width**.
- Update the changelog at the bottom of this file when a phase or item lands.

---

## Phase 0: Bug fixes ✅ (done 2026-10-22)

Branch `ux/phase-0-bugfixes` in both repos (not merged yet).

- [x] Luck tab "Best Luck" tile showed the *worst* luck value.
- [x] All-vs-All tooltip "Record" was `{wins}-{100 - wins}` (nonsense like 1-99).
      Backend now sends `matrix_games`; tooltip shows the real head-to-head.
- [x] Dark mode broken: hardcoded gray text/backgrounds in cards, heatmap
      labels/borders/empty cells, scatter median lines and axis text.
- [x] Scatter quadrant colors used the *average* while the dashed lines were
      drawn at the *median*.
- [x] Backend endpoints returned HTTP 200 + `{"error": ...}` on failure.
- [x] Scatter chart created 30 new `Image` objects on every render.
- [x] Tab badges showed stale "6598h ago" from old localStorage data.
- [x] Theme toggle needed two clicks when the theme was "system".

---

## Phase 1: Foundations (small, unblocks everything else)

### 1.1 Quick follow-ups from Phase 0 testing
- [ ] Re-run `backend/snapshot_data.py`. The static snapshot is from
      2025-12-11 (last season), while the live sheet has new-season data.
- [ ] Remove `Cache-Control: max-age=300` from the Next API routes. Browsers
      currently keep data 5 more minutes on top of the other 3 cache layers.
- [ ] Fix the nivo version mismatch (`@nivo/heatmap` 0.88 vs
      `@nivo/scatterplot` 0.99, which appears unused). It causes 2 React
      errors inside `@nivo/legends` in the dev console.
- [ ] Delete dead code: `components/Auth.tsx`, `components/widgets/HeatMap.tsx`,
      and the stray root-level `app/`, `package.json`, `node_modules/`,
      `next.config.js`.
- [ ] Fix doc drift: `CLAUDE.md` says 5-minute caches; code uses 2 minutes.

### 1.2 Repository layout — ⚠️ decision needed
Today: two separate GitHub repos (`stats-app`, `stats-app-backend`) and an
unversioned root folder holding `CLAUDE.md`, `ROADMAP.md` and this plan.
- **Recommended:** one repo (merge with `git subtree` to keep history), so
  a feature that touches both sides is one branch and one PR.
- Requires updating the Render services to point at subfolders.
- Until then, this plan lives unversioned at the root.

### 1.3 Architecture — ⚠️ decision needed
Context: ~30 users, data changes roughly weekly. The current stack (FastAPI
+ 3 cache layers + request coalescing + JSON snapshots + background refresh)
exists mostly to protect Google Sheets from on-demand recompute.

- **Option A (recommended): static data.** Scheduled GitHub Action (hourly
  or daily, plus a manual "refresh now" button) → fetch the CSV → run the
  Python computation → write `league.json` → deploy the static Next.js site.
  No backend server, no 429s, no cold starts, instant loads. Data is at most
  one schedule interval old.
- **Option B: keep the FastAPI backend**, but with the consolidation below.

### 1.4 One computation, one payload (needed for either option)
- [ ] New `backend/league.py`: fetch the CSV **once**, clean column names
      (the sheet's trailing spaces currently leak into the API as
      `'Team1 '` keys everywhere in the frontend), keep `PERIOD`.
- [ ] Compute everything from that one dataframe: all-play matrix, head-to-head
      wins/games, luck, points for/against, actual W-L-T, and per-week
      numbers (score, all-play wins, result).
- [ ] Output a single `league` payload (the shape Phases 2–3 need). Keep the
      old endpoints as thin wrappers until the old widgets are retired.
- [ ] Add a few `pytest` tests on a small fixture CSV. The math is the core of
      the app and currently has no tests.

### 1.5 Frontend data layer
- [ ] One `useLeagueData()` hook plus shared types in `lib/`. This replaces the
      five copy-pasted fetch blocks. The `['strength']` query key is currently
      registered with two different fetchers.
- [ ] Remove `logger.info` calls from render paths.

---

## Phase 2: "My Team" home + standings (highest user impact)

### 2.1 Persistent team selection
- Move the team picker into the `Header` (searchable, with team logo).
- Persist in `localStorage` (`lib/layout-store.ts`) **and** sync to the URL
  (`?team=Dallas+Mavericks`) so links can be shared in the group chat.
- Remove the centered native `<select>` from `Dashboard.tsx`.
- Remove the sidebar (`components/layout/Sidebar.tsx`): it only holds
  non-functional Settings/Help buttons and takes 280px.

### 2.2 New default tab: "My Team"
Hero card for the selected team (prompt to pick one if none is selected):
- Actual record (W-L-T) and league rank.
- All-play record, e.g. "152–80 (.653), 7th".
- Luck in plain language: "+2.3 wins luckier than expected", with a
  lucky/unlucky color and a one-line explanation.
- Points for / against, each with league rank.
- Best and worst matchups from the all-play matrix.
- Phone-first layout: a single column of stat tiles.

### 2.3 Standings table (league view)
One sortable table replacing the 30 tall ranking cards as the default:
`Rank | Team | W-L | All-play W-L | Win % | Luck (± wins) | PF | PA`.
- Selected team's row highlighted and scrolled into view.
- On phones: sticky team column, horizontal scroll for the rest.
- Reuse `components/ui/data-table.tsx` (TanStack Table is already installed).
- Drop redundant summary tiles ("Total Teams: 30") and the doubled rank
  display (medal badge + `#rank`).

---

## Phase 3: Weekly dimension (`PERIOD`)

Biggest new-feature opportunity and the most shareable content.

- **Chart library decision first:** standardize on one library (Recharts
  or nivo; both are already installed) for all new charts.
- **Weekly recap** for the latest week (with a week picker):
  - Top and lowest score of the week.
  - "Unluckiest loss": lost, but would have beaten N teams that week.
  - "Luckiest win": won, but would have lost to N teams.
  - Biggest blowout, closest game.
- **Rank over the season**: bump chart (all-play rank by week), selected team
  highlighted, others faded.
- **Luck over the season**: cumulative luck line per team.
- **Sparklines** in the standings table (last 5 weeks all-play %).
- Header shows "Data through Week N".

---

## Phase 4: Polish the existing analysis views

- **Heatmaps on phones** (`NivoHeatMap`, `NivoScheduleHeatMap`): 160px left
  margin and 650px height make them unusable. On small screens show the
  selected team's row as a list ("vs Boston: 93%"); keep the full matrix
  from `md:` up.
- **Scatter plot:**
  - Quadrant-colored borders never render around logo points (chart.js
    ignores `pointBorderColor` for image `pointStyle`). Shade the quadrant
    backgrounds and label the corners instead.
  - Axis ticks are cluttered (`13,648.10`, step 50 across a ~10k range).
  - 30 overlapping 40px logos: smaller logos, and fade non-selected teams.
- **Plain language** in the remaining views: replace "Win Rate Strength
  0.653" and "Schedule Strength ±1.5" with records and wins. Add a collapsible
  "What does this mean?" to each view.
- Friendly error states with a "Retry" button instead of raw `HTTP 500: ...`.

## Phase 5: Cleanup

- Retire widgets that are replaced by Phases 2–3 (ranking cards, and probably
  the separate Strength and Luck tabs once the standings table covers them).
- Move remaining charts to the chosen library; remove the unused ones
  (chart.js, plus whichever of Recharts/nivo lost) and possibly framer-motion.
- Remove the legacy endpoints and the extra cache layers that are no longer
  needed (all of them under Option A).

---

## Changelog

### 2026-10-22: Phase 0 bug fixes (branch `ux/phase-0-bugfixes`)
- `ScheduleLuckWidget.tsx`: "Best Luck" uses rank 1 (was the last item, i.e.
  the worst luck).
- `backend/strength.py`: response includes `matrix_games` (head-to-head games
  per pair). The `NivoHeatMap` tooltip shows a real head-to-head W-L, falls
  back to a wins count for old snapshots, and shows "Not played yet" for
  pairs that haven't met.
- New `stats-app/lib/chart-theme.ts`: `useChartTheme()` gives theme-aware
  colors for chart.js and nivo. Used in `NivoHeatMap`,
  `NivoScheduleHeatMap` and `PointsWidget`.
- `ModernRankingCard`, `ErrorBoundary`, `BidirectionalBar`, `TeamLogo`:
  hardcoded grays replaced with theme tokens.
- `PointsWidget`: quadrants use the median (matching the dashed lines); logo
  images are cached.
- `backend/strength.py`, `schedule_strength.py`, `for_against.py`: errors
  return HTTP 500.
- `Dashboard.tsx`: removed the "Xh ago" tab badges. `layout-store.ts` now
  persists only `sidebarOpen`, which drops the stale fields from storage.
- `theme-toggle.tsx`: toggles based on `resolvedTheme`.
- Verified in the browser (light and dark) against the live sheet. Lint and
  type check pass.
