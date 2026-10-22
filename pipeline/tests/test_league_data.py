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

from build_data import build, to_json
from league_data import compute_league, load_games, sheet_csv_url

FIXTURE = Path(__file__).parent / 'fixtures' / 'games.csv'


@pytest.fixture(scope='module')
def data():
    return compute_league(load_games(FIXTURE))


def by_team(rows, key='Team'):
    return {row[key]: row for row in rows}


def test_load_games_skips_blank_rows():
    assert len(load_games(FIXTURE)) == 4


def test_load_games_strips_team_names(tmp_path):
    padded = tmp_path / 'padded.csv'
    padded.write_text(FIXTURE.read_text().replace('Alpha,60', 'Alpha ,60'))
    assert set(load_games(padded)['Team']) == {'Alpha', 'Bravo', 'Charlie'}


def test_load_games_skips_unplayed_games(tmp_path):
    # A new season's sheet may list the schedule before the scores are in
    scheduled = tmp_path / 'scheduled.csv'
    scheduled.write_text(FIXTURE.read_text() + 'Alpha,,Delta,,Scoring Period 3,3,,,,,,\n')
    assert len(load_games(scheduled)) == 4


def test_sheet_csv_url():
    sheet_id = '1gzQTlP9P4LtWXPgZOOAPsDsxAYbO70eCcHxyHmsl794'
    expected = f'https://docs.google.com/spreadsheets/d/{sheet_id}/gviz/tq?tqx=out:csv&sheet=DATA'
    assert sheet_csv_url(f'https://docs.google.com/spreadsheets/d/{sheet_id}/edit?gid=0#gid=0') == expected
    assert sheet_csv_url(sheet_id) == expected
    assert sheet_csv_url(expected) == expected
    assert sheet_csv_url('tests/fixtures/games.csv') == 'tests/fixtures/games.csv'


def test_all_play_win_rates(data):
    # Share of periods a team outscored each other team (ties count half)
    matrix = by_team(data['matchups']['all_play'])
    assert matrix['Alpha']['Bravo'] == 0.5      # beat 90, lost to 85
    assert matrix['Bravo']['Delta'] == 0.75     # beat 70, tied 85
    assert matrix['Charlie']['Delta'] == 1.0
    assert matrix['Delta']['Charlie'] == 0.0
    assert matrix['Alpha']['Alpha'] is None     # no self-comparison


def test_head_to_head(data):
    wins = by_team(data['matchups']['wins'])
    games = by_team(data['matchups']['games'])
    assert wins['Alpha']['Bravo'] == 1 and games['Alpha']['Bravo'] == 1
    assert wins['Alpha']['Charlie'] == 0 and games['Alpha']['Charlie'] == 1
    assert wins['Bravo']['Delta'] == 0.5                                  # tie
    assert wins['Alpha']['Delta'] is None and games['Alpha']['Delta'] is None  # never played


def test_schedule_luck(data):
    # Actual head-to-head wins minus all-play expected wins, over opponents played
    matrix = by_team(data['matchups']['luck'])
    assert matrix['Alpha']['Bravo'] == 0.5 and matrix['Alpha']['Charlie'] == -0.5
    assert matrix['Bravo']['Alpha'] == -0.5 and matrix['Bravo']['Delta'] == -0.25
    luck = {team['team']: team['luck'] for team in data['teams']}
    assert luck == pytest.approx({'Alpha': 0, 'Bravo': -0.75, 'Charlie': 0.5, 'Delta': 0.25})


def test_schedule_luck_counts_rematches(tmp_path):
    # Period 3 adds rematches: Alpha 50 - 40 Bravo, Charlie 30 - 20 Delta
    rematch = tmp_path / 'rematch.csv'
    rematch.write_text(FIXTURE.read_text().replace(
        ',,,,,,,,,,,', 'Alpha,50,Bravo,40,Scoring Period 3,3,W,Alpha,Bravo,,,\n'
                       'Charlie,30,Delta,20,Scoring Period 3,3,W,Charlie,Delta,,,'))
    luck = {team['team']: team['luck'] for team in compute_league(load_games(rematch))['teams']}
    # Bravo vs Alpha: all-play 1/3, lost both games: 0 - 2 x 1/3.
    # Bravo vs Delta: all-play 2.5/3, tied once: 0.5 - 2.5/3. Total -1.
    assert luck['Bravo'] == pytest.approx(-1, abs=0.01)
    assert luck['Charlie'] == pytest.approx(2 / 3, abs=0.01)
    assert sum(luck.values()) == pytest.approx(0, abs=0.02)


def test_matrix_gaps_are_null(data):
    # Only pairs that never played (and a team against itself) are null; a real
    # value such as a luck of exactly -1.0 must never be mistaken for a gap
    games = by_team(data['matchups']['games'])
    for name in ['luck', 'wins', 'games']:
        for row in data['matchups'][name]:
            for opponent, value in row.items():
                if opponent == 'Team':
                    continue
                played = opponent != row['Team'] and (games[row['Team']][opponent] or 0) > 0
                assert (value is not None) == played, (name, row['Team'], opponent)


def test_luck_sums_to_zero(data):
    assert sum(team['luck'] for team in data['teams']) == pytest.approx(0)


def test_luck_to_date(data):
    luck = {(r['period'], r['team']): r['luck_to_date'] for r in data['results']}
    # Period 1: both winners had the higher score, so nobody was lucky yet
    assert [luck[(1, team)] for team in ['Alpha', 'Bravo', 'Charlie', 'Delta']] == [0, 0, 0, 0]
    # The last period is the season luck, and every period sums to zero
    for team in data['teams']:
        assert luck[(2, team['team'])] == pytest.approx(team['luck'])
    for period in [1, 2]:
        assert sum(v for (p, _), v in luck.items() if p == period) == pytest.approx(0)


def test_points_for_against(data):
    teams = by_team(data['teams'], key='team')
    assert teams['Alpha']['points_for'] == 160 and teams['Alpha']['points_against'] == 185
    assert teams['Delta']['points_for'] == 155 and teams['Delta']['points_against'] == 165


def test_team_records(data):
    # Actual W-L (a tie is half a win and half a loss) and all-play W-L over both periods
    teams = by_team(data['teams'], key='team')
    assert (teams['Alpha']['wins'], teams['Alpha']['losses']) == (1, 1)
    assert (teams['Bravo']['wins'], teams['Bravo']['losses']) == (0.5, 1.5)
    assert (teams['Charlie']['wins'], teams['Charlie']['losses']) == (2, 0)
    assert (teams['Alpha']['all_play_wins'], teams['Alpha']['all_play_losses']) == (3, 3)
    assert (teams['Bravo']['all_play_wins'], teams['Bravo']['all_play_losses']) == (3.5, 2.5)
    assert (teams['Delta']['all_play_wins'], teams['Delta']['all_play_losses']) == (1.5, 4.5)
    assert teams['Bravo']['points_for'] == 175 and teams['Bravo']['points_against'] == 185
    assert teams['Bravo']['luck'] == pytest.approx(-0.75)


def test_all_play_record_matches_matrix(data):
    # Every team plays every period, so all-play win % is the mean of its matrix row
    matrix = by_team(data['matchups']['all_play'])
    for team in data['teams']:
        row = [v for k, v in matrix[team['team']].items() if k != 'Team' and v is not None]
        win_pct = team['all_play_wins'] / (team['all_play_wins'] + team['all_play_losses'])
        assert win_pct == pytest.approx(sum(row) / len(row), abs=0.01)


def test_period_results(data):
    results = {(r['period'], r['team']): r for r in data['results']}
    assert len(results) == 8  # 4 teams x 2 periods
    alpha = results[(2, 'Alpha')]
    assert (alpha['score'], alpha['opponent'], alpha['opp_score'], alpha['win']) == (60, 'Charlie', 95, 0)
    assert (alpha['all_play_wins'], alpha['all_play_losses']) == (0, 3)
    assert results[(1, 'Alpha')]['all_play_wins'] == 3
    # Period 2: Bravo and Delta tie at 85, both beat Alpha and lose to Charlie
    assert results[(2, 'Delta')]['win'] == 0.5
    assert (results[(2, 'Delta')]['all_play_wins'], results[(2, 'Delta')]['all_play_losses']) == (1.5, 1.5)
    assert data['meta'] == {'games': 4, 'latest_period': 2}


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
    assert data['matchups']['teams'] == ['Alpha', 'Bravo', 'Charlie', 'Delta']
    for name in ['all_play', 'wins', 'games', 'luck']:
        assert [row['Team'] for row in data['matchups'][name]] == data['matchups']['teams']


def test_output_is_valid_json(data):
    json.loads(to_json(data))  # raises on NaN or non-serializable values


def test_wrong_column_count_fails_clearly(tmp_path):
    bad = tmp_path / 'bad.csv'
    bad.write_text('Team1,Score1\nAlpha,100\n')
    with pytest.raises(ValueError, match='Expected 12 columns'):
        load_games(bad)


def test_build_writes_only_when_data_changes(tmp_path):
    assert build(FIXTURE, tmp_path).startswith('Updated')
    first = (tmp_path / 'league.json').read_text()
    assert 'updated_at' in json.loads(first)['meta']

    assert build(FIXTURE, tmp_path).startswith('No changes')
    assert (tmp_path / 'league.json').read_text() == first  # same update time

    changed = tmp_path / 'changed.csv'
    changed.write_text(FIXTURE.read_text().replace('Alpha,60', 'Alpha,61'))
    assert build(changed, tmp_path).startswith('Updated')


def test_build_keeps_data_when_sheet_has_no_games(tmp_path):
    # e.g. a new season's sheet before the first period is played
    build(FIXTURE, tmp_path)
    before = (tmp_path / 'league.json').read_text()
    empty = tmp_path / 'empty.csv'
    empty.write_text(FIXTURE.read_text().splitlines()[0] + '\n')
    assert build(empty, tmp_path).startswith('No played games')
    assert (tmp_path / 'league.json').read_text() == before
