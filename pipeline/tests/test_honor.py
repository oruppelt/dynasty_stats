"""
Tests for honor.py on a small league of four teams and two seasons:

    2024-25 (finished): Alpha champion over Bravo (2-1), Charlie the regular-season winner, Delta last
        (with 4 teams, all four are in the bottom five); Bravo has the season's highest score (120), Delta the
        fewest points over the season (130).
    2025-26 (in progress): no standings achievements yet.
    Player p1 scores 3,500 for Alpha in 2024-25, then 2,000 and 500 in 2025-26: passes 6,000 in period 2.
"""
import pandas as pd

from honor import compute_honor

TEAMS = ['Alpha', 'Bravo', 'Charlie', 'Delta']


def team_season(season, team, rank, finish):
    return {'season': season, 'team': team, 'rank': rank, 'games': 2, 'wins': 1, 'losses': 1,
            'all_play_wins': 3, 'all_play_losses': 3, 'luck': 0, 'score_index': 1, 'finish': finish}


ALLTIME = {
    'seasons': [
        {'season': '2025-26', 'in_progress': True, 'champion': None, 'runner_up': None, 'first_seed': 'Delta'},
        {'season': '2024-25', 'in_progress': False, 'champion': 'Alpha', 'runner_up': 'Bravo', 'first_seed': 'Charlie'},
    ],
    'team_seasons': [team_season('2024-25', t, r, f) for t, r, f in
                     [('Charlie', 1, 'semifinal'), ('Alpha', 2, 'champion'), ('Bravo', 3, 'final'), ('Delta', 4, 'missed')]]
                    + [team_season('2025-26', t, i + 1, None) for i, t in enumerate(TEAMS)],
    'head_to_head': {
        'teams': TEAMS,
        'wins': [{'Team': 'Alpha', 'Bravo': 1, 'Charlie': 7}, {'Team': 'Bravo', 'Alpha': 5}],
        'games': [{'Team': 'Alpha', 'Bravo': 6, 'Charlie': 8}, {'Team': 'Bravo', 'Alpha': 6}],
        'playoff_wins': [{'Team': 'Alpha', 'Bravo': 2}], 'playoff_games': [{'Team': 'Alpha', 'Bravo': 3}],
    },
}


def game(period, team, score, opponent, opp_score):
    return {'period': period, 'team': team, 'score': score, 'opponent': opponent, 'opp_score': opp_score,
            'win': 1.0 if score > opp_score else 0.0}


FILES = {
    '2024-25': {
        'results': [game(1, 'Bravo', 120, 'Alpha', 90), game(1, 'Alpha', 90, 'Bravo', 120),
                    game(2, 'Alpha', 110, 'Delta', 60), game(2, 'Delta', 60, 'Alpha', 110),
                    game(3, 'Alpha', 100, 'Delta', 70), game(3, 'Delta', 70, 'Alpha', 100)],
        'teams': [{'team': 'Alpha', 'points_for': 300}, {'team': 'Bravo', 'points_for': 200},
                  {'team': 'Charlie', 'points_for': 0}, {'team': 'Delta', 'points_for': 130}],
        'playoffs': {'knockout': [{'round': 1, 'name': 'Final', 'series': [
            {'teams': ['Bravo', 'Alpha'], 'seeds': [3, 2], 'wins': [1, 2], 'winner': 'Alpha', 'games': []}]}]},
    },
    '2025-26': {'results': [game(1, 'Delta', 200, 'Alpha', 50), game(1, 'Alpha', 50, 'Delta', 200)],
                'schedule': {'regular_periods': 2, 'periods': [{'period': 1, 'start': '2025-10-20', 'end': '2025-10-23'},
                                                               {'period': 2, 'start': '2025-10-24', 'end': '2025-10-26'}]}},
}

POINTS = pd.DataFrame([
    {'season': '2024-25', 'period': 1, 'team': 'Alpha', 'player_id': 'p1', 'player': 'One', 'points': 3500.0, 'starts': 1},
    {'season': '2025-26', 'period': 2, 'team': 'Alpha', 'player_id': 'p1', 'player': 'One', 'points': 500.0, 'starts': 1},
    {'season': '2025-26', 'period': 1, 'team': 'Alpha', 'player_id': 'p1', 'player': 'One', 'points': 2000.0, 'starts': 1},
    {'season': '2024-25', 'period': 1, 'team': 'Bravo', 'player_id': 'p2', 'player': 'Two', 'points': 900.0, 'starts': 1},
])


def run(rewards=(), image_dir=None):
    return compute_honor(ALLTIME, FILES, POINTS, list(rewards), *([image_dir] if image_dir else []))


def kinds(data, team, season):
    return sorted(e['kind'] for s in data['franchises'][team]['seasons'] if s['season'] == season for e in s['events'])


def test_achievements_by_season():
    data, problems = run()
    assert not problems
    assert data['seasons'] == ['2024-25', '2025-26']
    assert kinds(data, 'Alpha', '2024-25') == ['bottom_five', 'title']   # 4 teams: all in the bottom five
    assert kinds(data, 'Delta', '2024-25') == ['bottom_five', 'season_low']
    assert kinds(data, 'Alpha', '2025-26') == ['player_6000']             # 3,500 + 2,000 + 500
    milestone = data['franchises']['Alpha']['seasons'][1]['events'][0]
    assert (milestone['period'], milestone['date']) == (2, '2025-10-26')
    assert kinds(data, 'Bravo', '2024-25') == ['bottom_five', 'final', 'season_high']
    assert kinds(data, 'Charlie', '2024-25') == ['bottom_five', 'first_seed']
    # The season in progress: no standings achievements (Delta's 200 and its #1 rank don't count yet)
    assert kinds(data, 'Delta', '2025-26') == []
    alpha = data['franchises']['Alpha']
    assert alpha['honor'] == 100 - 10 + 10
    assert [s['total'] for s in alpha['seasons']] == [90, 100]
    assert alpha['banners'][0]['opponent'] == 'Bravo' and alpha['banners'][0]['series'] == '2-1'
    assert data['franchises']['Bravo']['honor'] == 25 - 10 + 15
    assert [data['franchises'][t]['rank'] for t in TEAMS] == [1, 2, 3, 4]


def test_highlight_ideas_and_legends():
    alpha = run()[0]['franchises']['Alpha']
    assert alpha['highlight_ideas']['highest_score']['score'] == 110
    assert alpha['highlight_ideas']['biggest_win']['margin'] == 50
    assert alpha['highlight_ideas']['longest_streak'] == {'season': '2024-25', 'length': 2, 'start': 2, 'end': 3}
    assert alpha['highlight_ideas']['best_season']['rank'] == 2
    assert alpha['legends'][0] == {'player_id': 'p1', 'player': 'One', 'points': 6000.0, 'starts': 3,
                                   'first': '2024-25', 'last': '2025-26', 'seasons': 2, 'eligible': True, 'retired': False}


def test_rewards_are_checked():
    data, problems = run([
        {'team': 'Alpha', 'kind': 'jersey', 'season': '2024-25', 'player_id': 'p1'},   # 90 honor by then: too little
        {'team': 'Alpha', 'kind': 'jersey', 'season': '2025-26', 'player_id': 'p1'},   # 100: retired
        {'team': 'Bravo', 'kind': 'jersey', 'season': '2025-26', 'player_id': 'p2'},   # 900 points: not eligible
        {'team': 'Bravo', 'kind': 'motto', 'season': '2025-26', 'text': 'Always the bridesmaid'},
        {'team': 'Charlie', 'kind': 'motto', 'season': '2025-26', 'text': 'x' * 81},       # too long
        {'team': 'Charlie', 'kind': 'rival', 'season': '2025-26', 'opponent': 'Alpha'},  # no such reward
    ])
    assert len(problems) == 4
    alpha, bravo = data['franchises']['Alpha'], data['franchises']['Bravo']
    assert [j['player'] for j in alpha['jerseys']] == ['One']
    assert alpha['legends'][0]['retired'] and (alpha['spent'], alpha['balance']) == (100, 0)
    assert bravo['motto'] == 'Always the bridesmaid' and bravo['balance'] == 30 - 25
    assert data['franchises']['Charlie']['motto'] is None


def test_reward_images(tmp_path):
    (tmp_path / 'one.jpg').write_bytes(b'x' * 100)
    (tmp_path / 'huge.png').write_bytes(b'x' * 2_000_000)
    data, problems = run([
        {'team': 'Alpha', 'kind': 'jersey', 'season': '2025-26', 'player_id': 'p1', 'image': 'one.jpg', 'caption': 'Night of 60'},
        {'team': 'Bravo', 'kind': 'highlight', 'season': '2025-26', 'title': 'Missing', 'image': 'none.jpg'},
        {'team': 'Bravo', 'kind': 'highlight', 'season': '2025-26', 'title': 'Too big', 'image': 'huge.png'},
        {'team': 'Bravo', 'kind': 'highlight', 'season': '2025-26', 'title': 'Escapes', 'image': '../one.jpg'},
    ], tmp_path)
    assert len(problems) == 3
    assert data['franchises']['Alpha']['jerseys'][0]['image'] == '/honor/one.jpg'
    assert data['franchises']['Alpha']['jerseys'][0]['caption'] == 'Night of 60'
    assert data['franchises']['Bravo']['highlights'] == []


def test_declared_highlights():
    data, problems = run([
        {'team': 'Alpha', 'kind': 'highlight', 'season': '2025-26', 'of': 'highest_score'},
        {'team': 'Bravo', 'kind': 'highlight', 'season': '2025-26', 'of': 'no_such_thing'},
        {'team': 'Bravo', 'kind': 'highlight', 'season': '2025-26'},                          # no title
    ])
    assert len(problems) == 2
    alpha = data['franchises']['Alpha']
    assert alpha['highlights'][0]['of'] == 'highest_score' and alpha['highlights'][0]['detail']['score'] == 110
    assert alpha['banners'] and all(b['kind'] == 'title' for b in alpha['banners'])
