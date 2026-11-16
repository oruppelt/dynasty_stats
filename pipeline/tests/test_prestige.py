"""
Tests for prestige.py on a small league of four teams and two seasons:

    2024-25 (finished): Alpha champion over Bravo (2-1), Charlie the regular-season winner, Delta last
        (with 4 teams, the bottom three are ranks 2-4); Bravo has the season's highest score (120).
    2025-26 (in progress): no standings honors yet.
    Player p1 scores 3,000 then 2,500 for Alpha: passes 5,000 in 2025-26.
"""
import pandas as pd

from prestige import compute_prestige

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
        'playoffs': {'knockout': [{'round': 1, 'name': 'Final', 'series': [
            {'teams': ['Bravo', 'Alpha'], 'seeds': [3, 2], 'wins': [1, 2], 'winner': 'Alpha', 'games': []}]}]},
    },
    '2025-26': {'results': [game(1, 'Delta', 200, 'Alpha', 50), game(1, 'Alpha', 50, 'Delta', 200)]},
}

POINTS = pd.DataFrame([
    {'season': '2024-25', 'team': 'Alpha', 'player_id': 'p1', 'player': 'One', 'points': 3000.0, 'starts': 30},
    {'season': '2025-26', 'team': 'Alpha', 'player_id': 'p1', 'player': 'One', 'points': 2500.0, 'starts': 20},
    {'season': '2024-25', 'team': 'Bravo', 'player_id': 'p2', 'player': 'Two', 'points': 900.0, 'starts': 10},
])


def run(rewards=()):
    return compute_prestige(ALLTIME, FILES, POINTS, list(rewards))


def kinds(data, team, season):
    return sorted(e['kind'] for s in data['franchises'][team]['seasons'] if s['season'] == season for e in s['events'])


def test_honors_by_season():
    data, problems = run()
    assert not problems
    assert data['seasons'] == ['2024-25', '2025-26']
    assert kinds(data, 'Alpha', '2024-25') == ['bottom_three', 'title']   # rank 2 of 4 is in the bottom three
    assert kinds(data, 'Alpha', '2025-26') == ['player_5000']             # 3,000 + 2,500
    assert kinds(data, 'Bravo', '2024-25') == ['bottom_three', 'final', 'season_high']
    assert kinds(data, 'Charlie', '2024-25') == ['first_seed']
    # The season in progress: no standings honors (Delta's 200 and its #1 rank don't count yet)
    assert kinds(data, 'Delta', '2025-26') == []
    alpha = data['franchises']['Alpha']
    assert alpha['prestige'] == 100 - 10 + 10
    assert [s['total'] for s in alpha['seasons']] == [90, 100]
    assert alpha['cups'][0]['opponent'] == 'Bravo' and alpha['cups'][0]['series'] == '2-1'
    assert data['franchises']['Bravo']['prestige'] == 40 - 10 + 15
    assert [data['franchises'][t]['rank'] for t in TEAMS] == [1, 2, 3, 4]


def test_highlights_and_rivals():
    alpha = run()[0]['franchises']['Alpha']
    assert alpha['highlights']['highest_score']['score'] == 110
    assert alpha['highlights']['biggest_win']['margin'] == 50
    assert alpha['highlights']['longest_streak'] == {'season': '2024-25', 'length': 2, 'start': 2, 'end': 3}
    assert alpha['highlights']['best_season']['rank'] == 2
    assert alpha['rivals']['most_played']['team'] == 'Bravo'           # 6 + 3 playoff games
    assert alpha['rivals']['nemesis']['team'] == 'Bravo'               # 3-6
    assert alpha['rivals']['favorite']['team'] == 'Charlie'            # 7-1
    assert alpha['legends'][0] == {'player_id': 'p1', 'player': 'One', 'points': 5500.0, 'starts': 50,
                                   'first': '2024-25', 'last': '2025-26', 'seasons': 2, 'eligible': True, 'retired': False}


def test_rewards_are_checked():
    data, problems = run([
        {'team': 'Alpha', 'kind': 'jersey', 'season': '2024-25', 'player_id': 'p1'},   # 90 prestige by then: too little
        {'team': 'Alpha', 'kind': 'jersey', 'season': '2025-26', 'player_id': 'p1'},   # 100: retired
        {'team': 'Bravo', 'kind': 'jersey', 'season': '2025-26', 'player_id': 'p2'},   # 900 points: not eligible
        {'team': 'Bravo', 'kind': 'motto', 'season': '2025-26', 'text': 'Always the bridesmaid'},
        {'team': 'Charlie', 'kind': 'rival', 'season': '2025-26', 'opponent': 'Alpha'},  # 15 < 50
    ])
    assert len(problems) == 3
    alpha, bravo = data['franchises']['Alpha'], data['franchises']['Bravo']
    assert [j['player'] for j in alpha['jerseys']] == ['One']
    assert alpha['legends'][0]['retired'] and (alpha['spent'], alpha['balance']) == (100, 0)
    assert bravo['motto'] == 'Always the bridesmaid' and bravo['balance'] == 45 - 25
    assert data['franchises']['Charlie']['declared_rival'] is None
