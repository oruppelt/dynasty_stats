# Roadmap

Plans after the UX overhaul (`UX_PLAN.md`, finished 2026-10-23). League rules
are in `LEAGUE.md`.

1. **Move the data source from the Google Sheet to Fantrax.** This is the
   big project and the next one.
2. **New features.** Some work with today's data; others need the Fantrax
   data (schedule, playoffs, past seasons, rosters).
3. **Player lineage.** The long-term goal: every pick and player followed
   through the league's history (section 3).

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
  `compute_league()` stays as it is. Only periods whose last game day is over count (`fantrax.played_from`), which avoids
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
- Done 2026-10-23: the History section (champions, franchises, career
  head-to-head, all-time records) from `data/alltime.json`.
- Match teams across seasons by franchise name. Fantrax team IDs change
  with each new league (to check).
- Files: `data/seasons/<season>.json` plus `data/seasons.json` (done with
  the season switch); older seasons are new entries in `pipeline/seasons.json`.

**M5. Switch over**, ready 2026-10-23
- Done: the scheduled workflow reads Fantrax (the secret `FANTRAX_COOKIE`)
  for the seasons in `pipeline/seasons.json`. Setup is in `DEPLOYMENT.md`.
- Done 2026-10-25: the site opens on the newest season with 4+ periods
  played, so 2026-27 becomes the default by itself.

**Open questions**
- Earlier seasons' league IDs: these come when we design the history (M4),
  kept in one file such as `pipeline/seasons.json`.
- The tiebreakers marked *to confirm* in `LEAGUE.md`.

---

## 2. Features

### With today's data (no migration needed)
- [x] **Schedule swap ("what if")** (2026-10-23, Matchups → What if).
- [x] **Rivalry view** (2026-10-23, Matchups → Rivalry).
- [x] **Record book** (2026-10-23, Season → Records; all seasons in
  History → Records).
- **Form and consistency.** The average over the last 4–6 periods against
  the season average, and how much a team's score varies. One or two
  Standings columns plus a line on My Team.

- **Head-to-head history in coming matchups** (from `data/alltime.json`):
  - My Team "Up next": the all-time record against each coming opponent,
    the last meeting, any playoff meetings, and the current streak in the
    series ("Charlotte has won the last 4").
  - Recap: a preview of the next period, with a line per game that has a
    story (a long streak, a playoff rematch, last season's final, a
    lopsided or very even series).
- **More from the career head-to-head:** each team's nemesis (worst
  record against) and favorite opponent; the most lopsided and the most
  even pairings (with enough games); the longest winning streak over one
  team; playoff rematches; the closest and biggest games between two teams.

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

### Players section (started 2026-11-15)
A top-level **Players** section with the season's player views; the
player data is in `pipeline/players.py` (see "What Fantrax gives us for
players" below).
- Data: `pipeline/data/players/<season>.csv`, one row per player, team and
  period (status, slot, points, games, minutes, salary, contract), every
  season from 2019-20, regular season and playoffs. Finished seasons are
  fetched once; a season in progress fetches its new periods and the
  latest two again. `data/players/<season>.json` has the site's lists.
- Done: **Leaders** (season points for a fantasy team, starts, games,
  per game), **Best periods** (the biggest single-period scores, in the
  lineup and left on the bench), **Teams** (lineup and bench points, bench
  share, top scorer and their share).
- Done: **All-time** (franchise scorers, career leaders, best seasons,
  best periods ever in the lineup, on the bench and in the playoffs, playoff
  career leaders; `data/players/alltime.json`), **playoff** leaders and
  periods in Leaders and Best periods, **Your players** on My Team (top
  scorers, best period, the latest period's top scorer, bench) and
  **Players of the period** in the Recap.
- Done since: a **player page** (Players → Player: each season's team,
  points, starts, playoffs, bench, salary and contract; best periods),
  longest-serving, journeymen, best value, share of team points, and
  roster continuity ("Kept" in Teams).
- Next:
  - Done: the player page's **career path** (lineage, section 3), with
    draft picks as assets, trade results and trade trees. Next: a pick
    page and a trade page of their own, and the lineage of a team's
    current roster ("how this team was built").
  - Note, not planned: franchises are matched by team name. In 2025-26 the
    Lakers and Clippers swapped rosters (each kept none of its own players).
    The commissioner told them beforehand that a mapping wouldn't be a
    priority, so their stats stay as they are (by name).
  - The Recap's PDF doesn't have the players yet.
  - Lower priority: points left on the bench as lost games (the best
    possible lineup, which needs each player's eligible positions per
    period and the slot rules, against the one used).

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
  team's scoring, using the real format. One week says little about a
  team, so early in a season the model leans on last season's all-play
  strength and the roster (a prior), and shifts to this season's scores as
  they come in; or the odds only appear after ~8 periods. Either way it
  says how sure it is. The format:
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
- **Past seasons.** Done 2026-10-23: the History section.
- **What Fantrax gives us for players** (checked 2026-10-23, with the
  cookie 2026-11-15, every season from 2019-20 on):
  - **Public, no login:**
    - `fxea/general/getTeamRosters?leagueId=&period=`: every team's roster
      for any period, with each player's slot (active, reserve, minors),
      contract (e.g. R23, REG1) and salary.
    - `getPlayerIds?sport=NBA`: every current NBA player by Fantrax ID
      (name, team, position). The ID (`scorerId`, e.g. Zion `051oh`) is the
      same in every league and season, so players need no matching by name.
      Retired players are missing from this list, but trade, draft and
      roster rows carry their names.
    - `getDraftResults?leagueId=`: that league's draft (held on Fantrax
      every year, 2019 to 2026, 60 picks): round, pick, the team that made
      it, the player, the time, and `draftOrder` (the round-1 order, i.e. the
      result of the offline lottery).
    - `getDraftPicks?leagueId=`: the next two years' picks (120), each
      with its original and current owner.
  - **Private (`fxpa/req`, with the cookie):**
    - **Points per player per period:** `getTeamRosterInfo` (teamId,
      period, `view: STATS`, `statsType: 2`, `scoringCategoryType: 5`,
      `seasonOrProjection: SEASON_<code>_BY_PERIOD`). Checked: Boston,
      2025-26 period 5, active players add up to 325.0, the team's score;
      OKC, 2023-24 period 10, 399.5, also exact. Without `BY_PERIOD` it
      gives season-to-date totals; `statsType 1` counts everyone on the
      roster (bench too), `2` only what counted for the team. Each response
      lists the season's codes (`displayedLists.seasonOrProjections`;
      2025-26 is `41l`, 2023-24 `41h`). Also: GP, minutes and the box score,
      age, salary, contract.
    - **Trades:** `getTransactionDetailsHistory` (`view: TRADE`,
      `maxResultsPerPage`). One row per item, grouped into a trade by
      `txSetId`: from team, to team, date, period. An item is a player
      (`scorer.scorerId`), a draft pick (`draftPickDisplayParts`: year,
      round and original team, e.g. "2026 Round 2 (Minnesota
      Timberwolves)") or budget money (`budgetAmountTradeObj`). Trades per
      season: 70, 55, 96, 109, 77, 69, 60 (2019-20 to 2025-26), 23 so far
      in 2026-27.
    - **Claims and drops:** the same call with `view: CLAIM_DROP`: player,
      team, claim or drop, bid, date, period. About 500 a season; more than
      one page, so it needs paging.
    - The `LINEUP_CHANGE` view exists too (not needed).
  - Cost: points need one request per team per period, about 1,400 a
    season and 11,000 for all eight. Fetch finished periods once and keep
    them (finished seasons never change).
- **Player records, once we have players and their points:**
  - Most points ever by one player in a period, in a season, and for one
    franchise (career); the best single-period lineup.
  - Each franchise's all-time leading scorers, and its longest-serving
    players (most matchups started).
  - Most matchups played, most franchises played for (journeymen), most
    traded players.
  - Trade results: points each side got after the trade.
  - Points per salary dollar, best contracts, rookie contracts that paid
    off (a dynasty league with salaries and contract types).
  - Roster continuity: how much of a team's lineup is the same as last
    season.
- **Rosters (Fantrax roster data, scores need the login):**
  - Points left on the bench: the best possible lineup against the lineup
    actually used.
  - Each player's share of a team's points.
  - Season MVPs.
  - Trades and other transactions.

---

## 3. The long-term goal: player lineage

Follow every asset through the league's whole history: a pick from the
moment it exists, through every trade, to the player it became, and then
that player's seasons (team, contract, salary, points, slot) and every
trade, claim and drop until he leaves the league. For example:

> Philadelphia's 2025 1st → Memphis (2023-24, period 26) → New York
> (period 27) → pick 1.02 in the 2025 draft → Dylan Harper → his
> seasons and points for New York, and where he went next.

Both directions: "what became of this pick" and "how did this team get
this player". The "trade tree" of a deal: everything each side got, and
what that was later turned into. Points each side got after the trade.

### Is it possible? Mostly yes (checked 2026-11-15)
The example above is real: it came from the trade logs of 2023-24 and
2024-25 and the 2025 draft results. What Fantrax has (see "What Fantrax
gives us for players" above):

| Link in the chain | Source | Status |
|---|---|---|
| Pick moves between teams | Trade log: year, round, original team, from, to, date | Yes, every season from 2019-20 |
| Pick → draft slot (round 1) | `draftOrder` (the lottery result) + the original team | Yes |
| Pick → draft slot (round 2) | The previous season's final standings (the lottery only changes round 1) | Yes, from the standings |
| Slot → player | Draft results | Yes, 2019 to 2026 (two picks in 2020, one in 2022 and 2023 have no player) |
| Player moves | Trade log (players), claims and drops | Yes, with dates and periods |
| Player's team, slot, contract, salary per period | Rosters | Yes |
| Player's points per period, per team | Roster stats (`BY_PERIOD`) | Yes, matches the scores |
| Same player across seasons | Fantrax ID | Yes, the same in every league |
| Same team across seasons | Team name (IDs change with each league) | Yes, as in History |

### What's missing, and what the league told us (2026-11-15)
- **The lottery:** an offline draw; Fantrax has only its result (the
  round-1 order). The details aren't needed.
- **Round 2** follows the previous season's final standings (the lottery
  only changes round 1; to confirm against the drafts).
- **Before 2019-20:** not needed.
- **Contracts:** every off-season the league runs free agency in a Google
  Sheet (a slow auction: a player signs after a day without a new bid, with
  some house rules). So a change in a player's contract or salary between
  seasons comes from free agency. The commissioner has the results in a
  file; they could be added, or the change just labelled "free agency".
- **Off-season trades** are in the new season's log: trades open close to
  the draft, and the draft starts the new league season.
- **Trades that were later undone, or picks that were forfeited**: the log
  has `deleted` and `resultCode`; to check how they show up.

### What the transaction data showed (2026-11-15)
Fetched for every season into `pipeline/data/transactions/` (CSV; see
`pipeline/analysis/fetch_transactions.py`, nothing in the build reads it
yet): 2,228 trade items (players, picks, budget), 4,136 claims and drops,
8 drafts of 60 picks, the round-1 orders and each league's future picks.
`pipeline/analysis/check_transactions.py` replays them on the cached
rosters:
- **Within a season, every roster change is explained** (2019-20 and
  2021-22 to 2026-27). 2020-21: 9 trades show on the rosters a period after
  the log's period, so the lineage takes *when* from the rosters and *how*
  from the logs (an event within a period of the change).
- **Across seasons, every period-1 roster is explained** by the end of the
  previous season, that league's late moves, the new league's moves and
  the draft (one exception below).
- **Free agency:** every off-season, 200–250 players are dropped (contracts
  ending) and the auction's results come back as claims entered in a short
  window (e.g. 2024: Jul 31–Aug 8). Per year 25–44 are re-signed by the
  team that dropped them, almost always on a new contract; 100–120 sign
  elsewhere; 60–90 aren't signed. 0–2 a year are re-signed after the
  season starts. So for the lineage, an off-season drop and a later claim
  by the same team is "re-signed in free agency", not leaving the team.
  Players kept without a drop just count down their contract (REG3→REG2,
  R13→R12) with the same salary (2022-23: salaries were rounded, e.g.
  4,732,032 → 4,732,000; 2021-22: 20 REG2 players became R11/R21).
- **Same-minute fixes:** a signing entered on the wrong team is fixed in
  the same minute (claim by team A, claim by B, drop by A). Moves in the
  same minute follow Fantrax's own row order (the log is newest first),
  trades first; a drop of a player not on that team has no effect.
- **Chains inside one period:** a player traded twice, or traded and
  dropped right away by the receiving team (a salary dump), between two
  roster snapshots: a stint of zero periods.
- **A trade item "to (Drop)"** is a drop as part of a trade (1 case).
- **Lakers/Clippers 2025-26:** the log uses team names at the time of the
  move; the two owners swapped names on 2025-06-27 (before: each team's
  own players; after: the other name). The "trade" of 2025-10-19 with 22
  players and 9 picks lists the old rosters and changes nothing (several
  of its players and picks were long gone). Not mapped (see above).
- **Duplicate Fantrax players:** Leonard Miller has two IDs; Toronto
  drafted one (06cd8), the Clippers the other (06cei), and a commissioner
  trade swapped them, so the real one (06cei) ended in Toronto. Justin
  Jackson also has two IDs.
- **Arrivals not in the log:** 1–13 players a summer (mostly 2020 and
  2022) are dropped by a team the log never shows them joining (no effect
  on rosters; the lineage shows "joined, not in the log").
- **Picks:** traded by original owner ("2026 Round 2 (Minnesota)") until
  the order is set, then by slot ("Round 1 Pick 16"). Round 1 follows the
  draft's `draftOrder` (26–30 of 30 slots from 2021); round 2 follows the
  previous season's standings, worst first (25–29 of 30 from 2023). Still
  to check: the 2020 draft (neither fits) and the few slots per year that
  don't (picks traded during the draft, or "final standings" meaning the
  playoff finish). Budget ($) is traded too (111 items).

### Steps
1. **Raw data, cached:** for each season, the draft, the trade and
   claim/drop logs (paged), and the rosters with points per team and
   period. Finished seasons are fetched once and kept in the repo or a
   cache, not re-read on every run. *Done for the logs and drafts
   (`pipeline/data/transactions/`); the rosters are the player cache.*
2. **An asset table:** one row per pick (year, round, original team) and
   per player, and an event table (drafted, traded, claimed, dropped, with
   date, period, from, to). Check it against `getDraftPicks` (current
   owners) and the rosters (a player is on the team the events say).
   *Done for players (2026-11-15): `pipeline/lineage.py` replays each
   player's moves on the rosters (the rules of `check_transactions.py`)
   into a timeline on his page: drafted, signed, re-signed (the team that
   dropped him), traded (the whole trade attached), dropped, and the
   Lakers/Clippers name swap as a marker. Every roster is explained
   except the 184 players already on a roster in 2019-20 period 1
   ("joined"). Each arrival has the contract he played on and his
   regular-season periods, starts and points there.*
   *Done for picks (2026-11-15): `lineage.compute_picks` replays every
   pick trade to draft day and matches each team's picks to the slots it
   drafted in (round 1 by `draftOrder` when the picks follow it, else the
   previous season's standings; round 2 by the standings with the lottery
   teams worst first). 456 of 480 drafted picks are placed; a round-2 pick
   that the order only infers is "likely". 2020-21's `draftOrder` is wrong
   (no slot fits), so its picks rely on the standings.*
3. **Player seasons:** per player, season and team: periods on the
   roster, starts, points, contract and salary.
4. **On the site:** a player page (career by season and team, how he
   arrived, every move: *done*; the pick he was drafted with: *done*), the
   points each side got out of a trade and its trade tree (*done*, in the
   trade panel; `data/players/trades.json`), a pick page and a trade page of
   their own (not yet), and links from rosters and the
   record book. The player records above build on the same tables.
