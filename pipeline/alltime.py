"""
All-time: every season together (the site's History section).

Works from the season files build_data.py wrote, so it needs no Fantrax
calls and is rebuilt on every run. Seasons differ in length (30 to 33
regular-season periods) and scoring, so the comparisons use rates: win
rate, all-play rate, and the score index (a score divided by its period's
average, so 1.10 is 10% above the league that period). Like the season
stats, everything but the titles and playoff finishes is regular season.
The game records (not the streaks) leave out games with a 0 score (see _scored).

A season still in progress counts in the career totals and the game
records, but not in the season records (a few games' win rate would top
them) or the playoff finishes.
"""
import pandas as pd

from playoffs import seeds
from records import compute_records, top_period_counts

TOP_N = 10
# Best first. "swiss": out in the Swiss stage; "round1": out in an earlier format's first knockout round;
# "playoffs": made an earlier format's playoffs, round not known
FINISHES = ['champion', 'final', 'semifinal', 'quarterfinal', 'swiss', 'round1', 'playoffs', 'missed']
ROUND_FINISH = {'Final': 'final', 'Semifinals': 'semifinal', 'Quarterfinals': 'quarterfinal'}
# An earlier format's knockout round, by the teams in it
TEAMS_FINISH = {16: 'round1', 8: 'quarterfinal', 4: 'semifinal', 2: 'final'}
GAME_LISTS = {
    # list: sort key of one entry, best first
    'highest_scores': lambda g: -g['score'],
    'best_vs_average': lambda g: -g['score'] / g['period_avg'],
    'worst_vs_average': lambda g: g['score'] / g['period_avg'],
    'blowouts': lambda g: g['opp_score'] - g['score'],
    'unluckiest_losses': lambda g: -g['all_play_wins'],
    'luckiest_wins': lambda g: g['all_play_wins'],
}


def _results(data: dict) -> pd.DataFrame:
    """A season file's results as league_data.compute_results() makes them."""
    return pd.DataFrame(data['results']).rename(columns={
        'period': 'Match', 'team': 'Team', 'score': 'Score', 'opponent': 'Opponent', 'opp_score': 'OppScore',
        'win': 'WIN', 'all_play_wins': 'AllPlayWins', 'all_play_losses': 'AllPlayLosses'})


def _scored(results: pd.DataFrame) -> pd.DataFrame:
    """Leave out games with a 0 score: Fantrax re-scores old games with today's roster rules, so a lineup
    legal at the time can now score 0 (LEAGUE.md). They would top the lowest scores and the blowouts."""
    return results[(results['Score'] > 0) & (results['OppScore'] > 0)]


def _score_index(results: pd.DataFrame) -> pd.Series:
    """Each game's score divided by its period's average."""
    return results['Score'] / results.groupby('Match')['Score'].transform('mean')


def playoff_finishes(data: dict, settings: dict) -> dict[str, str] | None:
    """How far each team went in the playoffs (FINISHES), or None while the season is in progress."""
    if not settings.get('final'):
        return None
    finish = {team: 'missed' for team in data['matchups']['teams']}
    playoffs = data.get('playoffs')
    if playoffs:
        for t in playoffs['swiss']['standings']:
            finish[t['team']] = 'swiss'
        for knockout_round in playoffs['knockout']:
            for s in knockout_round['series']:
                for team in s['teams']:
                    finish[team] = ROUND_FINISH.get(knockout_round['name'], 'quarterfinal')
        if playoffs['champion']:
            finish[playoffs['champion']] = 'champion'
    else:
        finish.update(knockout_rounds(data.get('playoff_games') or []))
    # An earlier format's champion and runner-up, from seasons.json
    if settings.get('runner_up'):
        finish[settings['runner_up']] = 'final'
    if settings.get('champion'):
        finish[settings['champion']] = 'champion'
    return finish


def knockout_rounds(games: list[dict]) -> dict[str, str]:
    """The last round each team reached in an earlier format's knockout (best-of-3 series, 2019-20 and 2020-21).

    A team's game against the opponent of its current series continues that
    series; any other opponent starts its next one. A round is named by the
    teams in it (16: round 1, 8: quarterfinals, ...). If the rounds don't add
    up to a bracket, every team that played is just marked "playoffs".
    """
    opponent: dict[str, str] = {}
    reached: dict[str, int] = {}  # team: its last round
    series_rounds: dict[frozenset, int] = {}
    for g in sorted(games, key=lambda g: g['period']):
        a, b = g['team'], g['opponent']
        if opponent.get(a) == b and opponent.get(b) == a:
            continue
        number = max(reached.get(a, 0), reached.get(b, 0)) + 1
        opponent[a], opponent[b] = b, a
        reached[a] = reached[b] = number
        series_rounds[frozenset((a, b))] = number
    in_round = {n: 2 * sum(1 for r in series_rounds.values() if r == n) for n in set(series_rounds.values())}
    if any(teams not in TEAMS_FINISH for teams in in_round.values()):
        return {team: 'playoffs' for team in reached}
    return {team: TEAMS_FINISH[in_round[n]] for team, n in reached.items()}


def _team_seasons(season: str, data: dict, finishes: dict | None) -> list[dict]:
    results = _results(data)
    index = results.assign(Index=_score_index(results)).groupby('Team')['Index'].mean()
    rank = seeds(data['teams'])
    return [{
        'season': season,
        'team': t['team'],
        'rank': rank[t['team']],
        'games': t['games'],
        'wins': t['wins'],
        'losses': t['losses'],
        'all_play_wins': t['all_play_wins'],
        'all_play_losses': t['all_play_losses'],
        'luck': t['luck'],
        'score_index': round(float(index[t['team']]), 4),
        'finish': finishes[t['team']] if finishes else None,
    } for t in sorted(data['teams'], key=lambda t: rank[t['team']])]


def _franchises(team_seasons: list[dict], results: pd.DataFrame) -> list[dict]:
    index = results.groupby('Team')['Index'].mean()
    out = []
    for team in sorted({s['team'] for s in team_seasons}):
        rows = [s for s in team_seasons if s['team'] == team]
        done = [s for s in rows if s['finish']]
        total = lambda key: float(sum(s[key] for s in rows))  # noqa: E731
        out.append({
            'team': team,
            'seasons': len(rows),
            'games': int(total('games')),
            'wins': total('wins'),
            'losses': total('losses'),
            'all_play_wins': round(total('all_play_wins'), 2),
            'all_play_losses': round(total('all_play_losses'), 2),
            'luck': round(total('luck'), 2),
            'score_index': round(float(index[team]), 4),
            'playoffs': sum(1 for s in done if s['finish'] != 'missed'),
            'finals': sum(1 for s in done if s['finish'] in ('champion', 'final')),
            'titles': sum(1 for s in done if s['finish'] == 'champion'),
            # Regular-season finish, of the seasons that are over
            'best_rank': min((s['rank'] for s in done), default=None),
            'average_rank': round(sum(s['rank'] for s in done) / len(done), 2) if done else None,
        })
    return out


def _playoff_games(data: dict) -> list[dict]:
    playoffs = data.get('playoffs')
    if not playoffs:
        return data.get('playoff_games') or []
    games = [g for r in playoffs['swiss']['rounds'] for g in r['games']]
    return games + [g for r in playoffs['knockout'] for s in r['series'] for g in s['games']]


def _head_to_head(seasons: list[tuple[str, dict]]) -> dict:
    """Career team-vs-team matrices: regular-season wins and games, and the same for playoff games."""
    teams = sorted({t for _, data in seasons for t in data['matchups']['teams']})
    zero = lambda: pd.DataFrame(0.0, index=teams, columns=teams)  # noqa: E731
    wins, games, playoff_wins, playoff_games = zero(), zero(), zero(), zero()
    for _, data in seasons:
        m = data['matchups']
        for w, g in zip(m['wins'], m['games']):
            for opponent in m['teams']:
                if g[opponent] is not None:
                    wins.loc[w['Team'], opponent] += w[opponent]
                    games.loc[w['Team'], opponent] += g[opponent]
        for g in _playoff_games(data):
            win = 1.0 if g['score'] > g['opp_score'] else 0.0 if g['score'] < g['opp_score'] else 0.5
            for team, opponent, w in ((g['team'], g['opponent'], win), (g['opponent'], g['team'], 1 - win)):
                playoff_wins.loc[team, opponent] += w
                playoff_games.loc[team, opponent] += 1

    def rows(matrix: pd.DataFrame, played: pd.DataFrame) -> list[dict]:
        # null = never played (or the team itself), as in the season matrices
        return [{'Team': team, **{o: (float(matrix.loc[team, o]) if played.loc[team, o] else None) for o in teams}}
                for team in teams]

    return {
        'teams': teams,
        'wins': rows(wins, games),
        'games': rows(games, games),
        'playoff_wins': rows(playoff_wins, playoff_games),
        'playoff_games': rows(playoff_games, playoff_games),
    }


def _records(seasons: list[tuple[str, dict]], team_seasons: list[dict], results: pd.DataFrame) -> dict:
    # Each season's top N holds the all-time top N; equal values: the older game first
    # (The streaks keep the 0-score games: their results still stand.)
    oldest_first = list(reversed(seasons))
    per_season = [(season, compute_records(_scored(_results(data)), top_n=TOP_N)) for season, data in oldest_first]
    streaks = [(season, compute_records(_results(data), top_n=TOP_N)) for season, data in oldest_first]
    records = {}
    for name, key in GAME_LISTS.items():
        entries = [{'season': season, **g} for season, r in per_season for g in r[name]]
        records[name] = sorted(entries, key=key)[:TOP_N]
    for name in ('win_streaks', 'losing_streaks'):
        # Equal lengths: the more recent run first, as in a season's record book
        entries = sorted(({'season': season, **s} for season, r in streaks for s in r[name]), key=lambda s: s['team'])
        entries.sort(key=lambda s: (s['season'], s['end']), reverse=True)
        records[name] = sorted(entries, key=lambda s: -s['length'])[:TOP_N]
    records['top5_periods'] = top_period_counts(results, ['Season', 'Match'], TOP_N)

    done = [s for s in team_seasons if s['finish']]
    pct = lambda s: s['wins'] / s['games']  # noqa: E731
    all_play = lambda s: s['all_play_wins'] / (s['all_play_wins'] + s['all_play_losses'])  # noqa: E731
    by = lambda key, best=True: sorted(done, key=lambda s: -key(s) if best else key(s))[:TOP_N]  # noqa: E731
    records.update({
        'best_seasons': by(pct),
        'worst_seasons': by(pct, best=False),
        'best_all_play_seasons': by(all_play),
        'best_score_index_seasons': by(lambda s: s['score_index']),
        'luckiest_seasons': by(lambda s: s['luck']),
        'unluckiest_seasons': by(lambda s: s['luck'], best=False),
    })
    return records


def compute_alltime(seasons: list[tuple[str, dict, dict]]) -> dict:
    """The all-time data file, from (season id, season file, seasons.json entry), newest first."""
    finishes = {season: playoff_finishes(data, settings) for season, data, settings in seasons}
    team_seasons = [row for season, data, _ in seasons for row in _team_seasons(season, data, finishes[season])]
    results = pd.concat([_results(data).assign(Season=season, Index=lambda r: _score_index(r))
                         for season, data, _ in seasons], ignore_index=True)

    summary = []
    for season, data, settings in seasons:
        finish = finishes[season] or {}
        rows = [s for s in team_seasons if s['season'] == season]
        summary.append({
            'season': season,
            'in_progress': not settings.get('final'),
            'champion': next((t for t, f in finish.items() if f == 'champion'), None),
            # "champion": null in seasons.json: the playoffs were never finished (2019-20, COVID)
            'no_champion': 'champion' in settings and settings['champion'] is None,
            'runner_up': next((t for t, f in finish.items() if f == 'final'), None),
            'first_seed': rows[0]['team'],
            'periods': int(data['meta']['latest_period']),
        })

    pairs = [(season, data) for season, data, _ in seasons]
    return {
        'seasons': summary,
        'franchises': _franchises(team_seasons, results),
        'team_seasons': team_seasons,
        'head_to_head': _head_to_head(pairs),
        'records': _records(pairs, team_seasons, results),
    }
