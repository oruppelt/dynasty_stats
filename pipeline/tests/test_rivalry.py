"""
Tests for rivalry.py on two seasons of three teams:

    2024-25: Alpha beat Bravo in period 1 (100-90) and lost in period 3 (80-120); in the playoffs Alpha beat
        Bravo in a Swiss round (period 5, 150-140) and won their final 2-0 (periods 6 and 7).
    2025-26: Bravo beat Alpha in period 1 (130-100); period 2 is a re-score (0-0), not a game.
    A trade: Bravo sent p2 to Alpha (300 points for Alpha after), Alpha sent a pick that became p3 (50).
    Lineups: p1 (Alpha) scores in every game, p2 for Bravo, then for Alpha after the trade.
"""
import pandas as pd

from rivalry import compute_rivalries, slug


def row(period, team, score, opponent, opp_score):
    win = 1.0 if score > opp_score else 0.0 if score < opp_score else 0.5
    return [{'period': period, 'team': team, 'score': score, 'opponent': opponent, 'opp_score': opp_score, 'win': win},
            {'period': period, 'team': opponent, 'score': opp_score, 'opponent': team, 'opp_score': score, 'win': 1 - win}]


FILES = {
    '2024-25': {
        'results': row(1, 'Alpha', 100, 'Bravo', 90) + row(2, 'Alpha', 70, 'Charlie', 60) + row(3, 'Bravo', 120, 'Alpha', 80),
        'playoffs': {
            'swiss': {'rounds': [{'round': 1, 'period': 5, 'games': [
                {'team': 'Alpha', 'score': 150, 'opponent': 'Bravo', 'opp_score': 140}]}]},
            'knockout': [{'round': 1, 'name': 'Final', 'series': [
                {'teams': ['Bravo', 'Alpha'], 'wins': [0, 2], 'winner': 'Alpha', 'games': [
                    {'period': 6, 'team': 'Alpha', 'score': 110, 'opponent': 'Bravo', 'opp_score': 100},
                    {'period': 7, 'team': 'Bravo', 'score': 95, 'opponent': 'Alpha', 'opp_score': 105}]}]}],
        },
    },
    '2025-26': {'results': row(1, 'Bravo', 130, 'Alpha', 100) + row(2, 'Alpha', 0, 'Bravo', 0)},
}

TRADES = {'t1': {'date': '2025-01-10', 'season': '2024-25', 'period': 2, 'items': [
    {'kind': 'player', 'from': 'Bravo', 'to': 'Alpha', 'player_id': 'p2', 'player': 'Two', 'label': 'Two',
     'result': {'points': 300.0}},
    {'kind': 'pick', 'from': 'Alpha', 'to': 'Bravo', 'label': '2026 round 1 pick (Alpha)',
     'became': {'player_id': 'p3', 'player': 'Three'}, 'result': {'points': 50.0}},
]}}


def lineup(season, period, team, pid, points):
    return {'season': season, 'period': period, 'team': team, 'player_id': pid, 'player': pid.upper(), 'points': points}


LINEUPS = pd.DataFrame(
    [lineup('2024-25', p, 'Alpha', 'p1', 40.0 + p) for p in (1, 3, 5, 6, 7)]
    + [lineup('2024-25', 1, 'Bravo', 'p2', 60.0), lineup('2024-25', 3, 'Alpha', 'p2', 20.0)]
    + [lineup('2025-26', 1, 'Alpha', 'p1', 10.0), lineup('2024-25', 2, 'Alpha', 'p9', 99.0)]
)


def run():
    return compute_rivalries(FILES, TRADES, LINEUPS)


def test_meetings_and_record():
    r = run()['Alpha']['opponents']['Bravo']
    assert [(m['season'], m['period'], m['stage'], m['win']) for m in r['meetings']] == [
        ('2024-25', 1, 'regular', 1), ('2024-25', 3, 'regular', 0), ('2024-25', 5, 'swiss', 1),
        ('2024-25', 6, 'knockout', 1), ('2024-25', 7, 'knockout', 1), ('2025-26', 1, 'regular', 0)]
    assert r['meetings'][3]['round'] == 'Final'
    assert (r['wins'], r['losses'], r['games']) == (1, 2, 3)              # the 0-0 re-score isn't a game
    assert (r['playoff_wins'], r['playoff_losses'], r['playoff_games']) == (3, 0, 3)
    assert r['series'] == [{'season': '2024-25', 'round': 'Final', 'won': True, 'wins': 2, 'losses': 0}]
    assert r['points_for'] == 100 + 80 + 150 + 110 + 105 + 100
    # Bravo's side is the mirror
    b = run()['Bravo']['opponents']['Alpha']
    assert (b['wins'], b['losses'], b['playoff_losses']) == (2, 1, 3)
    assert run()['Charlie']['opponents']['Bravo']['meetings'] == []


def test_streaks_and_records():
    r = run()['Alpha']['opponents']['Bravo']
    assert r['streak'] == {'side': 'opponent', 'length': 1, 'from': {'season': '2025-26', 'period': 1},
                           'to': {'season': '2025-26', 'period': 1}}
    assert r['longest_streak']['length'] == 3                              # periods 5, 6, 7 of 2024-25
    assert r['longest_streak']['from'] == {'season': '2024-25', 'period': 5}
    rec = r['records']
    assert (rec['highest_score']['score'], rec['highest_score']['side']) == (150, 'team')
    assert (rec['biggest_win']['margin'], rec['biggest_win']['side']) == (40, 'opponent')
    assert rec['closest_game']['margin'] == 10
    assert rec['highest_combined']['combined'] == 290


def test_trades():
    alpha = run()['Alpha']['opponents']['Bravo']['trades']
    assert len(alpha) == 1
    t = alpha[0]
    assert [i['player'] for i in t['got']] == ['Two'] and [i['player'] for i in t['gave']] == ['Three']
    assert (t['got_points'], t['gave_points']) == (300, 50)
    bravo = run()['Bravo']['opponents']['Alpha']['trades'][0]
    assert (bravo['got_points'], bravo['gave_points']) == (50, 300)
    assert run()['Charlie']['opponents']['Alpha']['trades'] == []


def test_players():
    p = run()['Alpha']['opponents']['Bravo']['players']
    # p1: 41 + 43 + 45 + 46 + 47 (2024-25) + 10 (2025-26); p9 scored only against Charlie
    assert p['team'][0] == {'player_id': 'p1', 'player': 'P1', 'points': 232.0, 'games': 6, 'best': 47.0}
    assert [x['player_id'] for x in p['team']] == ['p1', 'p2']
    assert p['opponent'] == [{'player_id': 'p2', 'player': 'P2', 'points': 60.0, 'games': 1, 'best': 60.0}]
    assert p['best_game'] == {'side': 'opponent', 'player_id': 'p2', 'player': 'P2', 'points': 60.0,
                              'season': '2024-25', 'period': 1}
    assert p['both'] == [{'player_id': 'p2', 'player': 'P2', 'team_points': 20.0, 'opponent_points': 60.0}]


def test_slug():
    assert slug('Portland Trail Blazers') == 'portland-trail-blazers'
    assert slug('Philadelphia 76ers') == 'philadelphia-76ers'
