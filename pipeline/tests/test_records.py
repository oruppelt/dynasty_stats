"""
Tests for records.py on the hand-checked league in tests/fixtures/games.csv:
    Period 1: Alpha 100 - 90 Bravo,   Charlie 80 - 70 Delta   (average 85)
    Period 2: Alpha  60 - 95 Charlie, Bravo   85 - 85 Delta   (average 81.25; a tie)
"""
from pathlib import Path

import pytest

from league_data import compute_results, load_games
from records import compute_records

FIXTURE = Path(__file__).parent / 'fixtures' / 'games.csv'


@pytest.fixture(scope='module')
def records():
    return compute_records(compute_results(load_games(FIXTURE)), top_n=3)


def games(entries):
    return [(e['team'], e['period']) for e in entries]


def test_highest_scores(records):
    assert games(records['highest_scores']) == [('Alpha', 1), ('Charlie', 2), ('Bravo', 1)]


def test_game_entry(records):
    assert records['highest_scores'][0] == {
        'period': 1, 'team': 'Alpha', 'score': 100.0, 'opponent': 'Bravo', 'opp_score': 90.0,
        'period_avg': 85.0, 'all_play_wins': 3.0, 'others': 3,
    }


def test_scores_against_the_period_average(records):
    # 100/85 = 1.18, 95/81.25 = 1.17, 90/85 = 1.06 ... 60/81.25 = 0.74, 70/85 = 0.82, 80/85 = 0.94
    assert games(records['best_vs_average']) == [('Alpha', 1), ('Charlie', 2), ('Bravo', 1)]
    assert games(records['worst_vs_average']) == [('Alpha', 2), ('Delta', 1), ('Charlie', 1)]


def test_margins_list_each_game_once(records):
    # Winners: Charlie +35 (P2), Alpha +10 and Charlie +10 (P1); the P2 tie is listed by Bravo
    assert games(records['blowouts']) == [('Charlie', 2), ('Alpha', 1), ('Charlie', 1)]
    assert games(records['closest_games']) == [('Bravo', 2), ('Alpha', 1), ('Charlie', 1)]


def test_luck_by_all_play(records):
    # Bravo's 90 beat 2 of 3 teams and still lost; Charlie's 80 beat only Delta and won
    assert games(records['unluckiest_losses']) == [('Bravo', 1), ('Delta', 1), ('Alpha', 2)]
    assert games(records['luckiest_wins']) == [('Charlie', 1), ('Alpha', 1), ('Charlie', 2)]


def test_streaks(records):
    assert records['win_streaks'] == [
        {'team': 'Charlie', 'length': 2, 'start': 1, 'end': 2},
        {'team': 'Alpha', 'length': 1, 'start': 1, 'end': 1},
    ]
    # A tie ends a run (Bravo and Delta lose, then tie); the more recent run first
    assert [(s['team'], s['end']) for s in records['losing_streaks']] == [('Alpha', 2), ('Bravo', 1), ('Delta', 1)]


def test_period_highs(records):
    assert records['period_highs'] == [{'team': 'Alpha', 'count': 1}, {'team': 'Charlie', 'count': 1}]
