# UX/UI Improvement Plan

Started 2026-10-22 after a full review of `stats-app/` and `backend/`.
Replaces the old `ROADMAP.md` (deleted). Focused on what the ~30 league
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
  scoring period, how often the team's score beat every other team's score.
- **Schedule luck** (`/schedule_strength`, `matrix[].Strength`) = actual wins
  minus all-play expected wins, summed over opponents. Units are "wins".
- **Scoring periods**: two matchups per week (Mon–Thu and Fri–Sun). `Match`
  is the period number (1, 2, ...) and `PERIOD` the same as text ("Scoring
  Period 14"). A calendar week is two consecutive periods. No time dimension
  reaches the UI today.

## Why this order

- **Foundations before features.** Phases 2 and 3 both need new data (records,
  per-week numbers). Today every endpoint re-downloads the CSV and copy-pastes
  the same pandas pipeline; adding features on top would mean a 4th and 5th
  copy. One shared computation first makes every later phase smaller.
- **Decide the architecture once, early.** Static JSON vs. live backend
  changes *how* Phases 2–3 get their data. Deciding later means building the
  data layer twice. (Decided: static JSON, see 1.3.)
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
- The hourly refresh commits to `main`, so a branch that changes the JSON
  format will conflict on `stats-app/public/data/`. Resolve by re-running
  `build_data.py` on the branch after merging `main` in.

## Decisions

- **Season rollover** (2026-10-23, replaces the sheet-per-season decision):
  a new season is a new entry in `pipeline/seasons.json`; the site has a
  season picker (see the changelog).
- **Recap unit** (2026-10-22): one scoring period, labelled "Period N".
- **Ties** (2026-10-22): rare; records are W-L with a tie as half a win and
  half a loss (no T column).

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
- [x] Render build command: change `npm ci && npm run build` to
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
      dataframe but not yet in any output (`Match` is the numeric form of it).
- [x] Add actual W-L and per-period numbers (score, all-play wins, result).
      `teams` and `results` in `league.json`.
- [x] Single `league.json` payload in the shape Phases 2–3 need.
      The old datasets live inside it until their widgets are retired; the
      separate files are gone.

### 1.5 Frontend data layer
- [x] One `useLeagueData()` hook plus shared types in `lib/league-data.ts`.
      This replaces the five copy-pasted fetch blocks.
- [x] Remove `logger.info` calls from render paths. (`lib/logger.ts` deleted.)
- [x] `api-client.ts` retry/timeout/request-ID machinery is overkill for
      static files. (Deleted; React Query's retry covers it.)

---

## Phase 2: "My Team" home + standings ✅ (done 2026-10-22)

Reviewed 2026-10-22 after 1.4 landed: `league.json` now has W-L, all-play
W-L, luck and per-period results, so Phase 2 needs no pipeline work, and a
little of Phase 3 (recent periods) comes almost free.

### 2.1 Persistent team selection
- Team picker in the `Header`, with the team's logo. A native `<select>`:
  on phones it opens the system picker, and typing jumps to a team. A custom
  searchable combobox isn't worth the code for 30 teams.
- Persist in `localStorage` **and** sync to the URL
  (`?team=Dallas+Mavericks`) so links can be shared in the group chat. A
  `?team=` link wins over the stored team.
- Remove the centered `<select>` from `Dashboard.tsx`.
- Remove the sidebar (`components/layout/Sidebar.tsx`, `lib/layout-store.ts`):
  it only holds non-functional Settings/Help buttons and takes 280px.
- Header shows "Through period N" next to the update time (was Phase 3).

### 2.2 New tab: "My Team" (default when a team is selected)
- Record (W-L) and standings rank.
- All-play record, e.g. "770–158 (.830)", and its rank.
- Luck in plain language: "Won 5.9 more games than their scores earned",
  with a lucky/unlucky color.
- Points for / against, each with league rank.
- Recent periods (last 5): result, score, opponent, and how many teams the
  score would have beaten. (From Phase 3; the data is in `results`.)
- Easiest and toughest opponents from the all-play matrix.
- Phone-first: a single column, tiles in a grid from `sm:` up.
- No team selected: a grid of team logos to pick from.

### 2.3 Standings table (default when no team is selected)
`# | Team | W-L | All-play | All-play % | Luck | PF | PA`, sorted by win rate,
then points for; every column sortable.
- Selected team's row highlighted.
- On phones: sticky team column, horizontal scroll for the rest.
- Its own small table on TanStack Table: all 30 rows, no pagination or
  search (`data-table.tsx` pages by 10).

### 2.4 Retire the Strength and Luck tabs (was Phase 5)
The standings table shows both numbers (all-play % and luck) side by side
with the record, so the 30 tall ranking cards go: `TeamStrengthWidget`,
`ScheduleLuckWidget`, `ModernRankingCard`, `BidirectionalBar`,
`TeamStrengthTable`. Tabs become My Team, Standings, Points, All vs All,
Schedule.

---

## Phase 2.5: Visual pass ✅ (done 2026-10-22)

Review on 2026-10-22 (all tabs, light and dark, 390px phone width). The two
new tabs read well; the three older chart tabs are the weak spots. Doing
this before Phase 3 sets the chart style (palette, logos, team labels,
card layout, one library) that the new charts then follow. It absorbs
the old Phase 4.

### Points scatter (worst)
- [x] Axis ticks: odd values (`13,648.10`, `6,879.8`), a tick every 250,
      labels rotated. Use round ticks (every 1,000) with no rotation.
- [x] The selected team isn't visibly highlighted, and the quadrant colors
      never render (chart.js ignores borders on image points). Shade the
      quadrants, label the corners ("Scores a lot, allows little", ...),
      and fade the other teams when one is selected.
- [x] Remove the "📊 Viewing: …" panel; it only restates the picker.
- [x] Rebuild it in nivo (`@nivo/scatterplot`, logos as custom nodes).
      That leaves one chart library and drops chart.js before Phase 3.

### Heatmaps (All vs All, Schedule)
- [x] 900 two-decimal numbers in tiny cells read as noise. Show color only,
      with the value in the tooltip (or numbers only at large widths).
      Numbers stay where they fit (cells of 22px+ for %, 30px+ for luck),
      shortened to "66" / "+0.7". Smaller screens rely on seven stepped
      colors with a legend, a row/column highlight on hover, and tooltips;
      below 640px the default is a list of the selected team's opponents.
- [x] Column labels are clipped ("Minnesota Timberwolv"). Use 3-letter
      team codes (MEM, OKC) on the axes and full names in tooltips.
- [x] Highlight the selected team's row and column.
- [x] Schedule uses saturated red–green (hard for colorblind viewers, and
      it has no legend). Use a single diverging palette for both heatmaps
      (e.g. orange–white–blue), with a legend.
- [x] Dark mode: black cell labels on dark cells.
- [x] Schedule tab is mislabeled (was Phase 4): it shows luck per opponent,
      not schedule difficulty. Rename it ("Luck by opponent") and reword.
- [x] Phones (was Phase 4): the matrix is unusable at 390px. Below `md:`,
      show the selected team's row as a list ("vs BOS: 93%").

### Across the site
- [x] Team logos with dark ink (Nets, Spurs, ...) vanish in dark mode. Put
      logos on a light disc in `TeamLogo` and in charts.
- [x] Card titles in the old tabs are dashboard-speak ("Points For vs Points
      Against Analysis", "Schedule Strength Analysis"). Use plain titles and
      one-line explanations like the new tabs, with a collapsible "What does
      this mean?" (was Phase 4).
- [x] Emoji in the UI (📊, 🟢, 🔴) next to lucide icons elsewhere. Use icons
      or color only.
- [x] Content widths differ per tab (My Team `max-w-4xl`, the rest 7xl).
      Pick one reading width for text views; charts may go wider.
- [x] Every tab switch fades content in (framer-motion), so the page looks
      washed out for ~0.3s. Drop the animation (and probably the dependency).
- [x] Friendly error state with a "Retry" button instead of raw
      `HTTP 500: ...` (was Phase 4).

---

## Phase 3: Time dimension (scoring periods, `Match`) ✅ (done 2026-10-22)

Biggest new-feature opportunity and the most shareable content.

- [x] **Chart library:** nivo. Both season charts use `@nivo/line` (one
  shared `SeasonLines`); `@nivo/bump` wasn't needed.
- [x] **Recap** tab for a scoring period, "Period N", latest by default, with
  a picker (previous/next and a list):
  - Top and lowest score of the period.
  - "Unluckiest loss": lost, but would have beaten N teams that period.
  - "Luckiest win": won, but would have beaten only N teams.
  - Biggest blowout, closest game.
  - All games, the viewer's first, each score with how many teams it beat.
- [x] **Rank over the season** (Season tab): rank after each period,
  standings or all-play (toggle). Selected team highlighted, others faded,
  hover highlights any team.
- [x] **Luck over the season** (Season tab): luck to date per team. The
  pipeline computes it (`luck_to_date` in `results`) with the same formula
  as the season luck, on the games played so far, so the last point is the
  standings number.
- [x] **Last 5** in the standings table: one bar per period, height = share
  of teams the score beat, dark = won.

- [x] **Share a recap** (2026-10-22): `?period=N` opens that period's recap;
  a Share button uses the phone's share sheet or copies the link.

- [x] **Recap card on My Team** (2026-10-23): the viewer's game in the
  latest period, where its score ranked, any recap highlights it made (top
  score, closest game, ...), and a "Full recap" button that opens the Recap
  tab on that period.

---

## Phase 4: Polish the existing analysis views

Merged into Phase 2.5 (2026-10-22).

## Phase 5: Cleanup

- [x] Next.js 16, Tailwind 4 and the ESLint 9 flat config (2026-10-23).
  `npm audit` for what ships: 0. One advisory is left in lint tooling
  (`braces` under eslint-config-next, no fixed release yet).
- [x] Delete `ROADMAP.md` (pre-monorepo; described the cache layers and
  backend that no longer exist).
- [x] One `matchups` block in `league.json` replaces the older `strength`,
  `schedule_strength` and `for_against` datasets (and their duplicated
  totals and ranks).
- [x] ~~Remove the legacy endpoints and the cache layers~~ Done with the
  move to static data (Phase 1.3).

---

## Changelog

### 2026-10-23: Form tab (branch `ux/form-view`)
- `pipeline/form.py` (tests in `tests/test_form.py`): each period's score
  ranks; per team the top-7 finishes, an elite score (7 points for the best
  score down to 1 for the 7th), both weighted 0.9 per period back, and the
  all-play rate over the last 5 periods; the form rank averages the three
  ranks. From the `playoff_strength_analyzer` notebook. `form` block in each
  season file (added to the frozen 2025-26 file from its own games; the rest
  of the file rebuilt identically).
- New Form tab after Standings: the teams by form, the score rank in each of
  the last 8 periods (top 7 in blue), top-7 count, elite score with a bar,
  last-5 all-play and the standings rank to compare. Phones show the ranks
  and the elite score. The tab bar is 5 columns on phones, 9 on desktop.

### 2026-10-23: Team colors in the Season charts (branch `ux/season-team-colors`)
- "Teams in color": quick picks (top 8, top 16, 17–30, all, none) and a chip
  per team; it applies to both Season charts and doubles as their legend.
  The default is the top 8; the viewer's team is always in color.
- Lines in team colors (`teamLineColor` in `lib/nba-team-colors.ts`: one
  color per team, spread over as many hues as the brands allow, lightened on
  the dark theme or darkened on the light one), with a small logo and code at
  each line's end, spread apart so they don't overlap.
- Fixed the Clippers' entry in the team colors ("Los Angeles Clippers").

### 2026-10-23: Season switch (branch `ux/season-switch`)
- Seasons and their Fantrax league IDs in `pipeline/seasons.json`; the data
  is one file per season (`data/seasons/<season>.json`) plus a season list
  (`data/seasons.json`). Finished seasons are frozen; the hourly job builds
  the others. The `FANTRAX_LEAGUE_ID` and `LEAGUE_SHEET` variables are gone.
- Season picker in the header (only with more than one season) and a
  `?season=` link; the default season stays out of the URL. Switching resets
  each view's own picks (period, Swiss round); the team stays.
- The header says "Final" once a season has a champion.

### 2026-10-23: Playoffs tab (branches `fantrax/playoffs`, `ux/playoffs-tab`)
- `league.json` gets a `playoffs` block from Fantrax (Swiss rounds and
  standings, knockout series, champion; rules in `LEAGUE.md`).
- New Playoffs tab: the champion; the knockout bracket (series score, seeds,
  every period's score); the Swiss table (seed, a W/L chip per round with
  the opponent and score on hover, record, through or out); the Swiss games
  by round. The viewer's team is highlighted. Before the playoffs it shows
  how they work.

### 2026-10-23: Fantrax data source (branches `fantrax/client`, `fantrax/switch`)
- `pipeline/fantrax.py` reads the schedule (public API) and the scores
  (with a browser's session cookie) into the same games table as the sheet.
  Checked on the real 2025-26 and 2026-27 leagues.
- The hourly workflow uses it once `FANTRAX_LEAGUE_ID` and `FANTRAX_COOKIE`
  are set (see `DEPLOYMENT.md`); until then it reads the sheet.

### 2026-10-23: Roadmap and league rules (branch `docs/roadmap-fantrax`)
- `ROADMAP.md`: the plan to replace the Google Sheet with Fantrax data, and
  feature ideas. `LEAGUE.md`: the league format.

### 2026-10-23: Tooling upgrade (branch `ux/tooling-upgrade`)
- Next.js 15.5 → 16 (Turbopack builds), ESLint 8 → 9 with a flat config,
  Tailwind 3 → 4 (config moved into `globals.css`). React stays on 18.
- The newer React hooks lint rules led to two small fixes (no setState
  straight in an effect). Buttons keep the pointer cursor.
- Removed unused packages: `@radix-ui/react-icons`, `@shadcn/ui`,
  `tailwindcss-animate`, `autoprefixer` (built into Tailwind 4).

### 2026-10-23: Recap card on My Team (branch `ux/my-team-recap-card`)
- My Team shows the latest period under the team header: result and score,
  the score's place that period, the recap highlights the team made, and a
  "Full recap" button (opens the Recap tab with `?period=`).

### 2026-10-22: Recap links and cleanup (branch `ux/cleanup-period-link`)
- `?period=` recap links and a Share button.
- `league.json`: `matchups` (all-play, head-to-head wins and games, luck
  matrices) replaces `strength`, `schedule_strength`, `for_against`; never
  played is `null` in every matrix. ~10% smaller; tests updated.
- Loading placeholder uses fixed bar heights (random ones differed between
  server and client). `ROADMAP.md` deleted.
- Checked in the browser: a period link, picker updates the URL, leaving
  the tab clears it, heatmap tooltips and Points on the new data, phone
  width. Lint, build, 20 pytest tests pass.

### 2026-10-22: Phase 3 season views (branch `ux/phase-3-season`)
- Pipeline: `luck_to_date` per team per period (test: zero after period 1,
  equals season luck at the end, sums to zero every period).
- New tabs Recap and Season (seven tabs: two rows of four/three on phones,
  one row from `md:`). Standings get a Last 5 column.
- `@nivo/line` added (first-load JS 270 -> 286 kB).
- Checked in the browser: dark and light, desktop and 390px, hover
  tooltips, period picker, rank toggle, no-team state. Lint, build, 21
  pytest tests pass.

### 2026-10-22: Luck fix and Phase 2.5 visual pass (branch `ux/visual-review`)
- **Luck was wrong.** Expected wins were counted once per opponent, actual
  wins once per game, so the 45 rematches inflated luck: it summed to +45
  across the league. Expected wins are now win rate x games played; luck
  sums to zero (test added). Strength is now the exact all-play win %.
- Matrices use `null` for never-played pairs: -1 was a real luck value
  (Hawks-Pelicans and Pistons-Bucks showed as blank).
- Standings ordered by win rate, then points for. Phone header title
  "Fantasy Stats".
- Heatmaps: one shared component, colorblind-safe orange-blue scale with a
  legend, team codes, selected team outlined, hover crosshair, plain
  tooltips, numbers when they fit, a list view on phones. Schedule tab is
  now Luck ("Luck by opponent").
- Points scatter rebuilt on nivo: round ticks, quadrants shaded and
  captioned (top right = best), selected team highlighted. chart.js,
  react-chartjs-2 and framer-motion removed (first-load JS 336 -> 270 kB).
- Logos on white discs, explainers, Retry error state, one content width,
  no fade-in on tab switch.
- Checked in the browser: all tabs in light and dark, 390px phone width
  (list and grid), tooltips. Lint, build, 20 pytest tests pass.

### 2026-10-22: Phase 2 My Team and standings (branch `ux/phase-2-my-team`)
- Plan reviewed first: recent periods pulled in from Phase 3, the Strength
  and Luck tabs retired now instead of in Phase 5, a mislabeled Schedule
  tab noted for Phase 4, and the chart-library choice narrowed to nivo vs
  chart.js.
- Header: team picker (logo + native select), "Through period N", update
  time. The team is remembered in localStorage and put in the URL
  (`?team=...`); a shared link shows its team without replacing yours.
  Sidebar removed.
- New My Team tab: record and rank, all-play record, luck in words, points
  for/against with ranks, last 5 periods, easiest/toughest opponents; a
  grid of teams to pick from when none is selected.
- New Standings tab: sortable table with W-L, all-play, all-play %, luck,
  PF, PA; selected team highlighted; rank and team columns pinned on phones.
- Default tab is My Team with a team picked, else Standings. Tabs show
  labels on phones.
- Removed: Strength and Luck tabs, ranking cards, `data-table.tsx` and the
  other UI pieces only they used, `@radix-ui/react-progress`.
- Checked in the browser: light and dark, 390px phone width (no sideways
  page scroll), `?team=` link vs stored team. Lint and build pass.

### 2026-10-22: Phase 1.4–1.5 league.json and data hook (branch `ux/phase-1-league-data`)
- Pipeline writes one `league.json`: the three existing datasets (unchanged,
  verified against the old files), plus `teams` (actual and all-play W-L,
  points, luck) and `results` (one row per team per period). A tie counts
  half a win and half a loss. 7 new tests (17 total).
- New season: the sheet comes from the `LEAGUE_SHEET` repository variable
  (a browser link works); unset means the current sheet. A sheet with no
  played games keeps the old data; scheduled games without scores are skipped.
- Site: `useLeagueData()` in `lib/league-data.ts` with shared types, one
  request for everything. Deleted `lib/logger.ts` and `lib/api-client.ts`
  and all logging calls.
- Checked in the browser: all five tabs and the header from a single
  `league.json` request, no console errors.

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
- Docs: `Match` is the scoring period (two per week), not the matchweek.
- Merged as PR #4.

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
