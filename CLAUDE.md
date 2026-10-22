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
  nivo + chart.js). Reads `/data/*.json` at runtime.
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
Google Sheet (CSV export URL in `pipeline/league_data.py`) → `load_games()` →
`compute_all()` → `build_data.py` writes `strength.json`,
`schedule_strength.json`, `for_against.json` and `metadata.json`. Files are
only rewritten when their content changes, so the hourly workflow commits only
real updates. The site fetches these with React Query (`app/providers.tsx`).

### Metrics (`pipeline/league_data.py`)
- **All-play strength**: in each matchweek (`Match` column), a team's score is
  compared with every other team's score that week. Win rate per opponent;
  `Strength` = row mean.
- **Schedule luck**: actual head-to-head wins minus all-play expected wins,
  summed over opponents played. Units are wins.
- **Head-to-head**: `matrix_wins` (wins, -1 = never played) and `matrix_games`.
- **Points for/against**: totals per team plus medians.

Output keys keep the sheet's trailing-space column names (`'Team1 '`) because
the frontend depends on them; cleaning this up is planned in `UX_PLAN.md`.

### Frontend
- `app/page.tsx` → `components/Dashboard.tsx` (tabs, team filter) →
  `components/widgets/*` (one per tab; each fetches its JSON file).
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
