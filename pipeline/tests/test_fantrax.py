"""
Tests for fantrax.py on hand-made responses in Fantrax's format.

Fixtures (tests/fixtures/fantrax_*.json), 4 teams, regular season through period 3:
    Period 1: Alpha 1,000.5 - 90 Bravo, Charlie 80 - 70 Delta
    Period 2: Alpha 60 - 95.25 Charlie, Bravo 85 - 85 Delta (tie)
    Period 3: in progress (partial and 0-0 scores)
    Period 4: a playoff game, Alpha 150 - 140 Charlie, and one not set yet (TBD).
              It is in the PLAYOFFS view as "Playoffs - Round 1" (fantrax_playoffs.json).
`now` is set inside period 3 unless a test says otherwise.
"""
import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

from fantrax import (FantraxError, check_private_response, games_from_fantrax, playoff_games_from_fantrax,
                     schedule_from_fantrax)
from league_data import compute_league

FIXTURES = Path(__file__).parent / 'fixtures'
IN_PERIOD_3 = datetime(2025, 10, 29, 12, tzinfo=timezone.utc)
SEASON_OVER = datetime(2026, 1, 1, tzinfo=timezone.utc)


@pytest.fixture
def info():
    return json.loads((FIXTURES / 'fantrax_league_info.json').read_text())


@pytest.fixture
def scores():
    return json.loads((FIXTURES / 'fantrax_scores.json').read_text())


def test_played_games_only(info, scores):
    games = games_from_fantrax(info, scores, IN_PERIOD_3)
    assert list(games['Match']) == [1, 1, 2, 2]


def test_scores_and_names(info, scores):
    games = games_from_fantrax(info, scores, IN_PERIOD_3)
    first = games.iloc[0]
    assert (first['Team'], first['Score'], first['Opponent'], first['OppScore']) == ('Alpha', 1000.5, 'Bravo', 90.0)
    assert 'Charlie' in set(games['Team']) | set(games['Opponent'])  # trailing space in the name is stripped


def test_results_and_ties(info, scores):
    games = games_from_fantrax(info, scores, IN_PERIOD_3).set_index(['Match', 'Team'])
    assert games.loc[(2, 'Alpha'), 'Result'] == 'L'
    assert games.loc[(2, 'Alpha'), 'Winner'] == 'Charlie'
    tie = games.loc[(2, 'Bravo')]
    assert tie['Result'] == 'T' and tie['Winner'] is None and tie['Loser'] is None


def test_playoffs_left_out(info, scores):
    games = games_from_fantrax(info, scores, SEASON_OVER)
    assert sorted(games['Match'].unique()) == [1, 2, 3]


def test_same_league_as_the_sheet(info, scores):
    # The sheet fixture (games.csv) has the same games, with whole-number scores
    from league_data import load_games
    sheet = compute_league(load_games(FIXTURES / 'games.csv'))
    scores['tableList'][0]['rows'][0]['cells'][1]['content'] = '100'
    scores['tableList'][1]['rows'][0]['cells'][3]['content'] = '95'
    fantrax = compute_league(games_from_fantrax(info, scores, IN_PERIOD_3))
    assert fantrax == sheet


def test_schedule_dates(info, scores):
    schedule = schedule_from_fantrax(info, games_from_fantrax(info, scores, IN_PERIOD_3))
    assert schedule['regular_periods'] == 3
    assert schedule['periods'][0] == {'period': 1, 'start': '2025-10-21', 'end': '2025-10-24'}
    assert [p['period'] for p in schedule['periods']] == [1, 2, 3, 4]  # the playoff period too


def test_schedule_upcoming_games(info, scores):
    # Periods 1-2 played; period 3 (in progress) is still to play, period 4 is a playoff period
    schedule = schedule_from_fantrax(info, games_from_fantrax(info, scores, IN_PERIOD_3))
    assert schedule['upcoming'] == [
        {'period': 3, 'team': 'Alpha', 'opponent': 'Delta'},
        {'period': 3, 'team': 'Bravo', 'opponent': 'Charlie'},  # trailing space stripped
    ]


def test_schedule_after_the_season(info, scores):
    schedule = schedule_from_fantrax(info, games_from_fantrax(info, scores, SEASON_OVER))
    assert schedule['upcoming'] == []


def test_schedule_before_the_first_game(info, scores):
    games = games_from_fantrax(info, scores, datetime(2025, 10, 22, tzinfo=timezone.utc))
    assert [g['period'] for g in schedule_from_fantrax(info, games)['upcoming']] == [1, 1, 2, 2, 3, 3]


def test_schedule_in_the_league_data(info, scores):
    games = games_from_fantrax(info, scores, IN_PERIOD_3)
    schedule = schedule_from_fantrax(info, games)
    assert compute_league(games, schedule=schedule)['schedule'] == schedule
    assert compute_league(games)['schedule'] is None  # the sheet has no schedule


def test_no_played_games_gives_empty_table(info, scores):
    games = games_from_fantrax(info, scores, datetime(2025, 10, 22, tzinfo=timezone.utc))
    assert games.empty


def test_unscheduled_game_fails(info, scores):
    scores['tableList'][0]['rows'][0]['cells'][2]['teamId'] = 'c3'
    with pytest.raises(FantraxError, match='not in the league schedule'):
        games_from_fantrax(info, scores, IN_PERIOD_3)


def test_missing_game_fails(info, scores):
    del scores['tableList'][1]['rows'][1]
    with pytest.raises(FantraxError, match='Period 2: 1 scored games, but the schedule has 2'):
        games_from_fantrax(info, scores, IN_PERIOD_3)


def test_other_tables_are_skipped(info, scores):
    scores['tableList'].insert(0, {'caption': 'Standings', 'rows': []})
    assert len(games_from_fantrax(info, scores, IN_PERIOD_3)) == 4


def test_private_response_errors():
    data = {'tableList': []}
    assert check_private_response({'responses': [{'data': data}]}) == data
    with pytest.raises(FantraxError, match='FANTRAX_COOKIE'):
        check_private_response({'pageError': {'code': 'WARNING_NOT_LOGGED_IN'}, 'responses': []})
    with pytest.raises(FantraxError, match='not a member'):
        check_private_response({'pageError': {'code': 'NOT_MEMBER_OF_LEAGUE'}})
    with pytest.raises(FantraxError, match='Unexpected'):
        check_private_response({'responses': []})


def test_changed_columns_fail(info, scores):
    scores['tableList'][0]['header']['cells'].reverse()
    with pytest.raises(FantraxError, match='unexpected columns'):
        games_from_fantrax(info, scores, IN_PERIOD_3)


def test_playoff_games(info):
    playoffs = json.loads((FIXTURES / 'fantrax_playoffs.json').read_text())
    games = playoff_games_from_fantrax(info, playoffs, SEASON_OVER)
    assert games[['Team', 'Score', 'Opponent', 'OppScore', 'Match']].values.tolist() == [['Alpha', 150.0, 'Charlie', 140.0, 4]]
    assert playoff_games_from_fantrax(info, playoffs, IN_PERIOD_3).empty
