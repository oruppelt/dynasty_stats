"""
League data computation.

Reads the games sheet once and computes every dataset the frontend needs.
Pure functions only: no web server, no caching. `build_data.py` runs this
and writes the results as static JSON for the site.

Output shapes match the former FastAPI endpoints (/strength,
/schedule_strength, /for_against), except that matrix rows name their team
under 'Team' (the sheet's own headers, such as 'Team1 ', have trailing spaces).
"""
import numpy as np
import pandas as pd

SHEET_ID = '1gzQTlP9P4LtWXPgZOOAPsDsxAYbO70eCcHxyHmsl794'
DATA_TAB = 'DATA'
SHEET_CSV_URL = f'https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:csv&sheet={DATA_TAB}'

# Sheet columns in order, renamed; the sheet's own headers have trailing spaces
COLUMNS = ['Team', 'Score', 'Opponent', 'OppScore', 'Period', 'Match', 'Result', 'Winner', 'Loser', 'H1', 'H2', 'Color']
UNUSED_COLUMNS = ['Color', 'H1', 'H2']
SWAPPED_COLUMNS = ['Opponent', 'OppScore', 'Team', 'Score', 'Period', 'Match', 'Result', 'Winner', 'Loser']


def load_games(source=SHEET_CSV_URL) -> pd.DataFrame:
    """Read the games sheet (URL or file path) into one row per game."""
    df = pd.read_csv(source)
    if len(df.columns) != len(COLUMNS):
        raise ValueError(f"Expected {len(COLUMNS)} columns in sheet, got {len(df.columns)}: {list(df.columns)}")
    df.columns = COLUMNS
    df = df.drop(columns=UNUSED_COLUMNS)
    df = df[df['Match'].notna()].copy()
    df['Match'] = df['Match'].astype(int)
    for col in ['Team', 'Opponent']:
        df[col] = df[col].str.strip()  # a stray space in the sheet would split a team in two
    return df


def _both_sides(games: pd.DataFrame) -> pd.DataFrame:
    """Each game twice, once from each team's point of view, with WIN = 1 / 0.5 / 0."""
    swapped = games.copy()
    swapped.columns = SWAPPED_COLUMNS
    full = pd.concat([games, swapped], axis=0)
    full['WIN'] = np.where(full['Score'] > full['OppScore'], 1, 0)
    full['WIN'] = np.where(full['Score'] == full['OppScore'], 0.5, full['WIN'])
    return full


def _head_to_head_wins(full: pd.DataFrame) -> pd.DataFrame:
    """Actual wins of each team against each opponent (NaN = never played)."""
    return pd.pivot_table(full, values='WIN', index=['Team'], columns=['Opponent'], aggfunc='sum')


def _all_play_win_rates(full: pd.DataFrame) -> pd.DataFrame:
    """Share of matchweeks in which a team outscored each other team, rounded to 2 decimals."""
    alt = full[['Match', 'Team', 'Score']].copy()
    alt.columns = ['Match', 'Alt_Team', 'Alt_Score']
    merged = full.merge(alt, on='Match', how='inner')
    merged['Alt_WIN'] = np.where(merged['Score'] > merged['Alt_Score'], 1, 0)
    merged['Alt_WIN'] = np.where(merged['Score'] == merged['Alt_Score'], 0.5, merged['Alt_WIN'])
    merged = merged[merged['Team'] != merged['Alt_Team']]

    wins = pd.pivot_table(merged, values='Alt_WIN', index=['Team'], columns=['Alt_Team'], aggfunc='sum')
    counts = pd.pivot_table(merged, values='Alt_WIN', index=['Team'], columns=['Alt_Team'], aggfunc='count')
    return wins.div(counts, axis=1).round(2)


def _with_rank(df: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    """Add Rank by Strength (1 = highest), fill gaps with -1, sort team columns."""
    df['Rank'] = df['Strength'].rank(ascending=False).astype(int)
    df = df.fillna(-1)
    teams = sorted(col for col in df.columns if col not in ['Strength', 'Rank'])
    return df[teams + ['Strength', 'Rank']], teams


def compute_strength(games: pd.DataFrame) -> dict:
    """All-play strength: matrix of all-play win rates and each team's average."""
    full = _both_sides(games)
    h2h_wins = _head_to_head_wins(full)
    h2h_games = pd.pivot_table(full, values='WIN', index=['Team'], columns=['Opponent'], aggfunc='count')

    all_play = _all_play_win_rates(full)
    all_play['Strength'] = all_play.mean(axis=1)
    all_play, teams = _with_rank(all_play)

    max_win_rate = all_play[teams].max().max()
    min_win_rate = all_play[teams].min().min()

    return {
        "teams": teams,
        "matrix": all_play.reset_index().to_dict('records'),
        "matrix_wins": h2h_wins.fillna(-1).reset_index().to_dict('records'),
        "matrix_games": h2h_games.fillna(0).astype(float).reset_index().to_dict('records'),
        "metadata": {
            "maxWinRate": float(max_win_rate),
            "minWinRate": float(min_win_rate),
        },
    }


def compute_schedule_strength(games: pd.DataFrame) -> dict:
    """Schedule luck: actual head-to-head wins minus all-play expected wins."""
    full = _both_sides(games)
    h2h_wins = _head_to_head_wins(full)
    all_play = _all_play_win_rates(full)

    luck = h2h_wins - all_play
    luck['Strength'] = luck.sum(axis=1)
    luck, teams = _with_rank(luck)

    return {
        "teams": teams,
        "matrix": luck.reset_index().to_dict('records'),
        "matrix_wins": h2h_wins.fillna(-1).reset_index().to_dict('records'),
    }


def compute_for_against(games: pd.DataFrame) -> dict:
    """Total points scored and conceded per team."""
    full = _both_sides(games)
    scores = full.groupby(['Team'])[['Score', 'OppScore']].sum().reset_index()
    scores.columns = ['Team', 'Scored For', 'Scored Against']

    return {
        "df_scores": scores.to_dict('records'),
        "median_scored_for": float(np.median(scores['Scored For'])),
        "median_scored_against": float(np.median(scores['Scored Against'])),
    }


def compute_all(games: pd.DataFrame) -> dict[str, dict]:
    """Every dataset, keyed by the JSON file name it is published as."""
    return {
        "strength": compute_strength(games),
        "schedule_strength": compute_schedule_strength(games),
        "for_against": compute_for_against(games),
    }
