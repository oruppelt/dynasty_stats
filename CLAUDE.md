# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NBA fantasy league stats site used by ~30 league members. League results are
entered in a Google Sheet (easy for the commissioner to maintain); the site
shows standings-style analysis: all-play strength, schedule luck, points
for/against, head-to-head matrices.

Monorepo:
- **`pipeline/`**: Python (pandas). Reads the Google Sheet once, computes all
  datasets, writes static JSON to `stats-app/public/data/`. No server.
- **`stats-app/`**: Next.js 15 static export (TypeScript, Tailwind, React Query,
  nivo). Reads `/data/league.json` at runtime.
- **`.github/workflows/`**: `refresh-data.yml` (hourly: build data, commit if
  changed, which makes Render redeploy) and `ci.yml` (pytest + lint + build on
  PRs and main).

Deployment and one-time setup: see `DEPLOYMENT.md`.
Product/UX roadmap and changelog: see `UX_PLAN.md` (keep its changelog updated).

## Commands

```bash
# Pipeline (from repo root; venv at .venv)
.venv/bin/python pipeline/build_data.py              # live sheet → stats-app/public/data/
.venv/bin/python pipeline/build_data.py --source f.csv
(cd pipeline && ../.venv/bin/python -m pytest)

# Site
cd stats-app && npm run dev      # http://localhost:3000
cd stats-app && npm run lint
cd stats-app && npm run build    # static export to out/ (what Render serves)
```

## Architecture

### Data flow
Google Sheet (`SHEET_ID` in `pipeline/league_data.py`, or the `LEAGUE_SHEET`
env var / GitHub repository variable for a new season) → `load_games()` →
`compute_league()` → `build_data.py` writes `stats-app/public/data/league.json`.
It is only rewritten (and `meta.updated_at` only moves) when the data changes,
so the hourly workflow commits only real updates. A sheet with no played games
leaves the data in place.

`league.json`: `meta`, `teams` (season totals: W-L, all-play W-L, points,
luck), `results` (one row per team per scoring period), and the older
`strength`, `schedule_strength`, `for_against` datasets the current widgets use.
The site reads it through `useLeagueData()` in `lib/league-data.ts` (one
request, shared types); components never fetch on their own.

### Metrics (`pipeline/league_data.py`)
- **All-play strength**: in each scoring period (`Match` column; two per
  week, Mon–Thu and Fri–Sun; `PERIOD` is the same as text), a team's score is
  compared with every other team's score that period. Win rate per opponent;
  `Strength` = row mean.
- **Schedule luck**: actual head-to-head wins minus all-play expected wins
  (all-play win rate x games played against that opponent, so rematches
  count twice). Units are wins; it sums to zero across the league.
- **Head-to-head**: `matrix_wins` and `matrix_games`.
- In every matrix, `null` means never played (or the team itself). Don't use
  a number as a gap marker: -1 is a real luck value.
- **Points for/against**: totals per team plus medians.
- **Records**: a tie counts as half a win and half a loss, in both the actual
  and the all-play W-L.

`load_games()` renames the sheet's columns by position (its headers have
trailing spaces, e.g. `'Team1 '`) and strips team names. Matrix rows in the
JSON name their team under `Team`; every other key is a team name.

### Frontend
- `app/page.tsx` → `components/layout/Header.tsx` (team picker) and
  `components/Dashboard.tsx` (tabs: My Team, Standings, Points, All vs All,
  Luck) → `components/widgets/*`, each reading `useLeagueData()`.
- Charts are nivo only. Both heatmaps go through `MatrixHeatmap` (stepped
  orange-blue scale from `useChartTheme().diverging`, legend, phone list
  view); axes use 3-letter codes from `lib/teams.ts`. Views share
  `ErrorState` and `Explainer` ("What does this mean?").
- `lib/selected-team.ts`: the viewer's team (zustand), kept in localStorage
  and the `?team=` URL parameter. `lib/standings.ts`: ranks and number
  formatting (records, luck, points) shared by the views.
- Tailwind scans `lib/` too, so helpers there may return class names.
- `lib/chart-theme.ts`: `useChartTheme()`. Chart libraries can't read CSS
  variables, so charts take light/dark colors from this hook. Use it for any
  new chart; use Tailwind theme tokens (`text-foreground`, `bg-muted`, ...)
  for everything else, never hardcoded grays.
- `next.config.ts`: `output: "export"`, unoptimized images. No API routes or
  other server-only features (they break the static export).

## Conventions

- Work on a branch per piece of work (`ux/...`), make small commits, and merge
  to `main` when verified. `main` auto-deploys.
- Before committing: `npm run lint` and `npm run build` in `stats-app/`, and
  `pytest` in `pipeline/` for calculation changes.
- Check UI changes in light and dark mode and at phone width.
- Calculation changes need a test in `pipeline/tests/test_league_data.py`
  (small hand-checked league in `tests/fixtures/games.csv`).
