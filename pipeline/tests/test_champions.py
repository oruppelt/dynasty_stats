"""
Tests for champions.py on two seasons, regular season periods 1-2, playoffs 3-4, the final in period 4:

    2024-25: Alpha beat Bravo in the final. a1 starts for Alpha throughout; a0 starts once for Alpha but scores 0
        (no ring); b1 starts for Bravo, a2 is on Alpha's bench (no ring).
    2025-26: Bravo beat Alpha. a1 was traded to Bravo after period 1 (a ring for Bravo); b1 starts for Alpha now.
"""
import pandas as pd

from champions import compute_champions, final_periods


def r(period, team, pid, fpts, status='active', salary=2_000_000):
    return {'period': period, 'team': team, 'player_id': pid, 'player': pid.upper(), 'status': status, 'slot': 'Flx',
            'fpts': fpts, 'gp': 1, 'min': 30.0, 'salary': salary, 'contract': ''}


Y1 = pd.DataFrame([r(p, 'Alpha', 'a1', 10.0 * p) for p in (1, 2, 3, 4)]
                  + [r(1, 'Alpha', 'a0', 0.0), r(2, 'Alpha', 'a2', 50.0, status='bench')]
                  + [r(p, 'Bravo', 'b1', 20.0) for p in (1, 2, 3, 4)])
Y2 = pd.DataFrame([r(1, 'Alpha', 'a1', 5.0)] + [r(p, 'Bravo', 'a1', 7.0) for p in (2, 3, 4)]
                  + [r(p, 'Alpha', 'b1', 3.0) for p in (1, 2, 3, 4)])


def season(sid, rows, champion, runner_up):
    return {'season': sid, 'champion': champion, 'runner_up': runner_up, 'rows': rows,
            'regular_periods': [1, 2], 'playoff_periods': [3, 4], 'final_periods': [4]}


def run():
    return compute_champions([season('2024-25', Y1, 'Alpha', 'Bravo'), season('2025-26', Y2, 'Bravo', 'Alpha')])


def test_title_rosters():
    titles = run()['seasons']
    assert [t['season'] for t in titles] == ['2025-26', '2024-25']
    y1 = titles[1]['players']
    assert [p['player_id'] for p in y1] == ['a1']                     # a0 scored 0, a2 only on the bench
    assert y1[0] == {'player_id': 'a1', 'player': 'A1', 'points': 30.0, 'playoff_points': 70.0, 'finals_points': 40.0,
                     'starts': 2, 'playoff_starts': 2, 'gp': 4, 'salary': 2_000_000}
    # Traded in: Bravo paid half his salary (1 of 2 regular periods)
    assert titles[0]['players'][0]['salary'] == 1_000_000


def test_ring_leaders():
    data = run()
    # b1 lost both finals (Bravo, then Alpha) and has no ring: not listed
    assert data['ring_holders'] == 1
    [a1] = data['players']
    # 2025-26: a1 scored for Alpha (the runner-up) before the trade, so a lost final too
    assert (a1['player_id'], a1['rings'], a1['finals_lost']) == ('a1', 2, 1)
    assert a1['lost'] == [{'season': '2025-26', 'team': 'Alpha'}]
    assert [t['team'] for t in a1['titles']] == ['Alpha', 'Bravo']
    assert a1['points'] == 30.0 + 7.0 and a1['playoff_points'] == 70.0 + 14.0 and a1['finals_points'] == 47.0
    assert a1['starts'] == 4 + 3


def test_finals_lost():
    data = compute_champions([season('2024-25', Y1, 'Bravo', 'Alpha')])
    assert [(p['player_id'], p['rings'], p['finals_lost']) for p in data['players']] == [('b1', 1, 0)]
    data = compute_champions([season('2024-25', Y1, 'Alpha', 'Bravo'), season('2025-26', Y2, 'Alpha', 'Bravo')])
    b1 = next(p for p in data['players'] if p['player_id'] == 'b1')
    assert (b1['rings'], b1['finals_lost'], b1['finals_points']) == (1, 1, 3.0)    # the lost final isn't in the points


def test_final_periods():
    swiss = {'playoffs': {'knockout': [{'name': 'Semifinals', 'series': [{'games': [{'period': 40}]}]},
                                       {'name': 'Final', 'series': [{'games': [{'period': 44}, {'period': 45}]}]}]}}
    assert final_periods(swiss, 'A', 'B') == [44, 45]
    other = {'playoff_games': [{'period': 38, 'team': 'A', 'opponent': 'C'}, {'period': 40, 'team': 'B', 'opponent': 'A'},
                               {'period': 41, 'team': 'A', 'opponent': 'B'}]}
    assert final_periods(other, 'A', 'B') == [40, 41]
