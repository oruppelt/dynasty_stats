# League rules and format

How the league works. The pipeline and the site rely on these rules. Items
marked *(to confirm)* were inferred from the Fantrax schedule, not stated by
the commissioner.

## Basics
- 30 teams, one per NBA franchise name (Fantrax league "Ligue des
  telegramistes"). Each Fantrax season is a new league with a new ID; the
  IDs are in `pipeline/seasons.json`.
- Head-to-head points league. Fantrax also lists six divisions, but they
  don't affect the schedule or seeding *(to confirm)*.
- A **scoring period** is half a week: Mon–Thu and Fri–Sun. Around the
  All-Star break a period can be longer (2025-26 period 33 lasted 11 days).
- A tied game counts as half a win and half a loss. Fantrax shows it as
  W-L-T, e.g. `21-11-1`.

## Earlier seasons
Always 30 teams, with the same franchise names. Settings per season are in
`pipeline/seasons.json`; the format changed over the years:
- **2019-20:** the COVID season. 34 regular-season periods in Fantrax
  (period 34, during the NBA's pause, has no games); the playoffs didn't
  follow the usual format (`"playoffs": "other"`).
- A season marked `"playoffs": "other"` lists its playoff games period by
  period (`playoff_games`) instead of the Swiss board and bracket.
- **2020-21:** a shorter season that started in December: 30 regular-season
  periods. Playoffs before the Swiss stage (`"playoffs": "other"`). In
  period 22 Fantrax recorded 0 for every team; a period where nobody scored
  is left out (`fantrax.games_from_fantrax`).
- **2021-22:** the first season with the Swiss stage.
- **2022-23 and 2023-24:** the Swiss stage worked differently (four rounds
  of 8 games, then 6; *to check* from their games). Marked
  `"playoffs": "other"` for now: their playoff games are listed, not drawn.
- **2023-24:** the regular season ended after period 32. Fantrax still
  counts period 33 as regular season, but it held the first Swiss round, so
  `"regular_periods": 32` moves it to the playoffs.
  Its Fantrax scores include commissioner adjustments; the pipeline uses the
  adjusted total, the score that decided each game.
- **2026-27:** the scoring settings changed slightly, so raw scores aren't
  fully comparable with earlier seasons.
- Some early seasons have games where Fantrax recorded a score of 0.

## Regular season: 33 periods
- **Periods 1–29: round robin.** Every team plays every other team once.
  This schedule is set before the season starts.
- **Periods 30–33: Swiss-style.** Each team plays a current neighbor in the
  standings. These matchups are set one period at a time, so they aren't
  known in advance.
- The top 16 teams in the regular season reach the playoffs. The final
  standings (win rate, then points for) set the seeds. In 2025-26 this
  matched Fantrax's own ranking exactly.

## Playoffs, round 1: Swiss stage (16 teams, up to 5 periods)
- The top 16 of the regular season, seeded by their final rank.
- **3 wins:** through to the knockout. **3 losses:** out. That leaves 8
  teams for the knockout.
- Pairings, one game per period:
  - **Round 1:** seed 1 vs 16, 2 vs 15, ..., 8 vs 9.
  - **Later rounds:** teams with the same record play each other. Within
    each record group, the best seed plays the worst seed.
- In 2025-26: periods 34–38, with 8, 8, 8, 6 and 3 games.
- How a tied game counts *(to confirm)*. The pipeline counts it as neither a
  win nor a loss.

## Playoffs, round 2: knockout (8 teams)
- **Bracket:** rank the 8 qualifiers by their regular-season seed (the
  Swiss record doesn't matter), then play 1v8, 2v7, 3v6 and 4v5.
- **Semifinals:** the winner of 1v8 plays the winner of 4v5, and the winner
  of 2v7 plays the winner of 3v6. Then the final.
- **Every round is a best-of-3 series of periods.** A third period is played
  only when the series is 1–1.
- 2025-26:
  - Quarterfinals: periods 39–41. Miami beat the Knicks and New Orleans
    beat Indiana, both 2–1.
  - Semifinals: periods 42–43.
  - Final: periods 44–45, Miami beat Oklahoma City 2–0.
  - **Champion: Miami Heat** (seed 3).
- How a tied game in a series counts *(to confirm)*. The pipeline counts it
  as neither a win nor a loss.

## In the data
- Our stats (all-play, luck, records) cover the **regular season only**,
  periods 1–33. Playoff games go to the `playoffs` block of `league.json`
  (`pipeline/playoffs.py`). In Fantrax they're in the PLAYOFFS view:
  "Playoffs - Round N" is period 33 + N.
- Fantrax's own playoff setting (`numPlayoffTeams: 4`, first playoff period
  34) doesn't describe the real format. Use the matchups, not that setting.
