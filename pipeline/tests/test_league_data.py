"""
Tests for league_data on a tiny hand-checked league.

Fixture (tests/fixtures/games.csv), 4 teams over 2 scoring periods:
    Period 1: Alpha 100 - 90 Bravo,   Charlie 80 - 70 Delta
    Period 2: Alpha  60 - 95 Charlie, Bravo   85 - 85 Delta (tie)
The last row is blank, like trailing empty rows in the Google Sheet.
"""
import json
from pathlib import Path

import pytest

from build_data import to_json
from league_data import compute_all, load_games

FIXTURE = Path(__file__).parent / 'fixtures' / 'games.csv'


@pytest.fixture(scope='module')
def data():
    return compute_all(load_games(FIXTURE))


def by_team(rows, key='Team'):
    return {row[key]: row for row in rows}


def test_load_games_skips_blank_rows():
    assert len(load_games(FIXTURE)) == 4


def test_load_games_strips_team_names(tmp_path):
    padded = tmp_path / 'padded.csv'
    padded.write_text(FIXTURE.read_text().replace('Alpha,60', 'Alpha ,60'))
    assert set(load_games(padded)['Team']) == {'Alpha', 'Bravo', 'Charlie'}


def test_all_play_win_rates(data):
    # Share of weeks a team outscored each other team (ties count half)
    matrix = by_team(data['strength']['matrix'])
    assert matrix['Alpha']['Bravo'] == 0.5      # beat 90, lost to 85
    assert matrix['Bravo']['Delta'] == 0.75     # beat 70, tied 85
    assert matrix['Charlie']['Delta'] == 1.0
    assert matrix['Delta']['Charlie'] == 0.0
    assert matrix['Alpha']['Alpha'] == -1       # no self-comparison


def test_strength_and_rank(data):
    matrix = by_team(data['strength']['matrix'])
    assert matrix['Charlie']['Strength'] == pytest.approx(2 / 3)
    assert matrix['Bravo']['Strength'] == pytest.approx(1.75 / 3)
    assert matrix['Alpha']['Strength'] == pytest.approx(0.5)
    assert matrix['Delta']['Strength'] == pytest.approx(0.25)
    assert [matrix[t]['Rank'] for t in ['Charlie', 'Bravo', 'Alpha', 'Delta']] == [1, 2, 3, 4]


def test_head_to_head(data):
    wins = by_team(data['strength']['matrix_wins'])
    games = by_team(data['strength']['matrix_games'])
    assert wins['Alpha']['Bravo'] == 1 and games['Alpha']['Bravo'] == 1
    assert wins['Alpha']['Charlie'] == 0 and games['Alpha']['Charlie'] == 1
    assert wins['Bravo']['Delta'] == 0.5                                  # tie
    assert wins['Alpha']['Delta'] == -1 and games['Alpha']['Delta'] == 0  # never played


def test_schedule_luck(data):
    # Actual head-to-head wins minus all-play expected wins, over opponents played
    matrix = by_team(data['schedule_strength']['matrix'])
    assert matrix['Alpha']['Strength'] == pytest.approx(0.0)    # +0.5 vs Bravo, -0.5 vs Charlie
    assert matrix['Bravo']['Strength'] == pytest.approx(-0.75)  # -0.5 vs Alpha, -0.25 vs Delta
    assert matrix['Charlie']['Strength'] == pytest.approx(0.5)
    assert matrix['Delta']['Strength'] == pytest.approx(0.25)
    assert matrix['Charlie']['Rank'] == 1 and matrix['Bravo']['Rank'] == 4


def test_points_for_against(data):
    scores = by_team(data['for_against']['df_scores'], key='Team')
    assert scores['Alpha']['Scored For'] == 160 and scores['Alpha']['Scored Against'] == 185
    assert scores['Delta']['Scored For'] == 155 and scores['Delta']['Scored Against'] == 165
    assert data['for_against']['median_scored_for'] == 167.5


def test_output_keys_are_clean(data):
    # The sheet's headers have trailing spaces ('Team1 '); none may leak into the JSON
    def keys(value):
        if isinstance(value, dict):
            for key, child in value.items():
                yield key
                yield from keys(child)
        elif isinstance(value, list):
            for child in value:
                yield from keys(child)

    assert all(key == key.strip() for key in keys(data))
    for name in ['matrix', 'matrix_wins', 'matrix_games']:
        assert {row['Team'] for row in data['strength'][name]} == {'Alpha', 'Bravo', 'Charlie', 'Delta'}


def test_output_is_valid_json(data):
    for dataset in data.values():
        json.loads(to_json(dataset))  # raises on NaN or non-serializable values


def test_wrong_column_count_fails_clearly(tmp_path):
    bad = tmp_path / 'bad.csv'
    bad.write_text('Team1,Score1\nAlpha,100\n')
    with pytest.raises(ValueError, match='Expected 12 columns'):
        load_games(bad)
