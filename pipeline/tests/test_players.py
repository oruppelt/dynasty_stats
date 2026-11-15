"""
Tests for players.py.

tests/fixtures/fantrax_roster.json is a real getTeamRosterInfo response
(trimmed): Boston, 2025-26 period 5, "NBA" stats by period. Its 8 active
players scored 325.0, Boston's score that period; the bench 15.75 (Holiday
7.75, Hall 8, two players without a game); one on injured reserve, two in the
minors, and empty slots and a totals row to leave out.
"""
import copy
import json
from pathlib import Path

import pandas as pd
import pytest

import fantrax
import players
from players import COLUMNS, by_period_code, check_scores, compute_players, parse_roster, update_cache

ROSTER = json.loads((Path(__file__).parent / 'fixtures' / 'fantrax_roster.json').read_text())


@pytest.fixture
def roster():
    return copy.deepcopy(ROSTER)


def test_parse_roster(roster):
    rows = parse_roster(roster, 5, 'Boston Celtics')
    assert len(rows) == 15
    assert [r['status'] for r in rows].count('active') == 8
    assert sum(r['fpts'] for r in rows if r['status'] == 'active') == 325.0
    assert sum(r['fpts'] for r in rows if r['status'] == 'bench') == 15.75
    assert {r['status'] for r in rows} == {'active', 'bench', 'ir', 'minors'}
    assert rows[0] == {
        'period': 5, 'team': 'Boston Celtics', 'player_id': rows[0]['player_id'], 'player': 'Jamal Shead',
        'status': 'active', 'slot': 'PG', 'fpts': 32.5, 'gp': 1, 'min': 17.1, 'salary': 1363000, 'contract': 'R12',
    }


def test_slots_only_for_the_lineup(roster):
    rows = parse_roster(roster, 5, 'Boston Celtics')
    assert [r['slot'] for r in rows if r['status'] == 'active'] == ['PG', 'SG', 'G', 'SF', 'PF', 'F', 'C', 'Flx']
    assert {r['slot'] for r in rows if r['status'] != 'active'} == {''}


def test_parse_roster_checks_the_period(roster):
    with pytest.raises(fantrax.FantraxError, match='period 6'):
        parse_roster(roster, 6, 'Boston Celtics')
    roster['displayedSelections']['displayedSeasonOrProjection']['timeframeTypeCode'] = 'YEAR_TO_DATE'
    with pytest.raises(fantrax.FantraxError):
        parse_roster(roster, 5, 'Boston Celtics')


def test_parse_roster_unknown_status(roster):
    roster['tables'][0]['rows'][0]['statusId'] = '7'
    with pytest.raises(fantrax.FantraxError, match='unknown roster status'):
        parse_roster(roster, 5, 'Boston Celtics')


def test_by_period_code(roster):
    assert by_period_code(roster) == 'SEASON_41l_BY_PERIOD'
    # A first request without a code shows the season to date
    roster['displayedSelections']['displayedSeasonOrProjection']['code'] = 'SEASON_41l_YEAR_TO_DATE'
    assert by_period_code(roster) == 'SEASON_41l_BY_PERIOD'
    roster['displayedLists']['seasonOrProjections'] = []
    with pytest.raises(fantrax.FantraxError):
        by_period_code(roster)


def _row(period, team, player, status, fpts, gp=1):
    return {'period': period, 'team': team, 'player_id': player.lower(), 'player': player, 'status': status,
            'slot': 'C' if status == 'active' else '', 'fpts': fpts, 'gp': gp, 'min': 30.0, 'salary': 1000000,
            'contract': 'REG1'}


@pytest.fixture
def rows():
    # Two teams, periods 1-2 regular season, 3 playoffs. Ann moves from Alpha to Bravo after period 1.
    return pd.DataFrame([
        _row(1, 'Alpha', 'Ann', 'active', 50), _row(1, 'Alpha', 'Bob', 'active', 30), _row(1, 'Alpha', 'Cy', 'bench', 40),
        _row(1, 'Bravo', 'Dee', 'active', 60), _row(1, 'Bravo', 'Eve', 'ir', 99),
        _row(2, 'Alpha', 'Bob', 'active', 70, gp=2), _row(2, 'Alpha', 'Cy', 'bench', 10),
        _row(2, 'Bravo', 'Ann', 'active', 45), _row(2, 'Bravo', 'Dee', 'active', 20), _row(2, 'Bravo', 'Fay', 'bench', 40),
        _row(3, 'Alpha', 'Bob', 'active', 500),
    ], columns=COLUMNS)


def test_compute_players(rows):
    data = compute_players(rows, {1, 2}, top_n=3)
    assert data['meta'] == {'periods': 2, 'players': 3}
    # Playoff period 3 left out; a tie on points (none here) would go to the earlier period
    assert [(p['player'], p['period'], p['fpts']) for p in data['best_periods']] == [('Bob', 2, 70), ('Dee', 1, 60), ('Ann', 1, 50)]
    # Bench only: injured reserve (Eve) doesn't count; equal points, earlier period first
    assert [(p['player'], p['period']) for p in data['best_bench']] == [('Cy', 1), ('Fay', 2), ('Cy', 2)]
    assert [p['player'] for p in data['leaders']] == ['Bob', 'Ann', 'Dee']
    assert data['leaders'][1] == {'player_id': 'ann', 'player': 'Ann', 'teams': ['Alpha', 'Bravo'], 'points': 95.0, 'starts': 2, 'gp': 2}
    assert data['teams'] == [
        {'team': 'Alpha', 'points': 150.0, 'bench_points': 50.0, 'top_scorer': {'player_id': 'bob', 'player': 'Bob', 'points': 100.0}},
        {'team': 'Bravo', 'points': 125.0, 'bench_points': 40.0, 'top_scorer': {'player_id': 'dee', 'player': 'Dee', 'points': 80.0}},
    ]


def test_check_scores(rows):
    games = pd.DataFrame({'Match': [1, 2], 'Team': ['Alpha', 'Alpha'], 'Score': [80.0, 70.0],
                          'Opponent': ['Bravo', 'Bravo'], 'OppScore': [60.0, 60.0]})
    assert check_scores(rows, games) == [(2, 'Bravo', 65.0, 60.0)]


class FakeFantrax:
    """Serves the fixture roster for any team and period, and counts the requests."""

    def __init__(self, monkeypatch):
        self.requests = []
        monkeypatch.setattr(fantrax, 'fetch_league_info', lambda league_id: {'teamInfo': {
            'b1': {'name': 'Boston Celtics '}, 'o1': {'name': 'Oklahoma City Thunder'}}})

    def __call__(self, league_id, cookie, team_id, period, code=None):
        self.requests.append((team_id, period, code))
        roster = copy.deepcopy(ROSTER)
        roster['displayedSelections']['displayedPeriod'] = period
        return roster


def test_update_cache(tmp_path, monkeypatch):
    fake = FakeFantrax(monkeypatch)
    played = {1: {'Boston Celtics', 'Oklahoma City Thunder'}, 2: {'Boston Celtics'}}
    rows = update_cache('s', 'L', 'cookie', played, refresh=0, cache_dir=tmp_path, fetch=fake, log=lambda _: None)
    # One request to find the season's code, then one per team and period
    assert len(fake.requests) == 4
    assert sorted(fake.requests[1:]) == [('b1', 1, 'SEASON_41l_BY_PERIOD'), ('b1', 2, 'SEASON_41l_BY_PERIOD'), ('o1', 1, 'SEASON_41l_BY_PERIOD')]
    assert len(rows) == 45
    assert (tmp_path / 's.csv').exists()
    pd.testing.assert_frame_equal(players.read_cache('s', tmp_path), rows)

    # Nothing new: no requests
    fake.requests.clear()
    update_cache('s', 'L', 'cookie', played, refresh=0, cache_dir=tmp_path, fetch=fake, log=lambda _: None)
    assert fake.requests == []

    # A new period, and the latest cached one again (stat corrections)
    played[3] = {'Oklahoma City Thunder'}
    rows = update_cache('s', 'L', 'cookie', played, refresh=1, cache_dir=tmp_path, fetch=fake, log=lambda _: None)
    assert sorted((t, p) for t, p, _ in fake.requests[1:]) == [('b1', 2), ('o1', 3)]
    assert sorted(rows['period'].unique()) == [1, 2, 3]
    assert len(rows) == 60
