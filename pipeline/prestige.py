"""
Prestige: a franchise's standing in the league, earned season by season from rare honors (a title, not a
win), and spent on rewards (retiring a jersey, a motto, ...). Shown on the franchise page (History →
Franchise); data/prestige.json.

Honors are worked out from the data for every season, past ones too, so nobody enters them. Only a
finished season earns its standings honors (title, final, regular-season winner, season-high score,
bottom three); a player milestone counts in the season it happens, the one in progress too. Nothing earned
is taken away.

Rewards are asked for through the commissioner, who adds a row to pipeline/data/prestige_rewards.json; this
module checks each one (enough prestige by then, an eligible player) and keeps the ledger. A row that
doesn't pass is left out and reported.

Player points are regular-season lineup points for the franchise (by team name, like the rest of the
site), every season added up.
"""
import json
from pathlib import Path

import pandas as pd

# kind: (prestige, label)
HONORS = {
    'title': (100, 'Champion'),
    'final': (40, 'Runner-up'),
    'first_seed': (15, 'Regular-season winner'),
    'season_high': (15, "Season's highest score"),
    'bottom_three': (-10, 'Bottom three of the regular season'),
    'player_5000': (10, '5,000 points for the franchise'),
    'player_16000': (70, '16,000 points for the franchise'),
}
MILESTONES = [(5000, 'player_5000'), (16000, 'player_16000')]
# kind: (cost, label)
REWARDS = {
    'jersey': (100, 'Retire a jersey'),
    'rival': (50, 'Declare a rival'),
    'moment': (40, 'Feature a moment'),
    'motto': (25, 'Franchise motto'),
}
# A jersey can be retired for a player with this many points for the franchise
JERSEY_POINTS = 5000
MOTTO_LENGTH = 80
LEGENDS = 25
RIVAL_GAMES = 6
REWARDS_PATH = Path(__file__).parent / 'data' / 'prestige_rewards.json'


def read_rewards(path: Path = REWARDS_PATH) -> list[dict]:
    return json.loads(path.read_text())['rewards'] if path.exists() else []


def _event(kind: str, season: str, **extra) -> dict:
    points, label = HONORS[kind]
    return {'kind': kind, 'season': season, 'points': points, 'label': label, **extra}


def _season_games(data: dict) -> list[dict]:
    """A season file's regular-season games that were played (a 0 is a Fantrax re-score, not a game)."""
    return [r for r in data['results'] if r.get('win') is not None and r['score'] > 0]


def _streak(games: list[dict]) -> tuple[int, int | None, int | None]:
    """The longest run of wins in one team's games (in period order): length, first and last period."""
    best, run, start = (0, None, None), 0, None
    for g in games:
        if g['win'] == 1:
            run, start = run + 1, start if run else g['period']
            if run > best[0]:
                best = (run, start, g['period'])
        else:
            run = 0
    return best


def _final(data: dict) -> dict | None:
    """The final series of a season file's knockout: the teams and the wins of each."""
    knockout = (data.get('playoffs') or {}).get('knockout') or []
    final = next((r for r in knockout if r.get('name') == 'Final'), None)
    return final['series'][0] if final and final.get('series') else None


def _honors(alltime: dict, season_files: dict[str, dict], points: pd.DataFrame) -> list[dict]:
    """Every honor, oldest season first, each with its team."""
    events = []
    order = [s['season'] for s in reversed(alltime['seasons'])]
    finished = {s['season'] for s in alltime['seasons'] if not s['in_progress']}
    for summary in reversed(alltime['seasons']):
        season = summary['season']
        if season not in finished:
            continue
        final = _final(season_files.get(season, {}))
        for kind, team, other in (('title', summary['champion'], summary['runner_up']),
                                  ('final', summary['runner_up'], summary['champion'])):
            if team:
                extra = {'opponent': other}
                if final and team in final['teams']:
                    i = final['teams'].index(team)
                    extra['series'] = f'{final["wins"][i]}-{final["wins"][1 - i]}'
                events.append({'team': team, **_event(kind, season, **extra)})
        if summary.get('first_seed'):
            events.append({'team': summary['first_seed'], **_event('first_seed', season)})
        ranks = [t for t in alltime['team_seasons'] if t['season'] == season]
        for t in ranks:
            if t['rank'] > len(ranks) - 3:
                events.append({'team': t['team'], **_event('bottom_three', season, rank=t['rank'], of=len(ranks))})
        games = _season_games(season_files.get(season, {'results': []}))
        if games:
            high = max(g['score'] for g in games)
            for g in games:
                if g['score'] == high:
                    events.append({'team': g['team'], **_event('season_high', season, score=g['score'],
                                                                period=g['period'], opponent=g['opponent'])})
    # Player milestones: the season a player's points for the franchise pass each mark
    if len(points):
        rank = {s: i for i, s in enumerate(order)}
        df = points.assign(_order=points['season'].map(rank)).sort_values('_order')
        for (pid, team), rows in df.groupby(['player_id', 'team'], sort=False):
            total = 0.0
            for row in rows.itertuples():
                before, total = total, total + row.points
                for mark, kind in MILESTONES:
                    if before < mark <= total:
                        events.append({'team': team, **_event(kind, row.season, player_id=pid, player=rows['player'].iloc[-1])})
    order_of = {s: i for i, s in enumerate(order)}
    return sorted(events, key=lambda e: (order_of.get(e['season'], 99), -e['points']))


def _legends(points: pd.DataFrame) -> dict[str, list[dict]]:
    """Each franchise's top scorers: regular-season lineup points and starts, every season added up."""
    if not len(points):
        return {}
    by = (points.groupby(['team', 'player_id'])
          .agg(player=('player', 'last'), points=('points', 'sum'), starts=('starts', 'sum'),
               first=('season', 'min'), last=('season', 'max'), seasons=('season', 'nunique'))
          .reset_index().sort_values(['team', 'points'], ascending=[True, False]))
    return {team: [{**{k: v for k, v in r.items() if k != 'team'}, 'points': round(float(r['points']), 2),
                    'starts': int(r['starts']), 'seasons': int(r['seasons'])}
                   for r in rows.head(LEGENDS).to_dict('records')]
            for team, rows in by.groupby('team')}


def _highlights(team: str, alltime: dict, season_files: dict[str, dict], points: pd.DataFrame) -> dict:
    """The franchise's best moments, worked out: best season, highest score, biggest win, longest streak,
    best player season."""
    out = {}
    seasons = [t for t in alltime['team_seasons'] if t['team'] == team and t['finish'] is not None]
    if seasons:
        best = min(seasons, key=lambda t: (t['rank'], -t['all_play_wins'] / max(t['all_play_wins'] + t['all_play_losses'], 1)))
        out['best_season'] = {k: best[k] for k in ('season', 'rank', 'wins', 'losses', 'finish')}
    high = big = streak = None
    for season, data in season_files.items():
        games = sorted((g for g in _season_games(data) if g['team'] == team), key=lambda g: g['period'])
        for g in games:
            if high is None or g['score'] > high['score']:
                high = {'season': season, **{k: g[k] for k in ('period', 'score', 'opponent', 'opp_score')}}
            margin = g['score'] - g['opp_score']
            if big is None or margin > big['margin']:
                big = {'season': season, 'margin': round(margin, 2), **{k: g[k] for k in ('period', 'score', 'opponent', 'opp_score')}}
        length, start, end = _streak(games)
        if length and (streak is None or length > streak['length']):
            streak = {'season': season, 'length': length, 'start': start, 'end': end}
    if high:
        out['highest_score'] = high
    if big and big['margin'] > 0:
        out['biggest_win'] = big
    if streak:
        out['longest_streak'] = streak
    mine = points[points['team'] == team] if len(points) else points
    if len(mine):
        top = mine.sort_values('points', ascending=False).iloc[0]
        out['best_player_season'] = {'season': top['season'], 'player_id': top['player_id'], 'player': top['player'],
                                     'points': round(float(top['points']), 2), 'starts': int(top['starts'])}
    return out


def _rivals(team: str, alltime: dict) -> dict:
    """From the career head-to-head (regular season and playoffs): the most-played opponent, and with
    RIVAL_GAMES or more games, the worst record (nemesis) and the best (favorite)."""
    h2h = alltime['head_to_head']
    row = lambda matrix: next((r for r in h2h[matrix] if r['Team'] == team), {})
    wins, games, pwins, pgames = row('wins'), row('games'), row('playoff_wins'), row('playoff_games')
    opponents = []
    for other in h2h['teams']:
        g = (games.get(other) or 0) + (pgames.get(other) or 0)
        if other == team or not g:
            continue
        w = (wins.get(other) or 0) + (pwins.get(other) or 0)
        opponents.append({'team': other, 'games': g, 'wins': w, 'losses': g - w, 'playoff_games': pgames.get(other) or 0})
    if not opponents:
        return {}
    out = {'most_played': max(opponents, key=lambda o: (o['games'], o['playoff_games']))}
    enough = [o for o in opponents if o['games'] >= RIVAL_GAMES]
    if enough:
        out['nemesis'] = min(enough, key=lambda o: (o['wins'] / o['games'], -o['games']))
        out['favorite'] = max(enough, key=lambda o: (o['wins'] / o['games'], o['games']))
    return out


def _spend(rewards: list[dict], teams: set[str], earned_by: dict[str, list[tuple[str, int]]], order: list[str],
           legends: dict[str, list[dict]]) -> tuple[dict[str, list[dict]], list[str]]:
    """Checks the rewards in the file's order: a known kind and franchise, a season, enough prestige earned
    through that season less what's spent before, and for a jersey an eligible player not already retired."""
    spent: dict[str, list[dict]] = {t: [] for t in teams}
    problems = []
    rank = {s: i for i, s in enumerate(order)}
    for n, r in enumerate(rewards, 1):
        team, kind, season = r.get('team'), r.get('kind'), r.get('season')
        where = f'reward {n} ({team}, {kind})'
        if team not in teams or kind not in REWARDS or season not in rank:
            problems.append(f'{where}: unknown franchise, kind or season')
            continue
        cost = REWARDS[kind][0]
        earned = sum(p for s, p in earned_by.get(team, []) if rank[s] <= rank[season])
        balance = earned - sum(x['cost'] for x in spent[team])
        if cost > balance:
            problems.append(f'{where}: costs {cost}, {team} has {balance} through {season}')
            continue
        item = {'kind': kind, 'season': season, 'cost': cost, 'label': REWARDS[kind][1]}
        if kind == 'jersey':
            player = next((p for p in legends.get(team, []) if p['player_id'] == r.get('player_id')), None)
            if not player or player['points'] < JERSEY_POINTS:
                problems.append(f'{where}: the player needs {JERSEY_POINTS:,} points for the franchise')
                continue
            if any(x.get('player_id') == player['player_id'] for x in spent[team]):
                problems.append(f'{where}: {player["player"]} is already retired')
                continue
            item.update({k: player[k] for k in ('player_id', 'player', 'points', 'starts', 'first', 'last')})
        elif kind == 'motto':
            text = (r.get('text') or '').strip()
            if not text or len(text) > MOTTO_LENGTH:
                problems.append(f'{where}: a motto has 1 to {MOTTO_LENGTH} characters')
                continue
            item['text'] = text
        elif kind == 'rival':
            if r.get('opponent') not in teams or r.get('opponent') == team:
                problems.append(f'{where}: unknown opponent')
                continue
            item['opponent'] = r['opponent']
        elif kind == 'moment':
            if not (r.get('title') or '').strip():
                problems.append(f'{where}: a moment needs a title')
                continue
            item.update({k: r[k] for k in ('title', 'text', 'trade', 'player_id') if r.get(k)})
        spent[team].append(item)
    return spent, problems


def compute_prestige(alltime: dict, season_files: dict[str, dict], points: pd.DataFrame,
                     rewards: list[dict]) -> tuple[dict, list[str]]:
    """data/prestige.json, and the reward rows that didn't pass.

    `points`: one row per season, team and player (season, team, player_id, player, points, starts), regular-season
    lineup points; may be empty (no player data)."""
    order = [s['season'] for s in reversed(alltime['seasons'])]
    teams = sorted({t['team'] for t in alltime['team_seasons']})
    events = _honors(alltime, season_files, points)
    legends = _legends(points)
    earned_by: dict[str, list[tuple[str, int]]] = {}
    for e in events:
        earned_by.setdefault(e['team'], []).append((e['season'], e['points']))
    spent, problems = _spend(rewards, set(teams), earned_by, order, legends)

    franchises = {}
    for team in teams:
        mine = [{k: v for k, v in e.items() if k != 'team'} for e in events if e['team'] == team]
        by_season, total = [], 0
        rows = {t['season']: t for t in alltime['team_seasons'] if t['team'] == team}
        for season in order:
            got = [e for e in mine if e['season'] == season]
            pts = sum(e['points'] for e in got)
            total += pts
            row = rows.get(season)
            by_season.append({'season': season, 'points': pts, 'total': total, 'events': got,
                              **({k: row[k] for k in ('rank', 'wins', 'losses', 'finish')} if row else {})})
        cost = sum(x['cost'] for x in spent[team])
        retired = {x['player_id'] for x in spent[team] if x['kind'] == 'jersey'}
        mottos = [x for x in spent[team] if x['kind'] == 'motto']
        rivals = [x for x in spent[team] if x['kind'] == 'rival']
        franchises[team] = {
            'prestige': total, 'spent': cost, 'balance': total - cost,
            'seasons': by_season,
            'cups': [e for e in mine if e['kind'] in ('title', 'final')],
            'motto': mottos[-1]['text'] if mottos else None,
            'jerseys': [x for x in spent[team] if x['kind'] == 'jersey'],
            'moments': [x for x in spent[team] if x['kind'] == 'moment'],
            'declared_rival': rivals[-1]['opponent'] if rivals else None,
            'rewards': spent[team],
            'legends': [{**p, 'eligible': p['points'] >= JERSEY_POINTS, 'retired': p['player_id'] in retired}
                        for p in legends.get(team, [])],
            'highlights': _highlights(team, alltime, season_files, points),
            'rivals': _rivals(team, alltime),
        }
    ranked = sorted(teams, key=lambda t: (-franchises[t]['prestige'], t))
    for i, team in enumerate(ranked):
        franchises[team]['rank'] = 1 + sum(franchises[t]['prestige'] > franchises[team]['prestige'] for t in ranked[:i])
    return {
        'honors': [{'kind': k, 'points': p, 'label': label} for k, (p, label) in HONORS.items()],
        'rewards': [{'kind': k, 'cost': c, 'label': label} for k, (c, label) in REWARDS.items()],
        'jersey_points': JERSEY_POINTS,
        'seasons': order,
        'franchises': franchises,
    }, problems
