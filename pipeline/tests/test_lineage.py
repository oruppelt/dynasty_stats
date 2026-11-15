import pandas as pd

import lineage


def rows(*entries):
    """(period, team, player_id, status, fpts) -> cached roster rows."""
    return pd.DataFrame([{'period': p, 'team': t, 'player_id': pid, 'player': pid, 'status': s, 'fpts': f,
                          'gp': 1, 'min': 30.0, 'salary': 2_000_000, 'contract': 'REG2'} for p, t, pid, s, f in entries])


def tx(claims=(), trades=(), drafts=()):
    cd = pd.DataFrame(list(claims), columns=['season', 'set', 'order', 'code', 'team', 'date', 'period', 'player_id',
                                             'player', 'bid'])
    tr = pd.DataFrame(list(trades), columns=['season', 'set', 'order', 'kind', 'from', 'to', 'date', 'period',
                                             'player_id', 'player', 'pick', 'budget'])
    dr = pd.DataFrame(list(drafts), columns=['season', 'round', 'pick', 'team', 'player_id', 'time'])
    for frame, col in ((cd, 'date'), (tr, 'date'), (dr, 'time')):
        frame[col] = pd.to_datetime(frame[col])
    return {'claims_drops': cd, 'trades': tr, 'drafts': dr}


def test_draft_trade_drop_and_resign():
    s1 = rows((1, 'A', 'p', 'active', 10), (2, 'A', 'p', 'active', 20), (3, 'B', 'p', 'bench', 5))
    s2 = rows((1, 'B', 'p', 'active', 30))
    t = tx(
        drafts=[('2023-24', 1, 4, 'A', 'p', '2023-06-25 20:00')],
        trades=[('2023-24', 't1', 0, 'player', 'A', 'B', '2023-11-10 10:00', 3, 'p', 'P', '', ''),
                ('2023-24', 't1', 1, 'pick', 'B', 'A', '2023-11-10 10:00', 3, '', '', '2025 Draft Pick Round 1 (B)', ''),
                # A record for a player who isn't on the sending team changes nothing
                ('2023-24', 't2', 2, 'player', 'C', 'D', '2023-11-12 10:00', 3, 'p', 'P', '', '')],
        claims=[('2024-25', 'c1', 1, 'DROP', 'B', '2024-07-01 10:00', 1, 'p', 'P', ''),
                ('2024-25', 'c2', 0, 'CLAIM', 'B', '2024-07-05 10:00', 1, 'p', 'P', '3.00')],
    )
    out = lineage.compute_timelines([('2023-24', s1, {1, 2, 3}, set()), ('2024-25', s2, {1}, set())], t)['p']
    kinds = [e['kind'] for e in out['events']]
    assert kinds == ['draft', 'trade', 'drop', 're-sign']
    draft, trade, _, resign = out['events']
    assert (draft['round'], draft['pick'], draft['periods'], draft['starts'], draft['gp'], draft['points']) == (1, 4, 2, 2, 2, 30.0)
    assert (trade['from'], trade['team'], trade['periods'], trade['starts']) == ('A', 'B', 1, 0)
    assert resign['bid'] == 3.0 and resign['points'] == 30.0
    assert list(out['trades']) == ['t1']
    assert [i['label'] for i in out['trades']['t1']['items']] == ['P', '2025 round 1 pick (B)']


def test_unlogged_arrival_and_rename():
    s1 = rows((1, 'Los Angeles Lakers', 'p', 'active', 10))
    s2 = rows((1, 'Los Angeles Clippers', 'p', 'active', 10))  # the same owner, after the 2025-06-27 swap
    out = lineage.compute_timelines([('2024-25', s1, {1}, set()), ('2025-26', s2, {1}, set())], tx())['p']['events']
    assert [e['kind'] for e in out] == ['joined', 'renamed']
    assert out[0]['before_logs'] and out[0]['periods'] == 2
    assert (out[1]['from'], out[1]['team']) == ('Los Angeles Lakers', 'Los Angeles Clippers')



def test_axis():
    s1 = rows((1, 'A', 'p', 'active', 10))
    out = lineage.compute_axis([('2024-25', s1, {1, 2}, set()), ('2023-24', s1, {1, 2}, {3}), ('2025-26', s1, set(), set())])
    assert out == [{'season': '2023-24', 'length': 3, 'playoffs_from': 3},
                   {'season': '2024-25', 'length': 2, 'playoffs_from': None}]
