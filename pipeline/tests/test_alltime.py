"""
Tests for alltime.py: two seasons of the hand-checked league in tests/fixtures/games.csv.

    2024-25, the fixture as it is:
        Period 1: Alpha 100 - 90 Bravo,   Charlie 80 - 70 Delta   (average 85)
        Period 2: Alpha  60 - 95 Charlie, Bravo   85 - 85 Delta   (average 81.25; a tie)
    2025-26, the same but Alpha scores 0 in period 2 (a Fantrax re-score), in progress.
"""
from pathlib import Path

import pytest

from alltime import compute_alltime, playoff_finishes
from league_data import compute_league, load_games

FIXTURE = Path(__file__).parent / 'fixtures' / 'games.csv'


def series(teams, wins, winner):
    return {'teams': teams, 'seeds': [1, 2], 'wins': wins, 'winner': winner, 'games': []}


@pytest.fixture(scope='module')
def seasons(tmp_path_factory):
    old = compute_league(load_games(FIXTURE))
    # A small bracket: Charlie and Alpha through the Swiss stage, Bravo out, Delta missed it
    old['playoffs'] = {
        'swiss': {'rounds': [], 'standings': [
            {'team': t, 'seed': 1, 'wins': 0, 'losses': 0, 'status': 'through'} for t in ('Alpha', 'Bravo', 'Charlie')]},
        'knockout': [{'round': 1, 'name': 'Final', 'series': [series(['Charlie', 'Alpha'], [2, 1], 'Charlie')]}],
        'champion': 'Charlie',
    }
    path = tmp_path_factory.mktemp('games') / 'new.csv'
    path.write_text(FIXTURE.read_text().replace('Alpha,60', 'Alpha,0'))
    new = compute_league(load_games(path))
    return [('2025-26', new, {'id': '2025-26'}), ('2024-25', old, {'id': '2024-25', 'final': True})]


@pytest.fixture(scope='module')
def alltime(seasons):
    return compute_alltime(seasons)


def test_playoff_finishes(seasons):
    _, old, settings = seasons[1]
    assert playoff_finishes(old, settings) == {
        'Alpha': 'final', 'Bravo': 'swiss', 'Charlie': 'champion', 'Delta': 'missed'}
    assert playoff_finishes(seasons[0][1], seasons[0][2]) is None  # in progress


def test_earlier_format_finishes():
    data = {'matchups': {'teams': ['Alpha', 'Bravo', 'Charlie']}, 'playoffs': None,
            'playoff_games': [{'period': 3, 'team': 'Alpha', 'score': 1, 'opponent': 'Bravo', 'opp_score': 2}]}
    assert playoff_finishes(data, {'final': True}) == {'Alpha': 'playoffs', 'Bravo': 'playoffs', 'Charlie': 'missed'}
    assert playoff_finishes(data, {'final': True, 'champion': 'Bravo', 'runner_up': 'Alpha'}) == {
        'Alpha': 'final', 'Bravo': 'champion', 'Charlie': 'missed'}


def test_season_without_a_champion(seasons):
    _, data, _ = seasons[1]
    summary = compute_alltime([('2019-20', data, {'final': True, 'champion': None})])['seasons'][0]
    assert summary['no_champion'] is True


def test_season_summary(alltime):
    assert alltime['seasons'] == [
        {'season': '2025-26', 'in_progress': True, 'champion': None, 'no_champion': False, 'runner_up': None,
         'first_seed': 'Charlie', 'periods': 2},
        {'season': '2024-25', 'in_progress': False, 'champion': 'Charlie', 'no_champion': False, 'runner_up': 'Alpha',
         'first_seed': 'Charlie', 'periods': 2},
    ]


def test_career_totals(alltime):
    alpha = next(f for f in alltime['franchises'] if f['team'] == 'Alpha')
    # 1-1 in both seasons; all-play 3-0 then 0-3 each season
    assert alpha | {'score_index': None} == {
        'team': 'Alpha', 'seasons': 2, 'games': 4, 'wins': 2.0, 'losses': 2.0,
        'all_play_wins': 6.0, 'all_play_losses': 6.0, 'luck': 0.0, 'score_index': None,
        'playoffs': 1, 'finals': 1, 'titles': 0, 'best_rank': 2, 'average_rank': 2.0}
    # Score / period average per game: 100/85, 60/81.25; then 100/85, 0/65 (period 2 average with the 0)
    assert alpha['score_index'] == pytest.approx((100 / 85 + 60 / 81.25 + 100 / 85 + 0) / 4, abs=1e-4)


def test_team_seasons(alltime):
    old = [(s['team'], s['rank'], s['finish']) for s in alltime['team_seasons'] if s['season'] == '2024-25']
    assert old == [('Charlie', 1, 'champion'), ('Alpha', 2, 'final'), ('Bravo', 3, 'swiss'), ('Delta', 4, 'missed')]


def test_head_to_head_adds_up_the_seasons(alltime):
    h2h = alltime['head_to_head']
    alpha = next(r for r in h2h['wins'] if r['Team'] == 'Alpha')
    games = next(r for r in h2h['games'] if r['Team'] == 'Alpha')
    assert (alpha['Bravo'], games['Bravo']) == (2.0, 2.0)
    assert (alpha['Charlie'], games['Charlie']) == (0.0, 2.0)
    assert alpha['Delta'] is None and alpha['Alpha'] is None  # never played


def test_records_leave_out_zero_scores(alltime):
    records = alltime['records']
    worst = records['worst_vs_average'][0]
    assert (worst['season'], worst['team'], worst['score']) == ('2024-25', 'Alpha', 60.0)
    assert all(g['score'] > 0 and g['opp_score'] > 0 for name in ('worst_vs_average', 'blowouts', 'luckiest_wins')
               for g in records[name])
    # Equal values: the older game first
    assert [(g['season'], g['team']) for g in records['highest_scores'][:2]] == [('2024-25', 'Alpha'), ('2025-26', 'Alpha')]


def test_season_records_only_count_seasons_that_are_over(alltime):
    assert {s['season'] for s in alltime['records']['best_seasons']} == {'2024-25'}
    assert alltime['records']['best_seasons'][0]['team'] == 'Charlie'


def test_streaks_name_their_season(alltime):
    # Charlie won both periods in both seasons; equal lengths: the newer season first
    assert [(s['season'], s['team'], s['length']) for s in alltime['records']['win_streaks'][:2]] == [
        ('2025-26', 'Charlie', 2), ('2024-25', 'Charlie', 2)]
