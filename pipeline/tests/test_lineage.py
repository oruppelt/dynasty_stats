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


def test_pick_path_and_what_it_became():
    # Two teams; A's 2024 round-1 pick goes to B, who uses it (slot 1) on x; A picks y with B's (slot 2)
    s1 = rows((1, 'A', 'p', 'active', 10), (1, 'B', 'q', 'active', 10))
    s2 = rows((1, 'B', 'x', 'active', 30), (1, 'A', 'y', 'active', 5))
    t = tx(
        trades=[('2023-24', 't1', 1, 'pick', 'A', 'B', '2023-11-10 10:00', 3, '', '', '2024 Draft Pick Round 1 (A)', ''),
                ('2023-24', 't1', 0, 'pick', 'B', 'A', '2023-11-10 10:00', 3, '', '', '2024 Draft Pick Round 1 (B)', '')],
        drafts=[('2024-25', 1, 1, 'B', 'x', '2024-06-25 20:00'), ('2024-25', 1, 2, 'A', 'y', '2024-06-25 20:05')],
    )
    t['draft_orders'] = pd.DataFrame({'season': ['2024-25'] * 2, 'pick': [1, 2], 'team': ['A', 'B']})
    picks, _ = lineage.compute_picks(t)
    assert {k: (p['slot'], p['player_id'], p['certain']) for k, p in picks.items()} == \
        {'2024-25/1/A': (1, 'x', True), '2024-25/1/B': (2, 'y', True)}
    out = lineage.compute_timelines([('2023-24', s1, {1}, set()), ('2024-25', s2, {1}, set())], t)['x']
    assert [e['kind'] for e in out['events']] == ['pick', 'pick-trade', 'draft']
    pick, moved, draft = out['events']
    assert (pick['team'], moved['from'], moved['team'], draft['original'], draft['pick']) == ('A', 'A', 'B', 'A', 1)
    became = {i['label']: i.get('became', {}).get('player_id') for i in out['trades']['t1']['items']}
    assert became == {'2024 round 1 pick (A)': 'x', '2024 round 1 pick (B)': 'y'}


def test_trade_results():
    # B gets p (who stays 1 period, then is dropped) and A's pick, used on x (still there); A gets B's pick, traded on
    s1 = rows((1, 'A', 'p', 'active', 10), (2, 'B', 'p', 'active', 12))
    s2 = rows((1, 'B', 'x', 'active', 30), (1, 'C', 'y', 'active', 5))
    t = tx(
        trades=[('2023-24', 't1', 2, 'player', 'A', 'B', '2023-11-10 10:00', 2, 'p', 'P', '', ''),
                ('2023-24', 't1', 1, 'pick', 'A', 'B', '2023-11-10 10:00', 2, '', '', '2024 Draft Pick Round 1 (A)', ''),
                ('2023-24', 't1', 0, 'pick', 'B', 'A', '2023-11-10 10:00', 2, '', '', '2024 Draft Pick Round 1 (B)', ''),
                ('2023-24', 't2', 0, 'pick', 'A', 'C', '2024-01-10 10:00', 2, '', '', '2024 Draft Pick Round 1 (B)', '')],
        claims=[('2024-25', 'c1', 0, 'DROP', 'B', '2024-06-01 10:00', 1, 'p', 'P', '')],
        drafts=[('2024-25', 1, 1, 'B', 'x', '2024-06-25 20:00'), ('2024-25', 1, 2, 'C', 'y', '2024-06-25 20:05')],
    )
    t['draft_orders'] = pd.DataFrame({'season': ['2024-25'] * 3, 'pick': [1, 2, 3], 'team': ['A', 'B', 'C']})
    every = {}
    out = lineage.compute_timelines([('2023-24', s1, {1, 2}, set()), ('2024-25', s2, {1}, set())], t, all_trades=every)
    items = {i['label']: i.get('result') for i in out['p']['trades']['t1']['items']}
    # What each team did with what it got: p dropped, the pick used on x (kept), B's pick traded on in t2
    assert {i['label']: i.get('next') for i in every['t1']['items']} == {
        'P': {'dropped': '2024-06-01'}, '2024 round 1 pick (A)': {'kept': True}, '2024 round 1 pick (B)': {'trade': 't2'}}
    assert set(every) == {'t1', 't2'}
    assert items['P'] == {'points': 12.0, 'starts': 1, 'gp': 1, 'periods': 1, 'ongoing': False}
    assert items['2024 round 1 pick (A)'] == {'points': 30.0, 'starts': 1, 'gp': 1, 'periods': 1, 'ongoing': True}
    assert items['2024 round 1 pick (B)'] == {'traded_on': True, 'drafted_by': 'C'}


def test_how_the_roster_was_built():
    # B drafts x with A's pick, got for its own pick; then trades q (a claim) to A for p, who A had from the start
    s1 = rows((1, 'A', 'p', 'active', 10), (1, 'B', 'q', 'active', 10))
    s2 = rows((1, 'B', 'x', 'active', 30), (1, 'A', 'y', 'active', 5), (1, 'B', 'p', 'active', 7),
              (1, 'A', 'q', 'active', 4))
    t = tx(
        claims=[('2023-24', 'c1', 0, 'CLAIM', 'B', '2023-10-01 10:00', 1, 'q', 'Q', '1.00')],
        trades=[('2023-24', 't1', 1, 'pick', 'A', 'B', '2023-11-10 10:00', 3, '', '', '2024 Draft Pick Round 1 (A)', ''),
                ('2023-24', 't1', 0, 'pick', 'B', 'A', '2023-11-10 10:00', 3, '', '', '2024 Draft Pick Round 1 (B)', ''),
                ('2024-25', 't2', 1, 'player', 'A', 'B', '2024-07-10 10:00', 1, 'p', 'P', '', ''),
                ('2024-25', 't2', 0, 'player', 'B', 'A', '2024-07-10 10:00', 1, 'q', 'Q', '', '')],
        drafts=[('2024-25', 1, 1, 'B', 'x', '2024-06-25 20:00'), ('2024-25', 1, 2, 'A', 'y', '2024-06-25 20:05')],
    )
    t['draft_orders'] = pd.DataFrame({'season': ['2024-25'] * 2, 'pick': [1, 2], 'team': ['A', 'B']})
    built = {}
    lineage.compute_timelines([('2023-24', s1, {1}, set()), ('2024-25', s2, {1}, set())], t, built=built)
    assert set(built) == {'A', 'B'} and built['B']['season'] == '2024-25'
    x, p = built['B']['players']  # most points first
    assert (x['label'], x['how'], x['original'], x['points']) == ('x', 'draft', 'A', 30.0)
    assert (x['via']['how'], x['via']['trade']) == ('trade', 't1')
    assert [(g['label'], g['how']) for g in x['via']['gave']] == [('2024 round 1 pick (B)', 'own')]
    assert (p['how'], p['trade'], p['from']) == ('trade', 't2', 'A')
    assert [(g['player_id'], g['how'], g['points']) for g in p['gave']] == [('q', 'claim', 10.0)]
    q = next(n for n in built['A']['players'] if n['player_id'] == 'q')
    assert [(g['player_id'], g['how']) for g in q['gave']] == [('p', 'joined')]
