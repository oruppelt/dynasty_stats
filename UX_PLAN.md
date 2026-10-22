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

- Each phase (or a meaningful chunk of one) gets its own branch, e.g.
  `ux/phase-2-my-team`. Commit in small, logical
  steps; merge to `main` when it is verified. `main` is what gets deployed.
- Before each commit: `npm run lint` and `npm run build` in `stats-app/`;
  `pytest` in `pipeline/` for calculation changes.
- Verify UI changes in the browser in **light and dark mode** and at
  **phone width**.
- Update the changelog at the bottom of this file when a phase or item lands.

---

## Phase 0: Bug fixes ✅ (done 2026-10-22)

Merged into the monorepo's `main` with the old histories.

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
- [x] ~~Re-run the snapshot~~ No longer needed: data is rebuilt hourly.
- [x] ~~Remove `Cache-Control` from the Next API routes~~ The API routes are gone.
- [x] Fix the nivo version mismatch (`@nivo/heatmap` 0.88 vs
      `@nivo/scatterplot` 0.99, which appears unused). It causes 2 React
      errors inside `@nivo/legends` in the dev console.
      Scatterplot removed, heatmap upgraded to 0.99; console is clean.
- [x] Delete dead code: `components/Auth.tsx`, `components/widgets/HeatMap.tsx`
      (also `ErrorBoundary.tsx`, `ui/empty-state.tsx` and the unused
      `recharts` package).
      (The stray root-level Next.js files stayed behind in the old folder.)
- [x] Fix doc drift in `CLAUDE.md` (rewritten for the new architecture).
- [x] Upgrade Next.js 15.0.3 to the latest 15.x and run `npm audit fix`.
      Render's build log reports 31 vulnerabilities (1 critical). Most of
      them affect a running Next.js server or dev tooling, so a static site is
      barely exposed, but they shouldn't stay.
      Now 15.5.28; audit 30 → 12. The remaining 12 are all build tooling
      and need Next 16 / Tailwind 4 / ESLint 9 (see Phase 5).
- [ ] Render build command: change `npm ci && npm run build` to
      `npm run build`. Render already installs dependencies before the build
      command, so they currently install twice (~15s wasted per deploy).

### 1.2 Repository layout ✅ (done 2026-10-22)
One repo, `oruppelt/dynasty_stats` on GitHub (local folder `dynasty-stats`), with `pipeline/` and `stats-app/`. Both old
histories were merged with `git subtree`. Setup steps are in `DEPLOYMENT.md`.

### 1.3 Architecture ✅ (done 2026-10-22): static data
An hourly GitHub Action runs `pipeline/build_data.py`, which commits
`stats-app/public/data/*.json` when the data changed. Render serves the
static export. No backend server, cache layers or rate limits.

### 1.4 One computation, one payload
- [x] `pipeline/league_data.py`: the CSV is fetched **once**, and every
      dataset is computed from that one dataframe as pure functions. Output
      is identical to the old endpoints (verified on the live sheet).
- [x] `pytest` tests on a small hand-checked fixture league.
- [x] Clean column names (trailing spaces leak into the JSON as `'Team1 '`
      keys everywhere in the frontend) and keep `PERIOD`.
      Matrix rows now use `Team`; `PERIOD` is kept as `Period` in the
      dataframe but not yet in any output.
- [ ] Add actual W-L-T and per-week numbers (score, all-play wins, result).
- [ ] Single `league.json` payload in the shape Phases 2–3 need. Keep the
      current files until the old widgets are retired.

### 1.5 Frontend data layer
- [ ] One `useLeagueData()` hook plus shared types in `lib/`. This replaces the
      five copy-pasted fetch blocks. The `['strength']` query key is currently
      registered with two different fetchers.
- [ ] Remove `logger.info` calls from render paths.
- [ ] `api-client.ts` retry/timeout/request-ID machinery is overkill for
      static files; simplify it as part of the hook.

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
- Next.js 16, Tailwind 4 and the ESLint 9 flat config (`next lint` is
  deprecated). Clears the remaining `npm audit` findings, all in build tooling.
- [x] ~~Remove the legacy endpoints and the cache layers~~ Done with the
  move to static data (Phase 1.3).

---

## Changelog

### 2026-10-22: Phase 1.1 cleanup and clean data keys (branch `ux/phase-1-cleanup`)
- Removed dead code (`Auth.tsx`, old `HeatMap.tsx`, `ErrorBoundary.tsx`,
  `ui/empty-state.tsx`) and the unused `@nivo/scatterplot` and `recharts`.
- Next.js 15.0.3 → 15.5.28, `@nivo/heatmap` 0.88 → 0.99, `npm audit fix`
  (30 findings → 12, all build tooling). Heatmap tooltips got a fixed width
  because nivo 0.99 let them shrink.
- Pipeline uses clean column names and strips team names; matrix rows in the
  JSON use `Team` instead of `'Team1 '`. Data otherwise unchanged (verified
  against the previous files). 2 new tests.
- Checked in the browser: all five tabs, heatmap tooltips, light and dark,
  phone width. No console errors.

### 2026-10-22: Points chart logos fix (branch `fix/points-chart-logos`)
- Live site: most team logos were missing from the Points scatter. chart.js
  draws an image point only if it has already loaded, and never repaints when
  it arrives later. Locally logos load instantly, so this only showed on Render.
  `PointsWidget` now re-renders as each logo loads; a logo that fails to load
  falls back to a plain dot. Reproduced and verified with a local server
  delaying logos by 1.5s.
- Team logos resized from 400px to 128px (1.1 MB → ~0.6 MB); they are shown
  at 40–48px.

### 2026-10-22: Phase 1.2–1.4 monorepo and static data (branch `ux/phase-1-static-data`)
- New repo `oruppelt/dynasty_stats` combining `stats-app` and `stats-app-backend` with
  history. The old folder `dynasty_stats/` is kept as a backup.
- `backend/` → `pipeline/`. FastAPI server, cache, logging and snapshot code
  removed. `league_data.py` holds pure calculations (identical output,
  verified on the live sheet), `build_data.py` writes the JSON, plus 8
  pytest tests.
- `stats-app`: static export (`output: "export"`), API routes removed, data
  read from `/data/*.json`, and the header shows "Updated <date>".
- GitHub Actions: `refresh-data.yml` (hourly and manual) and `ci.yml`.
- `DEPLOYMENT.md`: one-time GitHub/Render setup and day-to-day operations.
  `CLAUDE.md` rewritten; `README.md` added.

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
