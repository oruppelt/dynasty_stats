"""
Tests for draft.py on five seasons (S0-S4; regular periods 1-2, playoffs 3; S4 in progress after period 1 of 2):

    S0 draft: 1 Alpha x1 (rookie deal S0-S2 for Alpha, then 20M a season for Bravo: S3, S4); 2 Bravo x2 (rookie deal
        for Bravo, then gone); 31 Alpha x3 (bench in S0 only); 32 Bravo, unused.
    S3 draft: 1 Bravo y1 (10 a period); 2 Alpha y2 (30 a period, plus 50 in the S3 playoffs); 31 Bravo x3 again.
    S4 draft (in progress): 1 Alpha z1.
"""
import pandas as pd

from draft import compute_draft

SEASONS = ['2020-21', '2021-22', '2022-23', '2023-24', '2024-25']


def r(period, team, pid, fpts, contract, salary, status='active'):
    return {'period': period, 'team': team, 'player_id': pid, 'player': pid.upper(), 'status': status, 'slot': 'Flx',
            'fpts': fpts, 'gp': 1, 'min': 30.0, 'salary': salary, 'contract': contract}


def rows(season):
    i = SEASONS.index(season)
    out = []
    for p in (1, 2):
        if season == '2024-25' and p == 2:
            continue
        if i < 3:
            out.append(r(p, 'Alpha', 'x1', 40.0, f'R1{3 - i}', 5_000_000))
            out.append(r(p, 'Bravo', 'x2', 20.0, f'R1{3 - i}', 4_000_000))
        else:
            out.append(r(p, 'Bravo', 'x1', 40.0, 'REG2', 20_000_000))
            out.append(r(p, 'Bravo', 'y1', 10.0, 'R13', 3_000_000))
            out.append(r(p, 'Alpha', 'y2', 30.0, 'R13', 2_000_000))
        if i == 0:
            out.append(r(p, 'Alpha', 'x3', 5.0, 'R23', 1_000_000, status='bench'))
    if season == '2023-24':
        out.append(r(3, 'Alpha', 'y2', 50.0, 'R13', 2_000_000))
    return pd.DataFrame(out)


def season(s):
    return {'season': s, 'rows': rows(s), 'regular_periods': [1] if s == '2024-25' else [1, 2],
            'playoff_periods': [3] if s == '2023-24' else [], 'season_length': 2}


def pick(s, rnd, n, team, pid, when='2020-06-01'):
    return {'season': s, 'round': rnd, 'pick': n, 'team': team, 'player_id': pid, 'time': pd.Timestamp(when)}


DRAFTS = pd.DataFrame([pick('2020-21', 1, 1, 'Alpha', 'x1'), pick('2020-21', 1, 2, 'Bravo', 'x2'), pick('2020-21', 2, 31, 'Alpha', 'x3'),
                       pick('2020-21', 2, 32, 'Bravo', ''),
                       pick('2023-24', 1, 1, 'Bravo', 'y1'), pick('2023-24', 1, 2, 'Alpha', 'y2'), pick('2023-24', 2, 31, 'Bravo', 'x3'),
                       pick('2024-25', 1, 1, 'Alpha', 'z1')])


def run():
    return compute_draft(DRAFTS, [season(s) for s in SEASONS], known={'z1': 'Zed'})


def draft(season_id):
    return {p['pick']: p for p in next(d for d in run()['drafts'] if d['season'] == season_id)['picks']}


def test_drafts():
    d = run()['drafts']
    assert [(x['season'], x['metric'], x['in_progress'], x['rookie_deal_over']) for x in d] == [
        ('2024-25', 'points', True, False), ('2023-24', 'points', False, False), ('2020-21', 'salary', False, True)]


def test_pick_stats():
    x1 = draft('2020-21')[1]
    assert (x1['team'], x1['slot'], x1['player'], x1['redraft']) == ('Alpha', 1, 'X1', None)
    assert x1['rookie_points'] == 6 * 40.0                     # S0-S2, lineup points
    assert x1['points'] == 9 * 40.0                            # + S3 and S4's one period
    assert x1['team_points'] == 6 * 40.0                       # for Alpha only
    assert (x1['salary_after'], x1['seasons_after']) == (20_000_000, 2)
    # Paid: 3 rookie seasons at 5M, S3 at 20M, S4 half played (1 of 2 periods)
    assert x1['earned'] == 3 * 5_000_000 + 20_000_000 + 10_000_000
    assert [h['season'] for h in x1['history']] == ['2020-21', '2021-22', '2022-23', '2023-24', '2024-25']
    assert x1['history'][3] == {'season': '2023-24', 'teams': ['Bravo'], 'contract': 'REG2', 'salary': 20_000_000,
                                'points': 80.0, 'playoff_points': 0.0, 'starts': 2, 'playoff_starts': 0}
    y2 = draft('2023-24')[2]
    assert (y2['points'], y2['playoff_points'], y2['playoff_starts']) == (90.0, 50.0, 1)


def test_salary_value():
    s0 = draft('2020-21')
    # Slot 1 and 2 are compared with each other (within 2): expected 10M; the first round's average is 10M
    assert (s0[1]['value'], s0[1]['expected'], s0[1]['vs_slot'], s0[1]['score']) == (20_000_000, 10_000_000, 10_000_000, 1.0)
    assert (s0[2]['value'], s0[2]['score']) == (0, -1.0)
    assert s0[32]['player_id'] is None and s0[32]['value'] is None


def test_points_value():
    s3 = draft('2023-24')
    # 2 seasons, the second up to period 1: y1 10 + 10 + 10, y2 30 * 3 (playoffs don't count); x1 and x2 over S0
    # and S1 (period 1): 120 and 60. Slots 1-2: (30 + 90 + 120 + 60) / 4 = 75, the first round's average too
    assert (s3[1]['value'], s3[1]['expected']) == (30.0, 75.0)
    assert s3[2]['score'] == round((90 - 75) / 75, 3)
    # x3 was drafted in S0: a placeholder, a miss (value 0, none of his points)
    assert (s3[31]['redraft'], s3[31]['value'], s3[31]['points'], s3[31]['history']) == ('2020-21', 0.0, 0.0, [])
    # Slot 31: x3's S0 pick (bench, 10 in S0) and the placeholder (0)
    assert (s3[31]['expected'], s3[31]['vs_slot']) == (5.0, -5.0)
    assert draft('2024-25')[1]['player'] == 'Zed'                     # never on a roster: the name from the logs


def test_teams():
    teams = {t['team']: t for t in run()['teams']}
    # S4's draft and the unused pick are left out; the re-drafted x3 counts (a miss)
    assert (teams['Alpha']['picks'], teams['Bravo']['picks']) == (3, 3)
    assert teams['Bravo']['worst']['player_id'] == 'x2'
    alpha = teams['Alpha']
    assert alpha['score'] == round(1.0 + 0.0 + (90 - 75) / 75, 2)
    assert alpha['hits'] == 2 and alpha['best']['player_id'] == 'x1'
    # Points for Alpha (lineup, playoffs too) / every point its picks scored
    assert alpha['team_points'] == 240.0 + 140.0 + 0.0
    assert alpha['kept'] == round(380.0 / (360.0 + 90.0 + 50.0), 3)
