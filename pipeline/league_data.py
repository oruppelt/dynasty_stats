"""
League data computation.

Reads the games sheet once and computes every dataset the frontend needs.
Pure functions only: no web server, no caching. `build_data.py` runs this
and writes the results as static JSON for the site.

Everything is published as one payload (`compute_league`): season totals per
team, one row per team per period, and the team-vs-team matrices. Matrix rows
name their team under 'Team'; every other key is an opponent.
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


def _luck_matrix(full: pd.DataFrame) -> pd.DataFrame:
    """Head-to-head wins minus expected wins (all-play win rate x games played)."""
    return _head_to_head_wins(full) - _all_play_win_rates(full) * _head_to_head_games(full)


def compute_luck_to_date(games: pd.DataFrame) -> pd.DataFrame:
    """Each team's total luck through each scoring period (columns Match, Team, LuckToDate).

    Uses only the games played so far, so the last period matches the season luck.
    """
    full = _both_sides(games)
    rows = []
    for period in sorted(full['Match'].unique()):
        luck = _luck_matrix(full[full['Match'] <= period]).sum(axis=1)
        rows += [{'Match': period, 'Team': team, 'LuckToDate': value} for team, value in luck.items()]
    return pd.DataFrame(rows)


def _matrix_records(df: pd.DataFrame) -> list[dict]:
    """Matrix rows as dicts; a gap (never played, or the team itself) becomes None, i.e. null in JSON."""
    return [{key: None if isinstance(value, float) and np.isnan(value) else value for key, value in row.items()}
            for row in df.reset_index().to_dict('records')]


def compute_matchups(games: pd.DataFrame) -> dict:
    """Team-vs-team matrices, each a row per team with one value per opponent.

    - all_play: share of periods the row team outscored that opponent
    - wins / games: actual head-to-head wins (a tie counts half) and games
    - luck: head-to-head wins minus expected wins (all_play x games), so a
      rematch counts twice. Every game hands out one win and one expected win
      in total, so luck sums to zero across the league.
    A team against itself, or a pair that never played (for wins, games and
    luck), is null.
    """
    full = _both_sides(games)
    teams = sorted(full['Team'].unique())

    def rows(df: pd.DataFrame, decimals: int | None = None) -> list[dict]:
        df = df.reindex(index=teams, columns=teams)
        df.index.name = 'Team'
        return _matrix_records(df if decimals is None else df.round(decimals))

    return {
        "teams": teams,
        "all_play": rows(_all_play_win_rates(full), 2),
        "wins": rows(_head_to_head_wins(full)),
        "games": rows(_head_to_head_games(full)),
        "luck": rows(_luck_matrix(full), 2),
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
    results = compute_results(games).merge(compute_luck_to_date(games), on=['Match', 'Team'], how='left')
    full = _both_sides(games)
    luck = _luck_matrix(full).sum(axis=1).to_dict()

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
            "luck_to_date": round(float(row.LuckToDate), 2),
        } for row in results.itertuples()],
        "matchups": compute_matchups(games),
    }
