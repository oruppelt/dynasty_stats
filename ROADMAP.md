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
- Add `periods` (number, dates, phase, status) and future matchups.
- Playoff games go in their own block. All-play, luck and the standings
  stay regular-season only.
- The site: show the period dates, and show "not played yet" for future
  games.

**M4. Past seasons**
- Find earlier seasons' league IDs. The Fantrax league history page has
  them, and `leagueHistoryId` may link them through the API (to check).
  Otherwise list them by hand in `pipeline/seasons.json`.
- Match teams across seasons by franchise name. Fantrax team IDs change
  with each new league (to check).
- Files: `data/seasons/<year>.json` plus a small `data/index.json`. The
  site gets a season picker; the current season stays the default.

**M5. Switch over**, ready 2026-10-23
- Done: the hourly workflow reads Fantrax once the repository variable
  `FANTRAX_LEAGUE_ID` and the secret `FANTRAX_COOKIE` are set; without the
  variable it reads the sheet as before. Setup is in `DEPLOYMENT.md`.
- To do: set both after the 4th period of 2026-27. After a season on
  Fantrax, remove the sheet reader.

**Open questions**
- When to switch: after the 4th period of 2026-27 (league IDs in `LEAGUE.md`).
- Earlier seasons' league IDs: these come when we design the history (M4),
  kept in one file such as `pipeline/seasons.json`.
- The tiebreakers marked *to confirm* in `LEAGUE.md`.

---

## 2. Features

### With today's data (no migration needed)
- **Schedule swap ("what if").** A team's record had it played another
  team's schedule. Shown as a grid, or a "pick a schedule" box on My Team.
- **Rivalry view.** Two teams: every game between them, the head-to-head
  record, the average margin, and how often each wins on scores alone.
- **Record book.** Season highs and lows, win and loss streaks, the biggest
  blowouts, the most points in a loss, and the unluckiest losses all season.
- **Form and consistency.** The average over the last 4–6 periods against
  the season average, and how much a team's score varies. One or two
  Standings columns plus a line on My Team.

### Next up
- **Season switch** (agreed 2026-10-23, after the Playoffs tab): a season
  picker and a `?season=` link. Finished seasons are fetched once and saved
  as their own file, and the hourly job refreshes only the current season.
  The real work is checking every view at both ends of a season: a finished
  one, and a new one with only a few periods.

### Needs Fantrax (after M2–M4)
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
