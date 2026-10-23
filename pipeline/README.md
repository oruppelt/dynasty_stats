# Data pipeline

Turns the league Google Sheet into the static JSON files the site serves.
There is no server: a scheduled GitHub Action runs this and commits the
results to `stats-app/public/data/`, and Render redeploys the site.

- `league_data.py`: all the calculations (all-play strength, schedule luck,
  points for/against, head-to-head). Pure functions.
- `build_data.py`: fetches the sheet once, runs the calculations, writes
  a file per season (`seasons.json` lists them). `--source` reads a sheet or
  CSV instead of Fantrax.
- `fantrax.py`: reads a Fantrax league (schedule, regular-season and playoff
  scores) into the same games table as the sheet. See `DEPLOYMENT.md`. Scores need
  `FANTRAX_COOKIE`, the cookie of a browser logged in to Fantrax (Fantrax's
  login has a reCAPTCHA, so a script can't log in itself).
- `playoffs.py`: the playoffs block (Swiss stage, knockout series,
  champion) from the playoff games; rules in `LEAGUE.md`.
- `fantrax_fetch.py`: saves a league's raw Fantrax responses and compares
  them with the site data. For checks and test fixtures only.
- `tests/`: pytest tests on a small hand-checked league.
- `test.ipynb`: older exploration notebook (not used by the pipeline).

## Run locally (from the repo root)

```bash
python3 -m venv .venv
.venv/bin/pip install -r pipeline/requirements-dev.txt

.venv/bin/python pipeline/build_data.py   # refresh stats-app/public/data/ from the sheet
cd pipeline && ../.venv/bin/python -m pytest
```

The sheet must have these 12 columns in order:
`Team1, Score1, Team2, Score2, PERIOD, Match, Result, WINNER, LOSER, H1, H2, Color`.
`Match` is the scoring period number (two per week: Mon–Thu, Fri–Sun); rows
without it or without both scores are skipped. If the
column count changes, the build fails with a clear error (and GitHub emails
you that the workflow failed) instead of publishing broken data.
