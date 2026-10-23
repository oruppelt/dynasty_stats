"""
Tests for playoffs.py on generated playoffs.

18 teams; team T01 has the best regular season, T18 the worst, so the seeds
are 1-18 and T17, T18 miss the playoffs. In the generated games the better
seed wins, unless the game is listed in `upsets`. The Swiss stage pairs the
best seed with the worst seed within each record group (as in 2025-26); the
knockout is 1v8, 2v7, 3v6, 4v5 of the 8 teams through, best of 3.
"""
from pathlib import Path

import pandas as pd

from league_data import compute_league, load_games
from playoffs import compute_playoffs, seeds


def team(n: int) -> str:
    return f'T{n:02d}'


TEAMS = [{'team': team(n), 'games': 33, 'wins': 34 - n, 'points_for': 10000.0} for n in range(1, 19)]


def game(period: int, home: str, away: str, winner: str) -> tuple:
    return (home, 100.0 if winner == home else 90.0, away, 100.0 if winner == away else 90.0, period)


def better(a: str, b: str, period: int, upsets: set) -> str:
    best, worst = sorted((a, b))
    return worst if (period, best) in upsets else best


def swiss_games(upsets=frozenset(), first_period=34):
    """Swiss periods until every team has 3 wins or 3 losses."""
    record = {team(n): [0, 0] for n in range(1, 17)}
    period, games = first_period, []
    while True:
        playing = [t for t, (w, l) in record.items() if w < 3 and l < 3]
        if not playing:
            return games, period
        for wins in sorted({record[t][0] for t in playing}, reverse=True):
            group = sorted(t for t in playing if record[t][0] == wins)
            for a, b in zip(group, reversed(group[len(group) // 2:])):
                winner = better(a, b, period, upsets)
                games.append(game(period, a, b, winner))
                record[winner][0] += 1
                record[b if winner == a else a][1] += 1
        period += 1


def frame(games) -> pd.DataFrame:
    return pd.DataFrame(games, columns=['Team', 'Score', 'Opponent', 'OppScore', 'Match'])


def test_seeds_by_win_rate_then_points_for():
    teams = [
        {'team': 'A', 'games': 10, 'wins': 6, 'points_for': 900.0},
        {'team': 'B', 'games': 10, 'wins': 7, 'points_for': 800.0},
        {'team': 'C', 'games': 10, 'wins': 6, 'points_for': 950.0},
        {'team': 'D', 'games': 9, 'wins': 6.5, 'points_for': 700.0},  # a tie: 6.5 / 9 = .722
    ]
    assert seeds(teams) == {'D': 1, 'B': 2, 'C': 3, 'A': 4}


def test_swiss_stage():
    games, _ = swiss_games()
    swiss = compute_playoffs(TEAMS, frame(games))['swiss']
    assert [len(r['games']) for r in swiss['rounds']] == [8, 8, 8, 6, 3]
    assert swiss['rounds'][0]['games'][0] == {'team': 'T01', 'score': 100.0, 'opponent': 'T16', 'opp_score': 90.0}
    standings = {t['team']: t for t in swiss['standings']}
    assert {t for t, s in standings.items() if s['status'] == 'through'} == {team(n) for n in range(1, 9)}
    assert (standings['T01']['wins'], standings['T01']['losses']) == (3, 0)
    assert 'T17' not in standings  # missed the playoffs


def test_knockout_and_champion():
    upsets = {(39, 'T02'), (41, 'T02'), (45, 'T01')}  # T07 beats T02 in 3 games; the final goes to 3
    games, period = swiss_games()
    assert period == 39
    for period, pairs in [(39, [(1, 8), (2, 7), (3, 6), (4, 5)]), (40, [(1, 8), (2, 7), (3, 6), (4, 5)]),
                          (41, [(2, 7)]), (42, [(1, 4), (3, 7)]), (43, [(1, 4), (3, 7)]),
                          (44, [(1, 3)]), (45, [(1, 3)]), (46, [(1, 3)])]:
        for a, b in pairs:
            games.append(game(period, team(a), team(b), better(team(a), team(b), period, upsets)))

    playoffs = compute_playoffs(TEAMS, frame(games))
    assert [r['name'] for r in playoffs['knockout']] == ['Quarterfinals', 'Semifinals', 'Final']
    upset = playoffs['knockout'][0]['series'][1]
    assert (upset['teams'], upset['wins'], upset['winner']) == (['T02', 'T07'], [1, 2], 'T07')
    assert [g['period'] for g in upset['games']] == [39, 40, 41]
    final = playoffs['knockout'][2]['series'][0]
    assert (final['seeds'], final['wins']) == ([1, 3], [2, 1])
    assert playoffs['champion'] == 'T01'


def test_playoffs_in_progress():
    games, _ = swiss_games()
    playoffs = compute_playoffs(TEAMS, frame([g for g in games if g[4] <= 35]))
    assert {t['status'] for t in playoffs['swiss']['standings']} == {'playing'}
    assert playoffs['knockout'] == [] and playoffs['champion'] is None


def test_no_playoff_games():
    assert compute_playoffs(TEAMS, frame([])) is None


def test_sheet_has_no_playoffs():
    assert compute_league(load_games(Path(__file__).parent / 'fixtures' / 'games.csv'))['playoffs'] is None
