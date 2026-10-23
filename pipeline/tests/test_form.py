"""
Tests for form.py on a hand-checked league: 4 teams, 3 periods, with top 2
(not 7), a decay of 0.5 and the last 2 periods as "recent", so every number
is easy to work out.

Scores (period rank):
    P1: A 100 (1)  B 90 (2)  C 80 (3)  D 70 (4)
    P2: A 60 (4)   B 95 (1)  C 95 (1)  D 85 (3)
    P3: A 70 (3)   B 50 (4)  C 90 (1)  D 80 (2)
Weights: P1 0.25, P2 0.5, P3 1.
"""
from pathlib import Path

import pandas as pd
import pytest

from form import compute_form
from league_data import SWAPPED_COLUMNS, compute_league, compute_results, load_games

GAMES = pd.DataFrame([
    ('A', 100.0, 'B', 90.0, 1), ('C', 80.0, 'D', 70.0, 1),
    ('A', 60.0, 'C', 95.0, 2), ('B', 95.0, 'D', 85.0, 2),
    ('A', 70.0, 'D', 80.0, 3), ('B', 50.0, 'C', 90.0, 3),
], columns=['Team', 'Score', 'Opponent', 'OppScore', 'Match'])
# The other columns of the games table, which form doesn't use
GAMES = GAMES.assign(Period='', Result='', Winner='', Loser='')[SWAPPED_COLUMNS[2:4] + SWAPPED_COLUMNS[:2] + SWAPPED_COLUMNS[4:]]


@pytest.fixture
def form():
    teams = compute_form(compute_results(GAMES), top_x=2, decay=0.5, recent_periods=2)['teams']
    return {t['team']: t for t in teams}


def test_top_finishes(form):
    # Top 2: P1 A, B; P2 B, C (tied first); P3 C, D
    assert {t: f['top_finishes'] for t, f in form.items()} == {'A': 1, 'B': 2, 'C': 2, 'D': 1}
    assert {t: f['weighted_top_finishes'] for t, f in form.items()} == {'A': 0.25, 'B': 0.75, 'C': 1.5, 'D': 1.0}


def test_elite_score(form):
    # 2 points for the best score, 1 for the second; 0 after
    assert {t: f['elite_score'] for t, f in form.items()} == {'A': 0.5, 'B': 1.25, 'C': 3.0, 'D': 1.0}


def test_recent_all_play(form):
    # P2-P3, 6 all-play games each; B and C tied in P2 (half a win each)
    assert {t: f['recent_all_play_pct'] for t, f in form.items()} == {'A': 0.167, 'B': 0.417, 'C': 0.917, 'D': 0.5}


def test_form_rank_and_order(form):
    # Average rank: C 1, D (2+3+2)/3, B (3+2+3)/3, A 4
    assert list(form) == ['C', 'D', 'B', 'A']
    assert [f['form_rank'] for f in form.values()] == [1, 2, 3, 4]
    assert form['A']['finishes'] == [{'period': 1, 'rank': 1}, {'period': 2, 'rank': 4}, {'period': 3, 'rank': 3}]


def test_league_has_form():
    league = compute_league(load_games(Path(__file__).parent / 'fixtures' / 'games.csv'))
    assert league['form']['top_x'] == 7
    assert len(league['form']['teams']) == len(league['teams'])
