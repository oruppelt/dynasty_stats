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
- **`stats-app/`**: Next.js 16 static export (TypeScript, Tailwind 4, React Query,
  nivo). Reads `/data/seasons.json` and `/data/seasons/<season>.json` at runtime.
- **`.github/workflows/`**: `refresh-data.yml` (hourly: build data, commit if
  changed, which makes Render redeploy) and `ci.yml` (pytest + lint + build on
  PRs and main).

Deployment and one-time setup: see `DEPLOYMENT.md`.
Product/UX roadmap and changelog: see `UX_PLAN.md` (keep its changelog updated).
What's next (the Fantrax migration, new features): see `ROADMAP.md`.
League format (regular season, Swiss stage, knockout): see `LEAGUE.md`.

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
`pipeline/seasons.json` lists the seasons (Fantrax league IDs) and the
default one. For each season not marked `final`, `pipeline/fantrax.py` reads
the games from Fantrax (scores need the `FANTRAX_COOKIE` secret) →
`compute_league()` → `build_data.py` writes
`stats-app/public/data/seasons/<season>.json`, plus `data/seasons.json` (the
seasons with data, and the default). See `DEPLOYMENT.md` and `ROADMAP.md`.
`load_games()` reads the old Google Sheet format (`--source`, and the tests).
A season file is only rewritten (and `meta.updated_at` only moves) when the
data changes, so the hourly workflow commits only real updates. A source with
no played games leaves the data in place.

A season file: `meta` (with `season`), `teams` (season totals: W-L, all-play W-L, points,
luck), `results` (one row per team per scoring period, with `luck_to_date`:
the team's luck through that period, from the games played so far), and
`matchups`: the team list and five team-vs-team matrices (`all_play`, `wins`,
`games`, `luck`, `schedule_swap`: wins with another team's schedule).
`form` (`pipeline/form.py`): recent top finishes and elite score per team.
`records` (`pipeline/records.py`): the record book's top-5 lists.
`data/alltime.json` (`pipeline/alltime.py`, rebuilt from the season files
on every run): titles, playoff finishes, career totals by rate, career
head-to-head and all-time records.
`playoffs` (`pipeline/playoffs.py`): Swiss stage, knockout, champion.
`schedule` (`fantrax.schedule_from_fantrax`, null for sheet data): period
dates and the regular-season games still to play (`lib/schedule.ts`).
The site reads it through `useLeagueData()` in `lib/league-data.ts` (one
request, shared types); components never fetch on their own. The season on
screen is `lib/selected-season.ts` (`?season=`, else the default).

### Metrics (`pipeline/league_data.py`)
- **All-play strength**: in each scoring period (`Match` column; two per
  week, Mon–Thu and Fri–Sun; `PERIOD` is the same as text), a team's score is
  compared with every other team's score that period. Win rate per opponent
  (`matchups.all_play`); the season record is in `teams`.
- **Schedule luck**: actual head-to-head wins minus all-play expected wins
  (all-play win rate x games played against that opponent, so rematches
  count twice). Units are wins; it sums to zero across the league.
  Per opponent in `matchups.luck`, totals in `teams`.
- **Head-to-head**: `matchups.wins` and `matchups.games`.
- In every matrix, `null` means never played (or the team itself). Don't use
  a number as a gap marker: -1 is a real luck value.
- **Points for/against**: totals per team (medians are worked out on the site).
- **Records**: a tie counts as half a win and half a loss, in both the actual
  and the all-play W-L.

`load_games()` renames the sheet's columns by position (its headers have
trailing spaces, e.g. `'Team1 '`) and strips team names. Matrix rows in the
JSON name their team under `Team`; every other key is a team name.

### Frontend
- `app/page.tsx` → `components/layout/Header.tsx` (team picker) and
  `components/Dashboard.tsx` (six sections: My Team, Recap, Standings (Table,
  Form, Playoffs), Season (Rank & luck, Points, Records), Matchups (Rivalry,
  All vs All, Luck, What if), History (Champions, Franchises, Head to head,
  Records)) → `components/widgets/*`, each reading `useLeagueData()`, or
  for History (every season, not the picked one) `useAllTime()` in
  `lib/alltime.ts`. Add a view to a section in `SECTIONS` rather than a new
  top-level tab.
- Charts are nivo only. Both heatmaps go through `MatrixHeatmap` (stepped
  orange-blue scale from `useChartTheme().diverging`, legend, phone list
  view); axes use 3-letter codes from `lib/teams.ts`. Views share
  `ErrorState` and `Explainer` ("What does this mean?").
- `lib/selected-team.ts`: the viewer's team (zustand), kept in localStorage
  and the `?team=` URL parameter (`lib/url.ts`; the recap's `?period=` works
  the same way). `lib/standings.ts`: ranks and number
  formatting (records, luck, points) shared by the views. `lib/season.ts`:
  results by period, standings after each period, a period's recap.
- Season charts go through `SeasonLines` (nivo line: every team faded, the
  viewer's and the hovered team drawn on top).
- Tailwind 4 has no config file: theme colors (`--color-*`, from the HSL
  variables for light and `.dark`) live in `app/globals.css` under `@theme`.
  It scans every file in the project, so helpers in `lib/` may return class names.
- Lint is plain `eslint` with `eslint.config.mjs` (`next lint` is gone in Next 16).
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
