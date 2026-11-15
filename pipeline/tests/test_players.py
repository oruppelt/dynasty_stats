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
from players import (COLUMNS, by_period_code, check_scores, compute_alltime_players, compute_players, parse_roster,
                     update_cache)

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
    data = compute_players(rows, {1, 2}, {3}, top_n=3)
    assert data['meta'] == {'periods': 2, 'players': 3, 'regular_periods': [1, 2], 'playoff_periods': [3]}
    # Playoff period 3 left out of the regular-season lists
    assert [(p['player'], p['period'], p['fpts']) for p in data['best_periods']] == [('Bob', 2, 70), ('Dee', 1, 60), ('Ann', 1, 50)]
    # Bench only: injured reserve (Eve) doesn't count; equal points, earlier period first
    assert [(p['player'], p['period']) for p in data['best_bench']] == [('Cy', 1), ('Fay', 2), ('Cy', 2)]
    assert [p['player'] for p in data['leaders']] == ['Bob', 'Ann', 'Dee']
    assert data['leaders'][1] == {'player_id': 'ann', 'player': 'Ann', 'teams': ['Alpha', 'Bravo'], 'points': 95.0, 'starts': 2, 'gp': 2}


def test_teams(rows):
    alpha, bravo = compute_players(rows, {1, 2})['teams']
    assert (alpha['team'], alpha['points'], alpha['bench_points']) == ('Alpha', 150.0, 50.0)
    assert alpha['top_scorer'] == {'player_id': 'bob', 'player': 'Bob', 'points': 100.0}
    # Points for this team only: Ann's 45 for Bravo don't count for Alpha
    assert [(p['player'], p['points'], p['starts']) for p in alpha['top_players']] == [('Bob', 100.0, 2), ('Ann', 50.0, 1)]
    assert (alpha['best_period']['player'], alpha['best_period']['period']) == ('Bob', 2)
    assert (bravo['points'], bravo['bench_points'], bravo['top_scorer']['player']) == (125.0, 40.0, 'Dee')


def test_periods(rows):
    p1, p2 = compute_players(rows, {1, 2})['periods']
    assert p1['period'] == 1
    assert [p['player'] for p in p1['best']] == ['Dee', 'Ann', 'Bob']
    assert [p['player'] for p in p1['bench']] == ['Cy']
    assert {t: v['player'] for t, v in p2['team_top'].items()} == {'Alpha': 'Bob', 'Bravo': 'Ann'}


def test_playoffs(rows):
    assert compute_players(rows, {1, 2})['playoffs'] is None
    playoffs = compute_players(rows, {1, 2}, {3})['playoffs']
    assert [(p['player'], p['fpts']) for p in playoffs['best_periods']] == [('Bob', 500)]
    assert [(p['player'], p['points']) for p in playoffs['leaders']] == [('Bob', 500.0)]


def test_alltime(rows):
    # The same season twice: every total doubles, and a period appears once per season
    data = compute_alltime_players([('2024-25', rows, {1, 2}, {3}), ('2025-26', rows, {1, 2}, {3})], top_n=3)
    assert data['meta'] == {'seasons': ['2024-25', '2025-26']}
    assert [(p['season'], p['player'], p['fpts']) for p in data['best_periods']] == [
        ('2024-25', 'Bob', 70), ('2025-26', 'Bob', 70), ('2024-25', 'Dee', 60)]
    assert data['career'][0] == {'player_id': 'bob', 'player': 'Bob', 'teams': ['Alpha'], 'points': 200.0,
                                 'starts': 4, 'gp': 6, 'seasons': 2}
    assert [(p['season'], p['player'], p['points']) for p in data['best_seasons']] == [
        ('2024-25', 'Bob', 100.0), ('2025-26', 'Bob', 100.0), ('2024-25', 'Ann', 95.0)]
    # A franchise counts only the points scored for it
    assert [(p['player'], p['points'], p['seasons']) for p in data['franchises']['Alpha']] == [('Bob', 200.0, 2), ('Ann', 100.0, 2)]
    assert [(p['player'], p['points']) for p in data['playoffs']['career']] == [('Bob', 1000.0)]
    # With playoffs: Bob's playoff periods (500 each season) count too
    both = data['with_playoffs']
    assert [(p['season'], p['player'], p['fpts']) for p in both['best_periods']][:2] == [('2024-25', 'Bob', 500), ('2025-26', 'Bob', 500)]
    assert (both['career'][0]['player'], both['career'][0]['points'], both['career'][0]['starts']) == ('Bob', 1200.0, 6)
    assert [(p['player'], p['points']) for p in both['franchises']['Alpha']][0] == ('Bob', 1200.0)
    assert both['best_seasons'][0]['points'] == 600.0


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
