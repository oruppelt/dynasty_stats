"""
Honor: earned season by season from rare achievements (a title, not a win), and spent on rewards (retiring
a jersey, a motto, ...). It is just honor: kept by franchise name, with the date of every achievement, so
whether it belongs to the franchise or to whoever ran it at the time is left to the reader. Shown on the
franchise page (History → Franchise); data/honor.json.

Achievements are worked out from the data for every season, past ones too, so nobody enters them. Only a
finished season earns its standings achievements (title, final, regular-season winner, season-high score,
bottom five, fewest points); a player milestone counts in the season it happens, the one in progress too. Nothing earned
is taken away.

Rewards are asked for through the commissioner, who adds a row to pipeline/data/honor_rewards.json (and
a picture, if any, to stats-app/public/honor/: a jersey's, a highlight's); this
module checks each one (enough honor by then, an eligible player) and keeps the ledger. A row that
doesn't pass is left out and reported.

Player points are lineup points for the franchise, regular season and playoffs (by team name, like the
rest of the site), every season added up; a milestone has the period (and its date) it was passed in. Every
achievement has a date, so the achievement of each season can be put next to who ran the team then.
"""
import json
import re
from pathlib import Path

import pandas as pd

# kind: (honor, label)
ACHIEVEMENTS = {
    'title': (100, 'Champion'),
    'final': (25, 'Runner-up'),
    'first_seed': (15, 'Regular-season winner'),
    'season_high': (15, "Season's highest score"),
    'bottom_five': (-10, 'Bottom five of the regular season'),
    'season_low': (-10, 'Fewest points of the regular season'),
    'player_6000': (10, '6,000 points for the franchise'),
    'player_17000': (70, '17,000 points for the franchise'),
}
# The last this many in the regular season lose honor
BOTTOM = 5
MILESTONES = [(6000, 'player_6000'), (17000, 'player_17000')]
# kind: (cost, label)
REWARDS = {
    'jersey': (100, 'Retire a jersey'),
    'highlight': (40, 'Declare a highlight'),
    'motto': (25, 'Franchise motto'),
}
# A jersey can be retired for a player with this many points for the franchise
JERSEY_POINTS = 6000
MOTTO_LENGTH = 80
LEGENDS = 25
REWARDS_PATH = Path(__file__).parent / 'data' / 'honor_rewards.json'
# A reward's picture (a jersey's, a highlight's): a file in stats-app/public/honor/, added in the same PR as its row
IMAGE_DIR = Path(__file__).parent.parent / 'stats-app' / 'public' / 'honor'
IMAGE_NAME = re.compile(r'^[A-Za-z0-9._-]+\.(jpe?g|png|webp|gif)$', re.IGNORECASE)
IMAGE_BYTES = 1_500_000


def read_rewards(path: Path = REWARDS_PATH) -> list[dict]:
    return json.loads(path.read_text())['rewards'] if path.exists() else []


def _event(kind: str, season: str, **extra) -> dict:
    points, label = ACHIEVEMENTS[kind]
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


def _date(data: dict, period: int | None) -> str | None:
    """The last day of a period (the season file's schedule), or None."""
    periods = (data.get('schedule') or {}).get('periods') or []
    return next((p['end'] for p in periods if p['period'] == period), None)


def _final(data: dict) -> dict | None:
    """The final series of a season file's knockout: the teams and the wins of each."""
    knockout = (data.get('playoffs') or {}).get('knockout') or []
    final = next((r for r in knockout if r.get('name') == 'Final'), None)
    return final['series'][0] if final and final.get('series') else None


def _achievements(alltime: dict, season_files: dict[str, dict], points: pd.DataFrame) -> list[dict]:
    """Every achievement, oldest season first, each with its team."""
    events = []
    order = [s['season'] for s in reversed(alltime['seasons'])]
    finished = {s['season'] for s in alltime['seasons'] if not s['in_progress']}
    for summary in reversed(alltime['seasons']):
        season = summary['season']
        if season not in finished:
            continue
        data = season_files.get(season, {})
        final = _final(data)
        # The final's last game; an earlier format without the bracket: the season's last period
        final_period = (max((g['period'] for g in final.get('games', [])), default=None) if final
                        else max((p['period'] for p in (data.get('schedule') or {}).get('periods', [])), default=None))
        regular_end = (data.get('schedule') or {}).get('regular_periods')
        for kind, team, other in (('title', summary['champion'], summary['runner_up']),
                                  ('final', summary['runner_up'], summary['champion'])):
            if team:
                extra = {'opponent': other, 'date': _date(data, final_period)}
                if final and team in final['teams']:
                    i = final['teams'].index(team)
                    extra['series'] = f'{final["wins"][i]}-{final["wins"][1 - i]}'
                events.append({'team': team, **_event(kind, season, **extra)})
        if summary.get('first_seed'):
            events.append({'team': summary['first_seed'], **_event('first_seed', season, date=_date(data, regular_end))})
        ranks = [t for t in alltime['team_seasons'] if t['season'] == season]
        for t in ranks:
            if t['rank'] > len(ranks) - BOTTOM:
                events.append({'team': t['team'], **_event('bottom_five', season, rank=t['rank'], of=len(ranks),
                                                                    date=_date(data, regular_end))})
        # The fewest points over the regular season (the season's total, not one game)
        totals = {t['team']: t['points_for'] for t in data.get('teams', []) if t.get('points_for')}
        if totals:
            low = min(totals.values())
            for team, pf in totals.items():
                if pf == low:
                    events.append({'team': team, **_event('season_low', season, score=round(pf, 2),
                                                          date=_date(data, regular_end))})
        games = _season_games(data) if data else []
        if games:
            high = max(g['score'] for g in games)
            for g in games:
                if g['score'] == high:
                    events.append({'team': g['team'], **_event('season_high', season, score=g['score'],
                                                                period=g['period'], opponent=g['opponent'],
                                                                date=_date(data, g['period']))})
    # Player milestones: the period a player's points for the franchise (regular season and playoffs) pass
    # each mark, in the season in progress too
    if len(points):
        rank = {s: i for i, s in enumerate(order)}
        df = points.assign(_order=points['season'].map(rank)).sort_values(['_order', 'period'])
        for (pid, team), rows in df.groupby(['player_id', 'team'], sort=False):
            total = 0.0
            for row in rows.itertuples():
                before, total = total, total + row.points
                for mark, kind in MILESTONES:
                    if before < mark <= total:
                        events.append({'team': team, **_event(kind, row.season, player_id=pid, player=rows['player'].iloc[-1],
                                                              period=int(row.period),
                                                              date=_date(season_files.get(row.season, {}), int(row.period)))})
    order_of = {s: i for i, s in enumerate(order)}
    return sorted(events, key=lambda e: (order_of.get(e['season'], 99), e.get('date') or '9999', -e['points']))


def _legends(points: pd.DataFrame) -> dict[str, list[dict]]:
    """Each franchise's top scorers: lineup points and starts (regular season and playoffs), every season added up."""
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
    """Ideas for a highlight, worked out from the games: best season, highest score, biggest win, longest
    streak, best player season. Shown only as ideas: a franchise declares its highlights (a reward)."""
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
        mine = (mine.groupby(['season', 'player_id'])
                .agg(player=('player', 'last'), points=('points', 'sum'), starts=('starts', 'sum')).reset_index())
        top = mine.sort_values('points', ascending=False).iloc[0]
        out['best_player_season'] = {'season': top['season'], 'player_id': top['player_id'], 'player': top['player'],
                                     'points': round(float(top['points']), 2), 'starts': int(top['starts'])}
    return out


def _spend(rewards: list[dict], teams: set[str], earned_by: dict[str, list[tuple[str, int]]], order: list[str],
           legends: dict[str, list[dict]], ideas: dict[str, dict], image_dir: Path = IMAGE_DIR
           ) -> tuple[dict[str, list[dict]], list[str]]:
    """Checks the rewards in the file's order: a known kind and franchise, a season, enough honor earned
    through that season less what's spent before, for a jersey an eligible player not already retired, for a
    highlight a title or one of the worked-out ideas (`of`), and an image (optional, any reward) that is in image_dir, a picture, and at most IMAGE_BYTES."""
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
        if r.get('image'):
            name, path = r['image'], image_dir / str(r['image'])
            if not IMAGE_NAME.match(str(name)) or not path.is_file():
                problems.append(f'{where}: no image {name} in stats-app/public/honor/ (jpg, png, webp or gif)')
                continue
            if path.stat().st_size > IMAGE_BYTES:
                problems.append(f'{where}: {name} is over {IMAGE_BYTES // 1_000_000:.1f} MB; make it smaller')
                continue
            item['image'] = f'/honor/{name}'
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
        elif kind == 'highlight':
            idea = r.get('of')
            if idea and idea not in ideas.get(team, {}):
                problems.append(f'{where}: no highlight idea {idea} (one of {", ".join(ideas.get(team, {}))})')
                continue
            if not idea and not (r.get('title') or '').strip():
                problems.append(f'{where}: a highlight needs a title, or `of` (a worked-out idea)')
                continue
            if idea:
                item.update({'of': idea, 'detail': ideas[team][idea]})
            item.update({k: r[k] for k in ('title', 'text', 'trade', 'player_id') if r.get(k)})
        if r.get('caption'):
            item['caption'] = str(r['caption'])
        spent[team].append(item)
    return spent, problems


def compute_honor(alltime: dict, season_files: dict[str, dict], points: pd.DataFrame,
                     rewards: list[dict], image_dir: Path = IMAGE_DIR) -> tuple[dict, list[str]]:
    """data/honor.json, and the reward rows that didn't pass.

    `points`: one row per season, period, team and player in a lineup (season, period, team, player_id, player,
    points, starts = 1), regular season and playoffs; may be empty (no player data)."""
    order = [s['season'] for s in reversed(alltime['seasons'])]
    teams = sorted({t['team'] for t in alltime['team_seasons']})
    events = _achievements(alltime, season_files, points)
    legends = _legends(points)
    ideas = {team: _highlights(team, alltime, season_files, points) for team in teams}
    earned_by: dict[str, list[tuple[str, int]]] = {}
    for e in events:
        earned_by.setdefault(e['team'], []).append((e['season'], e['points']))
    spent, problems = _spend(rewards, set(teams), earned_by, order, legends, ideas, image_dir)

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
        franchises[team] = {
            'honor': total, 'spent': cost, 'balance': total - cost,
            'seasons': by_season,
            # Free, worked out: a banner for each title
            'banners': [e for e in mine if e['kind'] == 'title'],
            # Bought (rewards): the motto (the latest), retired jerseys and highlights
            'motto': mottos[-1]['text'] if mottos else None,
            'jerseys': [x for x in spent[team] if x['kind'] == 'jersey'],
            'highlights': [x for x in spent[team] if x['kind'] == 'highlight'],
            'rewards': spent[team],
            'legends': [{**p, 'eligible': p['points'] >= JERSEY_POINTS, 'retired': p['player_id'] in retired}
                        for p in legends.get(team, [])],
            # Ideas for what to declare
            'highlight_ideas': ideas[team],
        }
    ranked = sorted(teams, key=lambda t: (-franchises[t]['honor'], t))
    for i, team in enumerate(ranked):
        franchises[team]['rank'] = 1 + sum(franchises[t]['honor'] > franchises[team]['honor'] for t in ranked[:i])
    return {
        'achievements': [{'kind': k, 'points': p, 'label': label} for k, (p, label) in ACHIEVEMENTS.items()],
        'rewards': [{'kind': k, 'cost': c, 'label': label} for k, (c, label) in REWARDS.items()],
        'jersey_points': JERSEY_POINTS,
        'seasons': order,
        'franchises': franchises,
    }, problems
