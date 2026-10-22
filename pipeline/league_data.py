"""
League data computation.

Reads the games sheet once and computes every dataset the frontend needs.
Pure functions only: no web server, no caching. `build_data.py` runs this
and writes the results as static JSON for the site.

Everything is published as one payload (`compute_league`). Its `strength`,
`schedule_strength` and `for_against` parts keep the shapes of the former
FastAPI endpoints, except that matrix rows name their team under 'Team' (the
sheet's own headers, such as 'Team1 ', have trailing spaces).
"""
import re

import numpy as np
import pandas as pd

# Current season's sheet. A new season's sheet can be set without a code change
# (LEAGUE_SHEET, see build_data.py); it needs the same columns and a DATA tab.
SHEET_ID = '1gzQTlP9P4LtWXPgZOOAPsDsxAYbO70eCcHxyHmsl794'
DATA_TAB = 'DATA'

# Sheet columns in order, renamed; the sheet's own headers have trailing spaces
COLUMNS = ['Team', 'Score', 'Opponent', 'OppScore', 'Period', 'Match', 'Result', 'Winner', 'Loser', 'H1', 'H2', 'Color']
UNUSED_COLUMNS = ['Color', 'H1', 'H2']
SWAPPED_COLUMNS = ['Opponent', 'OppScore', 'Team', 'Score', 'Period', 'Match', 'Result', 'Winner', 'Loser']


def sheet_csv_url(sheet: str) -> str:
    """CSV export URL for a sheet link (as copied from the browser) or sheet ID.

    Anything else (a CSV URL or a file path) is returned as is.
    """
    match = re.search(r'/spreadsheets/d/([\w-]+)', sheet)
    if match:
        sheet = match.group(1)
    elif not re.fullmatch(r'[\w-]{30,}', sheet):
        return sheet
    return f'https://docs.google.com/spreadsheets/d/{sheet}/gviz/tq?tqx=out:csv&sheet={DATA_TAB}'


SHEET_CSV_URL = sheet_csv_url(SHEET_ID)


def load_games(source=SHEET_CSV_URL) -> pd.DataFrame:
    """Read the games sheet (URL or file path) into one row per played game.

    Rows without a period or without both scores (blank rows, or games that are
    scheduled but not played yet) are skipped.
    """
    df = pd.read_csv(source)
    if len(df.columns) != len(COLUMNS):
        raise ValueError(f"Expected {len(COLUMNS)} columns in sheet, got {len(df.columns)}: {list(df.columns)}")
    df.columns = COLUMNS
    df = df.drop(columns=UNUSED_COLUMNS)
    df = df[df['Match'].notna() & df['Score'].notna() & df['OppScore'].notna()].copy()
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


def _head_to_head_games(full: pd.DataFrame) -> pd.DataFrame:
    """Games each team played against each opponent (NaN = never played)."""
    return pd.pivot_table(full, values='WIN', index=['Team'], columns=['Opponent'], aggfunc='count')


def _all_play_win_rates(full: pd.DataFrame) -> pd.DataFrame:
    """Share of scoring periods in which a team outscored each other team."""
    alt = full[['Match', 'Team', 'Score']].copy()
    alt.columns = ['Match', 'Alt_Team', 'Alt_Score']
    merged = full.merge(alt, on='Match', how='inner')
    merged['Alt_WIN'] = np.where(merged['Score'] > merged['Alt_Score'], 1, 0)
    merged['Alt_WIN'] = np.where(merged['Score'] == merged['Alt_Score'], 0.5, merged['Alt_WIN'])
    merged = merged[merged['Team'] != merged['Alt_Team']]

    wins = pd.pivot_table(merged, values='Alt_WIN', index=['Team'], columns=['Alt_Team'], aggfunc='sum')
    counts = pd.pivot_table(merged, values='Alt_WIN', index=['Team'], columns=['Alt_Team'], aggfunc='count')
    return wins.div(counts, axis=1)


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
    h2h_games = _head_to_head_games(full)

    all_play = _all_play_win_rates(full)
    all_play['Strength'] = all_play.mean(axis=1)
    all_play, teams = _with_rank(all_play)
    all_play[teams] = all_play[teams].round(2)  # matrix cells are for display; Strength stays exact

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
    """Schedule luck: actual head-to-head wins minus all-play expected wins.

    Expected wins against an opponent = all-play win rate against them x games
    played against them, so a rematch counts twice. Every game hands out one
    win and one expected win in total, so luck sums to zero across the league.
    """
    full = _both_sides(games)
    h2h_wins = _head_to_head_wins(full)
    expected = _all_play_win_rates(full) * _head_to_head_games(full)

    luck = h2h_wins - expected
    luck['Strength'] = luck.sum(axis=1)
    luck, teams = _with_rank(luck)
    luck[teams + ['Strength']] = luck[teams + ['Strength']].round(2)

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


def compute_results(games: pd.DataFrame) -> pd.DataFrame:
    """One row per team per scoring period: the game, and the team's all-play record that period.

    WIN and the all-play wins count a tie as half a win (and half a loss).
    """
    full = _both_sides(games).reset_index(drop=True)
    by_period = full.groupby('Match')['Score']
    # Average rank - 1 = teams outscored that period, plus half of those tied with
    full['AllPlayWins'] = by_period.rank(method='average') - 1
    full['AllPlayLosses'] = by_period.transform('count') - 1 - full['AllPlayWins']
    return full.sort_values(['Match', 'Team']).reset_index(drop=True)


def compute_teams(results: pd.DataFrame, luck: dict[str, float]) -> list[dict]:
    """Season totals per team: actual and all-play W-L, points, luck."""
    totals = results.groupby('Team').agg(
        games=('WIN', 'count'),
        wins=('WIN', 'sum'),
        all_play_wins=('AllPlayWins', 'sum'),
        all_play_losses=('AllPlayLosses', 'sum'),
        points_for=('Score', 'sum'),
        points_against=('OppScore', 'sum'),
    )
    return [{
        "team": team,
        "games": int(row.games),
        "wins": float(row.wins),
        "losses": float(row.games - row.wins),
        "all_play_wins": float(row.all_play_wins),
        "all_play_losses": float(row.all_play_losses),
        "points_for": round(float(row.points_for), 2),
        "points_against": round(float(row.points_against), 2),
        "luck": round(float(luck[team]), 2),
    } for team, row in totals.iterrows()]


def compute_league(games: pd.DataFrame) -> dict:
    """The site's whole payload (league.json), apart from the update time."""
    strength = compute_strength(games)
    schedule_strength = compute_schedule_strength(games)
    results = compute_results(games)
    luck = {row['Team']: row['Strength'] for row in schedule_strength['matrix']}

    return {
        "meta": {
            "games": len(games),
            "latest_period": int(games['Match'].max()),
        },
        "teams": compute_teams(results, luck),
        "results": [{
            "period": int(row.Match),
            "team": row.Team,
            "score": float(row.Score),
            "opponent": row.Opponent,
            "opp_score": float(row.OppScore),
            "win": float(row.WIN),
            "all_play_wins": float(row.AllPlayWins),
            "all_play_losses": float(row.AllPlayLosses),
        } for row in results.itertuples()],
        "strength": strength,
        "schedule_strength": schedule_strength,
        "for_against": compute_for_against(games),
    }
