"""
The playoffs: the Swiss stage and the knockout (rules in LEAGUE.md).

Works from the played playoff games alone, so a season in progress works too:
a game is part of the Swiss stage while both teams are still playing it (fewer
than 3 wins and 3 losses); once every team is through or out, the games that
follow are the knockout, where each pairing is a best-of-3 series.
Seeds come from the regular-season standings: win rate, then points for (the
same order as the site's standings).
"""
import pandas as pd

PLAYOFF_TEAMS = 16
SWISS_WINS = 3    # through to the knockout
SWISS_LOSSES = 3  # out
SERIES_WINS = 2   # best of 3
ROUND_NAMES = {8: 'Quarterfinals', 4: 'Semifinals', 2: 'Final'}


def seeds(teams: list[dict]) -> dict[str, int]:
    """Regular-season rank of every team (1 = best), from compute_teams() rows."""
    order = sorted(teams, key=lambda t: (-t['wins'] / t['games'], -t['points_for'], t['team']))
    return {t['team']: i for i, t in enumerate(order, 1)}


def _game(row) -> dict:
    return {'team': row.Team, 'score': float(row.Score), 'opponent': row.Opponent, 'opp_score': float(row.OppScore)}


def _winner(row) -> str | None:
    if row.Score == row.OppScore:
        return None  # how a playoff tie is broken is still to confirm (LEAGUE.md)
    return row.Team if row.Score > row.OppScore else row.Opponent


def compute_playoffs(teams: list[dict], games: pd.DataFrame) -> dict | None:
    """The playoffs block of league.json, or None before the first playoff game."""
    if games.empty:
        return None
    seed = seeds(teams)
    record = {team: {'wins': 0, 'losses': 0} for team, s in seed.items() if s <= PLAYOFF_TEAMS}

    def playing(team: str) -> bool:
        r = record[team]
        return r['wins'] < SWISS_WINS and r['losses'] < SWISS_LOSSES

    rounds, knockout_games = [], []
    for period, period_games in games.sort_values(['Match', 'Team']).groupby('Match', sort=True):
        swiss = [g for g in period_games.itertuples() if playing(g.Team) and playing(g.Opponent)]
        if not swiss:
            knockout_games.extend(period_games.itertuples())
            continue
        if len(swiss) != len(period_games):
            raise ValueError(f'Period {period} mixes Swiss games with other games; check the playoff rules.')
        for g in swiss:
            winner = _winner(g)
            for team in (g.Team, g.Opponent):
                if winner:
                    record[team]['wins' if team == winner else 'losses'] += 1
        rounds.append({'round': len(rounds) + 1, 'period': int(period), 'games': [_game(g) for g in swiss]})

    def status(team: str) -> str:
        r = record[team]
        return 'through' if r['wins'] >= SWISS_WINS else 'out' if r['losses'] >= SWISS_LOSSES else 'playing'

    swiss_table = sorted(({'team': team, 'seed': seed[team], **r, 'status': status(team)}
                          for team, r in record.items()),
                         key=lambda t: (-t['wins'], t['losses'], t['seed']))

    # Knockout: each pairing is a series; a team's n-th series is round n
    series: dict[frozenset, dict] = {}
    series_count: dict[str, int] = {}
    for g in knockout_games:
        key = frozenset((g.Team, g.Opponent))
        if key not in series:
            high, low = sorted((g.Team, g.Opponent), key=seed.get)
            number = series_count.get(high, 0) + 1
            series_count[high] = series_count[low] = number
            series[key] = {'round': number, 'teams': [high, low], 'seeds': [seed[high], seed[low]],
                           'wins': [0, 0], 'winner': None, 'games': []}
        s = series[key]
        winner = _winner(g)
        if winner:
            s['wins'][s['teams'].index(winner)] += 1
        s['games'].append({'period': int(g.Match), **_game(g)})
        for i, team in enumerate(s['teams']):
            if s['wins'][i] >= SERIES_WINS:
                s['winner'] = team

    through = sum(1 for t in swiss_table if t['status'] == 'through')
    knockout = []
    for number in sorted({s['round'] for s in series.values()}):
        in_round = [s for s in series.values() if s['round'] == number]
        teams_left = through // 2 ** (number - 1)
        knockout.append({
            'round': number,
            'name': ROUND_NAMES.get(teams_left, f'Round {number}'),
            'series': [{k: v for k, v in s.items() if k != 'round'} for s in sorted(in_round, key=lambda s: s['seeds'][0])],
        })
    final = knockout[-1]['series'] if knockout and knockout[-1]['name'] == 'Final' else []

    return {
        'swiss': {'rounds': rounds, 'standings': swiss_table},
        'knockout': knockout,
        'champion': final[0]['winner'] if final else None,
    }
