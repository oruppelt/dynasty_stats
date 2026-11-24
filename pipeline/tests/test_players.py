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
from players import (COLUMNS, by_period_code, check_scores, compute_alltime_players, compute_player_pages, compute_players,
                     parse_roster, update_cache)

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
    assert data['meta'] == {'periods': 2, 'players': 3, 'regular_periods': [1, 2], 'playoff_periods': [3], 'season_length': 2}
    # Playoff period 3 left out of the regular-season lists
    assert [(p['player'], p['period'], p['fpts']) for p in data['best_periods']] == [('Bob', 2, 70), ('Dee', 1, 60), ('Ann', 1, 50)]
    # Bench only: injured reserve (Eve) doesn't count; equal points, earlier period first
    assert [(p['player'], p['period']) for p in data['best_bench']] == [('Cy', 1), ('Fay', 2), ('Cy', 2)]
    assert [p['player'] for p in data['leaders']] == ['Bob', 'Ann', 'Dee']
    # Salary paid: half a season with each team, $1M a season
    assert data['leaders'][1] == {'player_id': 'ann', 'player': 'Ann', 'teams': ['Alpha', 'Bravo'], 'points': 95.0, 'starts': 2, 'gp': 2,
                                  'salary': 1000000}


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
                                 'starts': 4, 'gp': 6, 'seasons': 2, 'salary': 2000000}
    # The career list has every player with a start, not just the top_n (the site sorts and filters it)
    one = compute_alltime_players([('2024-25', rows, {1, 2}, {3})], top_n=1)
    assert len(one['career']) > 1 and len(one['best_seasons']) == 1
    # A franchise's salary is what it paid: Ann was with Alpha for half of each season
    assert [(p['player'], p['salary']) for p in data['franchises']['Alpha']] == [('Bob', 2000000), ('Ann', 1000000)]
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


def test_alltime_more_records(rows, monkeypatch):
    monkeypatch.setattr(players, 'VALUE_MIN_STARTS', 1)
    data = compute_alltime_players([('2024-25', rows, {1, 2}, {3}), ('2025-26', rows, {1, 2}, {3})], top_n=3)
    # Starts for one franchise, regular season only (Bob's playoff start doesn't count)
    assert [(p['player'], p['team'], p['starts'], p['points']) for p in data['longest_serving']] == [
        ('Bob', 'Alpha', 4, 200.0), ('Dee', 'Bravo', 4, 160.0), ('Ann', 'Alpha', 2, 100.0)]
    assert data['longest_serving'][0]['seasons'] == 2 and data['longest_serving'][0]['first'] == '2024-25'
    assert [p['player'] for p in data['franchise_starts']['Bravo']] == ['Dee', 'Ann']
    assert [(p['player'], p['teams']) for p in data['journeymen']] == [('Ann', ['Alpha', 'Bravo'])]
    # Salary 1,000,000 everywhere: points per $1M are the season's points
    assert [(p['player'], p['per_million']) for p in data['best_value']] == [('Bob', 100.0), ('Bob', 100.0), ('Ann', 95.0)]
    assert [(p['player'], p['team'], p['share']) for p in data['team_share']] == [
        ('Bob', 'Alpha', 0.6667), ('Bob', 'Alpha', 0.6667), ('Dee', 'Bravo', 0.64)]
    # Alpha kept Bob (100 of 150); Ann's 50 for Alpha don't count, she ended 2024-25 on Bravo
    assert data['continuity'] == {'2025-26': {'Alpha': 0.6667, 'Bravo': 1.0}}


def test_value_and_share_need_starts(rows):
    data = compute_alltime_players([('2024-25', rows, {1, 2}, {3})])
    assert data['best_value'] == [] and data['team_share'] == []


def test_player_pages(rows):
    index, pages = compute_player_pages([('2024-25', rows, {1, 2}, {3}), ('2025-26', rows, {1, 2}, {3})])
    assert [p['player'] for p in index] == ['Bob', 'Ann', 'Dee', 'Cy', 'Eve', 'Fay']
    assert index[1] == {'player_id': 'ann', 'player': 'Ann', 'team': 'Bravo', 'season': '2025-26', 'points': 190.0}
    ann = pages['ann']['seasons']
    assert [(s['season'], s['team'], s['starts'], s['points']) for s in ann] == [
        ('2024-25', 'Alpha', 1, 50.0), ('2024-25', 'Bravo', 1, 45.0), ('2025-26', 'Alpha', 1, 50.0), ('2025-26', 'Bravo', 1, 45.0)]
    bob = pages['bob']['seasons'][0]
    assert (bob['periods'], bob['starts'], bob['gp'], bob['points'], bob['playoff_starts'], bob['playoff_points']) == (3, 2, 3, 100.0, 1, 500.0)
    assert (bob['salary'], bob['contract'], bob['paid']) == (1000000, 'REG1', 1000000)
    assert ann[0]['paid'] == 500000
    assert pages['cy']['seasons'][0]['bench_points'] == 50.0 and pages['cy']['seasons'][0]['starts'] == 0
    # Best periods include the playoffs, flagged
    assert [(p['season'], p['period'], p['fpts'], p['playoffs']) for p in pages['bob']['best_periods']][:3] == [
        ('2024-25', 3, 500, True), ('2025-26', 3, 500, True), ('2024-25', 2, 70, False)]
    assert pages['eve']['best_periods'] == [] and pages['eve']['seasons'][0]['periods'] == 1


def test_salary_paid(rows):
    paid = {(r.team, r.player_id): r.paid for r in players.salary_paid(rows, {1, 2}).itertuples()}
    # Every period on a roster counts, bench and injured reserve too
    assert paid == {('Alpha', 'ann'): 500000, ('Alpha', 'bob'): 1000000, ('Alpha', 'cy'): 1000000,
                    ('Bravo', 'ann'): 500000, ('Bravo', 'dee'): 1000000, ('Bravo', 'eve'): 500000, ('Bravo', 'fay'): 500000}
    # A season in progress: 2 periods of 4 played, so half the salary so far
    assert players.salary_paid(rows, {1, 2}, season_length=4).set_index(['team', 'player_id'])['paid'][('Alpha', 'bob')] == 500000
    data = compute_players(rows, {1, 2}, season_length=4)
    assert data['meta']['season_length'] == 4 and data['leaders'][0]['salary'] == 500000


def test_season_salary(rows):
    # The player's own salary, in full: Eve was on a roster for one period of two, Ann with two teams
    full = players.season_salary(rows, {1, 2}).set_index('player_id')['paid']
    assert (full['eve'], full['ann'], full['bob']) == (1000000, 1000000, 1000000)
    # A season in progress: the share of the season played so far
    assert players.season_salary(rows, {1, 2}, season_length=4).set_index('player_id')['paid']['eve'] == 500000
    # Player views use it, team views what the team paid
    index, pages = compute_player_pages([('2024-25', rows, {1, 2}, {3}), ('2025-26', rows, {1, 2}, {3})])
    assert pages['eve']['salary'] == 2000000 and pages['eve']['seasons'][0]['paid'] == 500000


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


def test_restore_zeroed_scores():
    # Fantrax voided Alpha's period-1 game (0) though its lineup scored 50; Bravo's 0 in period 2 is real (no
    # points in the lineup); Charlie's 70 differs from its lineup's 75 (an adjustment) and stays
    rows = pd.DataFrame([
        {'period': 1, 'team': 'Alpha', 'status': 'active', 'fpts': 30.0},
        {'period': 1, 'team': 'Alpha', 'status': 'active', 'fpts': 20.0},
        {'period': 1, 'team': 'Alpha', 'status': 'reserve', 'fpts': 99.0},
        {'period': 1, 'team': 'Bravo', 'status': 'active', 'fpts': 40.0},
        {'period': 2, 'team': 'Bravo', 'status': 'active', 'fpts': 0.0},
        {'period': 2, 'team': 'Charlie', 'status': 'active', 'fpts': 75.0},
    ])
    games = pd.DataFrame([
        {'Team': 'Alpha', 'Score': 0.0, 'Opponent': 'Bravo', 'OppScore': 40.0, 'Match': 1,
         'Result': 'L', 'Winner': 'Bravo', 'Loser': 'Alpha'},
        {'Team': 'Charlie', 'Score': 70.0, 'Opponent': 'Bravo', 'OppScore': 0.0, 'Match': 2,
         'Result': 'W', 'Winner': 'Charlie', 'Loser': 'Bravo'},
    ])
    fixed, fixes = players.restore_zeroed_scores(games, rows)
    assert fixes == [(1, 'Alpha', 50.0)]
    assert fixed[['Score', 'OppScore', 'Result', 'Winner', 'Loser']].values.tolist() == [
        [50.0, 40.0, 'W', 'Alpha', 'Bravo'], [70.0, 0.0, 'W', 'Charlie', 'Bravo']]
    assert games.loc[0, 'Score'] == 0.0                                     # the input is left alone
    assert players.restore_zeroed_scores(games, rows.iloc[0:0]) == (games, [])
