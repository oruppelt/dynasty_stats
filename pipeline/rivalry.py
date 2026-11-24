"""
Rivalries: any two franchises over every season (History → Rivalry on the site). One file per team,
data/rivalries/<slug>.json, with its rivalry against every other team, from that team's side:

- every meeting, regular season and playoffs (Swiss rounds, knockout series, an earlier format's games), oldest
  first, with the score and the result;
- the record (regular season and playoffs apart), playoff series won and lost, the current streak, the records
  of the rivalry (highest score, biggest win, closest game, longest streak);
- the trades between the two (`trades.json`, items that went from one to the other), with the points the
  players each side got went on to score for it, so who came out ahead;
- players: who scored the most in their games for each side (lineup points in the periods they met), the best
  game by a player, and the players who scored for both franchises.

Like the rest of the site, a franchise is its team name.
"""
import re

import pandas as pd

TOP_PLAYERS = 5
BOTH_PLAYERS = 10


def slug(team: str) -> str:
    """The file name for a team: 'Portland Trail Blazers' → 'portland-trail-blazers' (lib/rivalry.ts does the same)."""
    return re.sub(r'[^a-z0-9]+', '-', team.lower()).strip('-')


def _meetings(season: str, data: dict) -> list[dict]:
    """A season's games, once each (team < opponent by name is not assumed: each game is one row with both
    sides), with its stage: regular, swiss, knockout (with the round's name) or playoffs (an earlier format)."""
    out = []
    for r in data.get('results', []):
        # Regular season: a row per team; keep the one from the first team (by name), a 0 is a re-score, not a game
        if r['team'] < r['opponent'] and r.get('win') is not None and (r['score'] > 0 or r['opp_score'] > 0):
            out.append({'season': season, 'period': r['period'], 'stage': 'regular', 'team': r['team'],
                        'score': r['score'], 'opponent': r['opponent'], 'opp_score': r['opp_score']})
    playoffs = data.get('playoffs')
    if playoffs:
        for rnd in playoffs['swiss']['rounds']:
            for g in rnd['games']:
                out.append({'season': season, 'period': rnd['period'], 'stage': 'swiss', 'round': f'Swiss round {rnd["round"]}',
                            **{k: g[k] for k in ('team', 'score', 'opponent', 'opp_score')}})
        for rnd in playoffs['knockout']:
            for s in rnd['series']:
                for g in s['games']:
                    out.append({'season': season, 'period': g['period'], 'stage': 'knockout', 'round': rnd['name'],
                                **{k: g[k] for k in ('team', 'score', 'opponent', 'opp_score')}})
    else:
        for g in data.get('playoff_games') or []:
            out.append({'season': season, 'period': g['period'], 'stage': 'playoffs',
                        **{k: g[k] for k in ('team', 'score', 'opponent', 'opp_score')}})
    return out


def _series(season: str, data: dict) -> list[dict]:
    """A season's knockout series: the two teams and the winner."""
    return [{'season': season, 'round': rnd['name'], 'teams': s['teams'], 'wins': s['wins'], 'winner': s.get('winner')}
            for rnd in ((data.get('playoffs') or {}).get('knockout') or []) for s in rnd['series']]


def _side(m: dict, team: str) -> dict:
    """A meeting from one team's side: its score first, the result (1 won, 0 lost, 0.5 tied)."""
    mine = m['team'] == team
    score, opp = (m['score'], m['opp_score']) if mine else (m['opp_score'], m['score'])
    return {**{k: m[k] for k in ('season', 'period', 'stage') if k in m}, **({'round': m['round']} if 'round' in m else {}),
            'score': round(score, 2), 'opp_score': round(opp, 2), 'win': 1 if score > opp else 0 if score < opp else 0.5}


def _streaks(meetings: list[dict]) -> tuple[dict | None, dict | None, dict | None]:
    """The current streak, and each side's longest: {'side': 'team' | 'opponent', 'length', 'from', 'to'}
    (meetings from the team's side, oldest first; a tie ends a streak)."""
    longest = {'team': None, 'opponent': None}
    run = None
    for m in meetings:
        side = 'team' if m['win'] == 1 else 'opponent' if m['win'] == 0 else None
        if side and run and run['side'] == side:
            run = {**run, 'length': run['length'] + 1, 'to': m}
        else:
            run = {'side': side, 'length': 1, 'from': m, 'to': m} if side else None
        if run and (longest[side] is None or run['length'] > longest[side]['length']):
            longest[side] = run
    at = lambda m: {'season': m['season'], 'period': m['period']}
    fmt = lambda s: s and {'side': s['side'], 'length': s['length'], 'from': at(s['from']), 'to': at(s['to'])}
    return fmt(run), fmt(longest['team']), fmt(longest['opponent'])


def _records(meetings: list[dict]) -> dict:
    """The rivalry's records, each a meeting (from the team's side) with `side`: whose it is."""
    if not meetings:
        return {}
    def tag(m, side):
        return {**m, 'side': side}
    high = max(meetings, key=lambda m: max(m['score'], m['opp_score']))
    big = max(meetings, key=lambda m: abs(m['score'] - m['opp_score']))
    close = min(meetings, key=lambda m: abs(m['score'] - m['opp_score']))
    side = lambda m: 'team' if m['score'] > m['opp_score'] else 'opponent' if m['score'] < m['opp_score'] else None
    return {
        'highest_score': tag(high, 'team' if high['score'] >= high['opp_score'] else 'opponent'),
        'biggest_win': {**tag(big, side(big)), 'margin': round(abs(big['score'] - big['opp_score']), 2)},
        'closest_game': {**tag(close, side(close)), 'margin': round(abs(close['score'] - close['opp_score']), 2)},
        'highest_combined': {**max(meetings, key=lambda m: m['score'] + m['opp_score']),
                             'combined': round(max(m['score'] + m['opp_score'] for m in meetings), 2)},
    }


def _trades(trades: dict[str, dict], a: str, b: str) -> list[dict]:
    """The trades between a and b, oldest first: what each side got (items that went between the two only) and
    the points the players (and picks, once drafted) went on to score for it."""
    out = []
    for tid, t in trades.items():
        got = [i for i in t['items'] if i['from'] == b and i['to'] == a]
        gave = [i for i in t['items'] if i['from'] == a and i['to'] == b]
        if not got and not gave:
            continue
        item = lambda i: {k: v for k, v in {
            'kind': i['kind'], 'label': i['label'],
            'player_id': i.get('player_id') or (i.get('became') or {}).get('player_id'),
            'player': i.get('player') or (i.get('became') or {}).get('player'),
            'points': (i.get('result') or {}).get('points')}.items() if v is not None}
        points = lambda items: round(sum((i.get('result') or {}).get('points') or 0 for i in items), 2)
        teams = sorted({i['from'] for i in t['items']} | {i['to'] for i in t['items']})
        out.append({'id': tid, 'date': t['date'], 'season': t['season'], 'period': t.get('period'),
                    'got': [item(i) for i in got], 'gave': [item(i) for i in gave],
                    'got_points': points(got), 'gave_points': points(gave),
                    **({'others': [x for x in teams if x not in (a, b)]} if len(teams) > 2 else {})})
    return sorted(out, key=lambda t: t['date'])


def _players(meetings: list[dict], lineups: pd.DataFrame, a: str, b: str) -> dict:
    """Who scored in their games (lineup points in the periods they met, each side), the best game by a player,
    and the players who scored for both franchises (any time)."""
    out = {'team': [], 'opponent': [], 'best_game': None, 'both': []}
    if not len(lineups):
        return out
    met = pd.DataFrame([{'season': m['season'], 'period': m['period']} for m in meetings]).drop_duplicates() \
        if meetings else pd.DataFrame(columns=['season', 'period'])
    games = lineups.merge(met, on=['season', 'period'])
    games = games[games['team'].isin([a, b])]
    best = None
    for side, team in (('team', a), ('opponent', b)):
        mine = games[games['team'] == team]
        if not len(mine):
            continue
        top = (mine.groupby('player_id').agg(player=('player', 'last'), points=('points', 'sum'), games=('points', 'size'),
                                             best=('points', 'max'))
               .reset_index().sort_values(['points', 'player'], ascending=[False, True]).head(TOP_PLAYERS))
        out[side] = [{'player_id': r.player_id, 'player': r.player, 'points': round(float(r.points), 2),
                      'games': int(r.games), 'best': round(float(r.best), 2)} for r in top.itertuples()]
        row = mine.sort_values(['points', 'season', 'period'], ascending=[False, True, True]).iloc[0]
        if best is None or row['points'] > best['points']:
            best = {'side': side, 'player_id': row['player_id'], 'player': row['player'], 'points': round(float(row['points']), 2),
                    'season': row['season'], 'period': int(row['period'])}
    out['best_game'] = best
    by = lineups[lineups['team'].isin([a, b])].groupby(['player_id', 'team']).agg(player=('player', 'last'), points=('points', 'sum'))
    by = by.reset_index().pivot_table(index='player_id', columns='team', values='points', aggfunc='sum')
    if a in by and b in by:
        both = by.dropna(subset=[a, b])
        names = lineups.drop_duplicates('player_id', keep='last').set_index('player_id')['player']
        rows = sorted(((pid, r[a], r[b]) for pid, r in both.iterrows()), key=lambda x: -(x[1] + x[2]))[:BOTH_PLAYERS]
        out['both'] = [{'player_id': pid, 'player': names[pid], 'team_points': round(float(pa), 2),
                        'opponent_points': round(float(pb), 2)} for pid, pa, pb in rows]
    return out


def compute_rivalries(season_files: dict[str, dict], trades: dict[str, dict], lineups: pd.DataFrame) -> dict[str, dict]:
    """Every team's file: {team, opponents: {opponent: rivalry}}.

    `season_files`: season id → the season file; `trades`: data/players/trades.json; `lineups`: one row per
    season, period, team and player in a lineup (season, period, team, player_id, player, points), may be empty."""
    seasons = sorted(season_files)
    games = [m for s in seasons for m in _meetings(s, season_files[s])]
    series = [x for s in seasons for x in _series(s, season_files[s])]
    teams = sorted({m['team'] for m in games} | {m['opponent'] for m in games})
    order = {s: i for i, s in enumerate(seasons)}
    by_pair: dict[tuple[str, str], list[dict]] = {}
    for m in games:
        by_pair.setdefault(tuple(sorted((m['team'], m['opponent']))), []).append(m)

    files = {}
    for a in teams:
        opponents = {}
        for b in teams:
            if b == a:
                continue
            met = sorted((_side(m, a) for m in by_pair.get(tuple(sorted((a, b))), [])),
                         key=lambda m: (order[m['season']], m['period'], m['stage'] != 'regular'))
            regular = [m for m in met if m['stage'] == 'regular']
            playoff = [m for m in met if m['stage'] != 'regular']
            mine = [x for x in series if set(x['teams']) == {a, b}]
            current, longest_team, longest_opp = _streaks(met)
            opponents[b] = {
                'wins': sum(m['win'] for m in regular), 'losses': sum(1 - m['win'] for m in regular), 'games': len(regular),
                'playoff_wins': sum(m['win'] for m in playoff), 'playoff_losses': sum(1 - m['win'] for m in playoff),
                'playoff_games': len(playoff),
                'series': [{'season': x['season'], 'round': x['round'], 'won': x['winner'] == a,
                            'wins': x['wins'][x['teams'].index(a)], 'losses': x['wins'][x['teams'].index(b)]} for x in mine],
                'points_for': round(sum(m['score'] for m in met), 2), 'points_against': round(sum(m['opp_score'] for m in met), 2),
                'streak': current, 'longest_streak': longest_team, 'opponent_longest_streak': longest_opp,
                'records': _records(met),
                'meetings': met,
                'trades': _trades(trades, a, b),
                'players': _players(met, lineups, a, b),
            }
        files[a] = {'team': a, 'opponents': opponents}
    return files
