"""
The record book: the season's standout games and streaks (regular season).

Scores depend on the period: a period with more NBA games gives bigger scores
(2025-26 period averages ran from 171 to 548; the 11-day All-Star period was
the highest). So besides the raw highs, scores are also compared with the
period's average. Every game entry carries the period average and the
team's all-play count, so the site can show either.
"""
import pandas as pd

TOP_N = 5


def _game(row, period_avg: dict) -> dict:
    return {
        'period': int(row.Match),
        'team': row.Team,
        'score': float(row.Score),
        'opponent': row.Opponent,
        'opp_score': float(row.OppScore),
        'period_avg': round(float(period_avg[row.Match]), 2),
        'all_play_wins': float(row.AllPlayWins),
        'others': int(row.AllPlayWins + row.AllPlayLosses),
    }


def _streaks(results: pd.DataFrame, result: float) -> list[dict]:
    """Every team's runs of consecutive wins (result 1) or losses (0); a tie ends a run."""
    streaks = []
    for team, rows in results.sort_values('Match').groupby('Team'):
        run = []
        for row in rows.itertuples():
            if row.WIN == result:
                run.append(int(row.Match))
                continue
            if run:
                streaks.append({'team': team, 'length': len(run), 'start': run[0], 'end': run[-1]})
            run = []
        if run:
            streaks.append({'team': team, 'length': len(run), 'start': run[0], 'end': run[-1]})
    return streaks


def _top_streaks(streaks: list[dict], top_n: int) -> list[dict]:
    # Longest first; equal lengths: the more recent run first
    return sorted(streaks, key=lambda s: (-s['length'], -s['end'], s['team']))[:top_n]


def compute_records(results: pd.DataFrame, top_n: int = TOP_N) -> dict:
    """Top-`top_n` lists of standout games and streaks.

    `results` is league_data.compute_results(): one row per team per period
    with WIN (1 / 0.5 / 0) and AllPlayWins. A game between two teams is
    listed once, by its winner (by the first team in name order for a tie).
    Equal values: the earlier period first, then by team name.
    """
    period_avg = results.groupby('Match')['Score'].mean().to_dict()
    r = results.assign(
        VsAvg=results['Score'] / results['Match'].map(period_avg),
        Margin=results['Score'] - results['OppScore'],
    ).sort_values(['Match', 'Team'])
    games = r[(r['WIN'] == 1) | ((r['WIN'] == 0.5) & (r['Team'] < r['Opponent']))]
    wins = r[r['WIN'] == 1]
    losses = r[r['WIN'] == 0]

    def top(df: pd.DataFrame, column: str, ascending: bool = False) -> list[dict]:
        rows = df.sort_values(column, ascending=ascending, kind='stable').head(top_n)
        return [_game(row, period_avg) for row in rows.itertuples()]

    period_highs = r[r['Score'] == r['Match'].map(r.groupby('Match')['Score'].max())]
    counts = period_highs.groupby('Team').size().sort_values(ascending=False, kind='stable')

    return {
        'highest_scores': top(r, 'Score'),
        'best_vs_average': top(r, 'VsAvg'),
        'worst_vs_average': top(r, 'VsAvg', ascending=True),
        'blowouts': top(games, 'Margin'),
        'closest_games': top(games, 'Margin', ascending=True),
        # Losses whose score beat the most teams that period; wins whose score beat the fewest
        'unluckiest_losses': top(losses, 'AllPlayWins'),
        'luckiest_wins': top(wins, 'AllPlayWins', ascending=True),
        'win_streaks': _top_streaks(_streaks(r, 1), top_n),
        'losing_streaks': _top_streaks(_streaks(r, 0), top_n),
        # A shared period high counts for each team
        'period_highs': [{'team': team, 'count': int(n)} for team, n in counts.head(top_n).items()],
    }
