"""
Form: which teams score near the top of the league lately (from the
`playoff_strength_analyzer` notebook in fantrax_summary_app).

Each period, the teams are ranked by score (1 = the period's best score; equal
scores share the better rank). From those ranks:
- top finishes: periods with a top-7 score;
- elite score: 7 points for the period's best score, down to 1 for the 7th;
- recent all-play: the all-play win rate over the last 5 periods.
The first two are weighted toward recent periods: a period n periods back
counts 0.9^n. The form rank averages the ranks of the weighted top finishes,
the weighted elite score and the recent all-play rate.
"""
import pandas as pd

TOP_X = 7
DECAY = 0.9
RECENT_PERIODS = 5
# Ranks shown per team, the latest last
SHOWN_PERIODS = 8


def _rank(values: pd.Series) -> pd.Series:
    """1 = highest; equal values share the better rank."""
    return values.rank(method='min', ascending=False).astype(int)


def compute_form(results: pd.DataFrame, top_x: int = TOP_X, decay: float = DECAY,
                 recent_periods: int = RECENT_PERIODS) -> dict:
    """The form block of a season file, from compute_results() rows (one per team per period)."""
    df = results[['Match', 'Team', 'Score', 'AllPlayWins', 'AllPlayLosses']].copy()
    latest = int(df['Match'].max())
    df['PeriodRank'] = df.groupby('Match')['Score'].transform(_rank)
    df['Weight'] = decay ** (latest - df['Match'])
    df['Top'] = df['PeriodRank'] <= top_x
    df['Points'] = (top_x + 1 - df['PeriodRank']).clip(lower=0)
    recent = df[df['Match'] > latest - recent_periods]

    teams = pd.DataFrame({
        'top_finishes': df.groupby('Team')['Top'].sum(),
        'periods': df.groupby('Team')['Match'].count(),
        'weighted_top_finishes': (df['Top'] * df['Weight']).groupby(df['Team']).sum(),
        'elite_score': (df['Points'] * df['Weight']).groupby(df['Team']).sum(),
        'recent_all_play_pct': recent.groupby('Team')['AllPlayWins'].sum()
                               / recent.groupby('Team')[['AllPlayWins', 'AllPlayLosses']].sum().sum(axis=1),
    })
    teams['recent_all_play_pct'] = teams['recent_all_play_pct'].fillna(0)  # no game in the recent periods
    composite = (_rank(teams['weighted_top_finishes']) + _rank(teams['elite_score'])
                 + _rank(teams['recent_all_play_pct'])) / 3
    teams['form_rank'] = composite.rank(method='min').astype(int)
    # Equal composites: the better elite score first
    teams = teams.assign(_c=composite).sort_values(['_c', 'elite_score'], ascending=[True, False])

    finishes = df.sort_values('Match').groupby('Team')
    return {
        'top_x': top_x,
        'decay': decay,
        'recent_periods': recent_periods,
        'teams': [{
            'team': team,
            'form_rank': int(row.form_rank),
            'top_finishes': int(row.top_finishes),
            'periods': int(row.periods),
            'weighted_top_finishes': round(float(row.weighted_top_finishes), 2),
            'elite_score': round(float(row.elite_score), 2),
            'recent_all_play_pct': round(float(row.recent_all_play_pct), 3),
            'finishes': [{'period': int(r.Match), 'rank': int(r.PeriodRank)}
                         for r in finishes.get_group(team).tail(SHOWN_PERIODS).itertuples()],
        } for team, row in teams.iterrows()],
    }
