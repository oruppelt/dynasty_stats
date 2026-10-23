# Roadmap

Plans after the UX overhaul (`UX_PLAN.md`, finished 2026-10-23). League rules
are in `LEAGUE.md`.

1. **Move the data source from the Google Sheet to Fantrax.** This is the
   big project and the next one.
2. **New features.** Some work with today's data; others need the Fantrax
   data (schedule, playoffs, past seasons, rosters).

---

## 1. Migration: Google Sheet → Fantrax

### What we have now
- `pipeline/league_data.py` reads a Google Sheet that the commissioner fills
  in by hand. It has one row per game and is turned into `league.json` with
  pandas.
- The sheet has only played games: no future schedule, no dates, no
  playoffs, and one season per sheet. The 2025-26 sheet stops at period 32;
  Fantrax has 33 regular periods plus playoffs.

### What `fantrax_summary_app` taught us
That project (`~/Documents/Projects/fantrax_summary_app`, never committed)
used the unofficial `fantraxapi` 1.0.1 library and patched it in three
places:

| Problem | Cause | How it was patched |
|---|---|---|
| Standings crash on `int("8.5")` | Ties give half wins and fractional games back | `site-packages/fantraxapi/objs/standings.py` edited in place (lost on reinstall). Also two runtime patches, one of which replaced the built-in `int` |
| `League()` fails on start | Period keys like `21 - Oct 23` don't match the expected `Oct 21` | `reset_info` replaced (`utils.py`) |
| Playoff results raise `KeyError: slice(1, None)` | One view returns a dict, not a list | `scoring_period_results` replaced |

Other problems:
- **Login needs Selenium:** a headless Chrome logs in with your password and
  saves the cookies.
- **Unplayed matchups show as 0–0.** A naive reader counts them as ties.

### What I checked (2026-10-23)
- **Fantrax has two APIs.**
  - **`/fxea/general/*` is public.** No login is needed.
    - `getLeagueInfo` has every matchup for all 48 periods (including the
      playoffs), the period dates, team IDs, short names and divisions, the
      scoring settings and a `leagueHistoryId` (`4iv56wzlmqj2c9qw`).
    - `getStandings` has season totals.
    - `getTeamRosters?period=N` has rosters, without points.
    - **It has no scores for each game.**
  - **`/fxpa/req` is the private API the Fantrax website uses.**
    `getStandings` with `view=SCHEDULE` returns the score of every game.
    For this league it answers `WARNING_NOT_LOGGED_IN` without a login.
- **The data agrees with the sheet.** I compared the 2025-26 Fantrax export
  (periods 1–27) with the sheet: every matchup matches. 10 games have
  slightly different scores (by 0.5 to 4.75 points); those are stat
  corrections. None of them changes who won.
- **We don't need Fantrax's standings.** The tie problem is in Fantrax's
  W-L parsing, and we work out records ourselves from the scores. A small
  client of our own for the 2–3 calls we use avoids the library and all of
  its patches.

### Plan
**M0. Get scores without a person logging in (the blocker)**

The league can't be made public (it's a custom league), and Fantrax's login
form needs a reCAPTCHA v3 token, so neither plain `requests` nor a script
can log in. What's left:
1. **A session cookie as a secret (`FANTRAX_COOKIE`).** Copy the cookie of a
   logged-in browser and refresh it by hand when it expires. A failed run
   says that the cookie expired and keeps the old data. How long the cookie
   lasts decides whether this is good enough. Works: a cookie copied on
   2026-10-23 fetched both seasons' scores. A Fantrax login lasts about a
   year, so a yearly refresh should do (to watch).
2. **Selenium in the Action.** This is what `fantrax_summary_app` did. It's
   slow, it breaks, and reCAPTCHA may block a headless browser in CI.
   Only if option 1 needs refreshing too often.

**M1. A small Fantrax client (`pipeline/fantrax.py`)**, done 2026-10-23.
Checked on the real 2025-26 response: 495 regular-season games, periods
1–33 (the sheet stops at 32), 1 tie. 15 games have small stat-correction
differences from the sheet; none changes a result.
- `league_info(league_id)` (public) and `schedule_scores(league_id)`
  (private, logged in), using `requests` only.
- Save the raw responses as test fixtures. Tests run on the fixtures, not
  on the network.
- Fantrax responses change without notice, so check their shape and fail
  with a clear message. A failed run leaves the old data in place, as the
  sheet does today.

**M2. A games table from Fantrax**
- Done 2026-10-23: the same table that `load_games()` returns, so
  `compute_league()` stays as it is. Only ended periods count, which avoids
  the false 0–0 ties. The diff against the sheet is `fantrax_fetch.py`.
- Still to do, with M3. New columns:
  - Team IDs.
  - Period start and end dates.
  - `phase`: `regular`, `swiss` or `knockout`, with rules from `LEAGUE.md`.
  - `status`: complete, current or future.

**M3. Schedule and playoffs in `league.json`**
- Done 2026-10-23: the `playoffs` block (Swiss rounds and standings,
  knockout series, champion), checked on 2025-26. Still to do: the rest of
  the list below.
- Done 2026-10-23: the `schedule` block (period dates, the last regular
  period, the games still to play) and, on the site, period dates and an
  "Up next" card on My Team. Status (played, current, upcoming) is worked
  out on the site from `latest_period` and the dates, so the file doesn't
  change just because time passes.
- Playoff games go in their own block. All-play, luck and the standings
  stay regular-season only.

**M4. Past seasons**
- Earlier seasons' league IDs: from the commissioner, listed by hand in
  `pipeline/seasons.json` (the public API doesn't list a league's history).
- Done 2026-10-23: the workflow builds one named season on demand (also a
  finished one), and a season can have a note and `"playoffs": "other"` for
  the format before the Swiss stage (`LEAGUE.md`, Earlier seasons).
- Then: all-time views (standings by rate, titles, franchise history,
  career head-to-head, the record book across seasons).
- Match teams across seasons by franchise name. Fantrax team IDs change
  with each new league (to check).
- Files: `data/seasons/<season>.json` plus `data/seasons.json` (done with
  the season switch); older seasons are new entries in `pipeline/seasons.json`.

**M5. Switch over**, ready 2026-10-23
- Done: the hourly workflow reads Fantrax (the secret `FANTRAX_COOKIE`)
  for the seasons in `pipeline/seasons.json`. Setup is in `DEPLOYMENT.md`.
- To do: set `default` to 2026-27 after its 4th period.

**Open questions**
- When to switch: after the 4th period of 2026-27 (league IDs in `LEAGUE.md`).
- Earlier seasons' league IDs: these come when we design the history (M4),
  kept in one file such as `pipeline/seasons.json`.
- The tiebreakers marked *to confirm* in `LEAGUE.md`.

---

## 2. Features

### With today's data (no migration needed)
- [x] **Schedule swap ("what if")** (2026-10-23, Matchups → What if).
- [x] **Rivalry view** (2026-10-23, Matchups → Rivalry).
- [x] **Record book** (2026-10-23, Records). Across seasons once past
  seasons are in (M4).
- **Form and consistency.** The average over the last 4–6 periods against
  the season average, and how much a team's score varies. One or two
  Standings columns plus a line on My Team.

### Next up
- [x] **Season switch** (2026-10-23): a season picker and a `?season=`
  link; seasons in `pipeline/seasons.json`, finished ones frozen.
- [x] **Team colors in the Season charts** (2026-10-23): each team's line in
  its own color, a team picker with quick picks (top 8, top 16, 17–30), and a
  logo at each line's end (as in the old `nba-fantrax/standings_path.py`).
- [x] **Form view** (2026-10-23, a Form tab), from `fantrax_summary_app/github-deployment/notebooks/playoff_strength_analyzer.ipynb`:
  how often a team has a top-7 score in a period, and an "elite score" (7
  points for the period's best score down to 1 for the 7th), both weighted
  toward recent periods (x0.9 per period back), next to the all-play record.
  Who is in form going into the playoffs.

### Needs Fantrax (after M2–M4)
- **Players: starting lineups and MVP**, from `starting_lineup_analysis.ipynb`
  in the same folder. Needs each team's roster for every period (a new
  Fantrax call, many requests per build, so finished periods get cached):
  - each team's starters per period and their points (the notebook works
    them out as differences of season totals);
  - each team's position mix, and its top scorer per period ("core",
    "regular", "one-off");
  - an MVP score: points per start, share of the team's points, "decisive
    wins" (the player's points were more than the winning margin), volume
    and team strength.
- **Playoff odds.** Simulate the rest of the season many times from each
  team's scoring, using the real format:
  - The round robin.
  - The Swiss neighbor periods, paired from the simulated standings.
  - The top 16.
  - The 3-wins / 3-losses Swiss stage.
  - The seeded knockout.

  Shows each team's chance to make the top 16, reach the knockout and win
  the title, and how those chances moved after each period.
- **Strength of the remaining schedule.** The rest of a team's round robin,
  rated by the opponents' all-play strength.
- **Swiss stage board and knockout bracket.** Done 2026-10-23 (Playoffs tab).
- **Past seasons.** Champions, all-time records and franchise history,
  career head-to-head, and the record book across seasons.
- **Rosters (Fantrax roster data, scores need the login):**
  - Points left on the bench: the best possible lineup against the lineup
    actually used.
  - Each player's share of a team's points.
  - Season MVPs.
  - Trades and other transactions.
