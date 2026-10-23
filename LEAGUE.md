# League rules and format

How the league works. The pipeline and the site rely on these rules. Items
marked *(to confirm)* were inferred from the Fantrax schedule, not stated by
the commissioner.

## Basics
- 30 teams, one per NBA franchise name (Fantrax league "Ligue des
  telegramistes", 2025-26 league ID `9p13valdm9mimg4s`). Each Fantrax season
  is a new league with a new ID.
- Head-to-head points league. Fantrax also lists six divisions, but they
  don't affect the schedule or seeding *(to confirm)*.
- A **scoring period** is half a week: Mon–Thu and Fri–Sun. Around the
  All-Star break a period can be longer (2025-26 period 33 lasted 11 days).
- A tied game counts as half a win and half a loss. Fantrax shows it as
  W-L-T, e.g. `21-11-1`.

## Regular season: 33 periods
- **Periods 1–29: round robin.** Every team plays every other team once.
  This schedule is set before the season starts.
- **Periods 30–33: Swiss-style.** Each team plays a current neighbor in the
  standings. These matchups are set one period at a time, so they aren't
  known in advance.
- The top 16 teams in the regular season reach the playoffs. The final
  regular-season standings set the knockout seeds.

## Playoffs, round 1: Swiss stage (16 teams, up to 5 periods)
- Teams with the same record play each other, one game per period.
- **3 wins:** the team goes through to the knockout round. **3 losses:** the
  team is out.
- That leaves 8 teams for the knockout. In 2025-26 the Swiss stage was
  periods 34–38, with 8, 8, 8, 6 and 3 games.
- The knockout seeds come from the regular season, not the Swiss record.
- How a tie is broken in the Swiss stage *(to confirm)*.

## Playoffs, round 2: knockout (8 teams)
- Quarterfinal, semifinal, final. Seeds are from the regular season.
- Each round looks like a **best-of-3 series of periods** *(to confirm)*. In
  2025-26:
  - Quarterfinals: periods 39–41. Two of the series needed the third period.
  - Semifinals: periods 42–43.
  - Final: periods 44–45.
- The tiebreaker inside a series *(to confirm)*.

## In the data
- Our stats (all-play, luck, records) cover the **regular season only**,
  periods 1–33. Playoff games are kept separate.
- Fantrax's own playoff setting (`numPlayoffTeams: 4`, first playoff period
  34) doesn't describe the real format. Use the matchups, not that setting.
