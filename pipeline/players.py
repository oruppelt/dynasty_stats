"""
Players: each team's roster and every player's fantasy points, per period.

Source: Fantrax's private `getTeamRosterInfo` (needs FANTRAX_COOKIE, like the
scores), one request per team per period, with the period's stats only
(`BY_PERIOD`; without it Fantrax gives season-to-date totals). The stats are
"NBA" stats (statsType 1): every rostered player's points that period,
bench and reserve too. A player in the lineup (status `active`) scored those
points for the team: the active players add up to the team's score (checked
on 2025-26 and 2023-24; 2023-24 differs where the commissioner adjusted a
score, see fantrax.SCORE_LAYOUTS).

Fetching every period of every season is about 1,400 requests a season, so
the rows are kept in pipeline/data/players/<season>.csv (committed) and only
periods not there yet are fetched, plus the latest few again for stat
corrections while a season is in progress (`update_cache`). Only the teams
that played a period are fetched (a team out of the playoffs has no game).

From the rows, `compute_players` makes the season's player lists for the
site (data/players/<season>.json), regular season only, like the rest of
the season's records.
"""
import json
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pandas as pd

import fantrax

CACHE_DIR = Path(__file__).resolve().parent / 'data' / 'players'
COLUMNS = ['period', 'team', 'player_id', 'player', 'status', 'slot', 'fpts', 'gp', 'min', 'salary', 'contract']
# Fantrax's roster statuses: in the lineup, on the bench, injured reserve, minors
STATUSES = {'1': 'active', '2': 'bench', '3': 'ir', '9': 'minors'}
# Lineup slots (an active player's posId)
SLOTS = {'300': 'PG', '301': 'SG', '302': 'G', '303': 'SF', '304': 'PF', '305': 'C', '306': 'F', '307': 'Flx'}
# Periods fetched again on every run while a season is in progress (stat corrections)
REFRESH_RECENT = 2
WORKERS = 4
TOP_N = 25


def fetch_roster(league_id: str, cookie: str, team_id: str, period: int, season_code: str | None = None) -> dict:
    """A team's roster with each player's points for one period (`season_code`: see `by_period_code`)."""
    data = {'leagueId': league_id, 'teamId': team_id, 'period': str(period), 'view': 'STATS',
            'statsType': '1', 'scoringCategoryType': '5', 'timeframeTypeCode': 'BY_PERIOD'}
    if season_code:
        data['seasonOrProjection'] = season_code
    request = urllib.request.Request(
        f'{fantrax.PRIVATE_API}?{urllib.parse.urlencode({"leagueId": league_id})}',
        data=json.dumps({'msgs': [{'method': 'getTeamRosterInfo', 'data': data}]}).encode(),
        headers={'Content-Type': 'application/json', 'Cookie': cookie},
    )
    return fantrax.check_private_response(fantrax._get_json(request))


def by_period_code(roster: dict) -> str:
    """The league season's "by period" stats code (e.g. SEASON_41l_BY_PERIOD), from any roster response.

    The code differs per season; the response shows the season-to-date one
    (SEASON_41l_YEAR_TO_DATE) and lists the others.
    """
    shown = roster['displayedSelections']['displayedSeasonOrProjection']['code']
    code = shown.rsplit('_', 3)[0] + '_BY_PERIOD' if shown.endswith('_YEAR_TO_DATE') else shown
    listed = {s['code'] for s in roster['displayedLists']['seasonOrProjections']}
    if not code.endswith('_BY_PERIOD') or code not in listed:
        raise fantrax.FantraxError(f'No by-period stats for this season (shown: {shown}); the Fantrax response may have changed.')
    return code


def _number(text) -> float:
    text = str(text or '').replace(',', '').replace('$', '')
    return float(text) if text else 0.0


def _minutes(text) -> float:
    """Minutes played: '32:55' (minutes:seconds) or a plain number."""
    text = str(text or '')
    if ':' in text:
        minutes, seconds = text.split(':')
        return round(int(minutes.replace(',', '')) + int(seconds) / 60, 2)
    return _number(text)


def parse_roster(roster: dict, period: int, team: str) -> list[dict]:
    """One row per player on the roster (COLUMNS). Empty slots and the totals row are left out."""
    shown = roster['displayedSelections']
    if shown.get('displayedPeriod') != period or shown['displayedSeasonOrProjection'].get('timeframeTypeCode') != 'BY_PERIOD':
        raise fantrax.FantraxError(f'{team}, period {period}: Fantrax sent period {shown.get("displayedPeriod")} '
                                   f'({shown["displayedSeasonOrProjection"].get("name")}) instead.')
    rows = []
    for table in roster['tables']:
        cells = table['header']['cells']
        column = {c.get('key'): i for i, c in enumerate(cells)} | {c.get('shortName'): i for i, c in enumerate(cells)}
        missing = [c for c in ('fpts', 'salary', 'contract', 'GP', 'MIN') if c not in column]
        if missing:
            raise fantrax.FantraxError(f'{team}, period {period}: roster columns {missing} missing; the Fantrax response may have changed.')
        for row in table['rows']:
            scorer = row.get('scorer') or {}
            if not scorer.get('scorerId'):
                continue
            if row.get('statusId') not in STATUSES:
                raise fantrax.FantraxError(f'{team}, period {period}: unknown roster status {row.get("statusId")}.')
            status = STATUSES[row['statusId']]
            content = [c.get('content') for c in row['cells']]
            rows.append({
                'period': period,
                'team': team,
                'player_id': scorer['scorerId'],
                'player': scorer.get('name', ''),
                'status': status,
                'slot': SLOTS.get(str(row.get('posId')), '') if status == 'active' else '',
                'fpts': _number(content[column['fpts']]),
                'gp': int(_number(content[column['GP']])),
                'min': _minutes(content[column['MIN']]),
                'salary': int(_number(content[column['salary']])),
                'contract': content[column['contract']] or '',
            })
    return rows


def cache_path(season: str, cache_dir: Path = CACHE_DIR) -> Path:
    return cache_dir / f'{season}.csv'


def read_cache(season: str, cache_dir: Path = CACHE_DIR) -> pd.DataFrame:
    path = cache_path(season, cache_dir)
    if not path.exists():
        return pd.DataFrame(columns=COLUMNS)
    return pd.read_csv(path, dtype={'player_id': str, 'contract': str, 'slot': str}, keep_default_na=False)


def _sorted(rows: pd.DataFrame) -> pd.DataFrame:
    order = {s: i for i, s in enumerate(STATUSES.values())}
    return (rows.assign(_status=rows['status'].map(order))
            .sort_values(['period', 'team', '_status', 'fpts', 'player_id'], ascending=[True, True, True, False, True])
            .drop(columns='_status').reset_index(drop=True)[COLUMNS])


def update_cache(season: str, league_id: str, cookie: str, played: dict[int, set[str]],
                 refresh: int = REFRESH_RECENT, cache_dir: Path = CACHE_DIR, fetch=fetch_roster,
                 workers: int = WORKERS, log=print) -> pd.DataFrame:
    """Fetch the periods missing from the season's cache (and the latest `refresh` again); returns every row.

    `played`: each played period and the teams that played it (regular season
    and playoffs). The file is only rewritten when the rows change.
    """
    cached = read_cache(season, cache_dir)
    have = set(cached['period'].astype(int))
    recent = sorted(p for p in played if p in have)[-refresh:] if refresh else []
    todo = sorted({p for p in played if p not in have} | set(recent))
    if not todo:
        return cached

    info = fantrax.fetch_league_info(league_id)
    team_ids = {team['name'].strip(): team_id for team_id, team in info['teamInfo'].items()}
    jobs = [(p, t) for p in todo for t in sorted(played[p])]
    unknown = {t for _, t in jobs if t not in team_ids}
    if unknown:
        raise fantrax.FantraxError(f'Teams not in the league: {sorted(unknown)}')
    first = fetch(league_id, cookie, team_ids[jobs[0][1]], jobs[0][0])
    code = by_period_code(first)

    def job(pt):
        period, team = pt
        return parse_roster(fetch(league_id, cookie, team_ids[team], period, code), period, team)

    log(f'{season}: fetching rosters for {len(todo)} periods ({len(jobs)} requests)...')
    with ThreadPoolExecutor(workers) as pool:
        fetched = [row for rows in pool.map(job, jobs) for row in rows]

    new = pd.DataFrame(fetched, columns=COLUMNS)
    kept = cached[~cached['period'].astype(int).isin(todo)]
    rows = _sorted(pd.concat([kept, new], ignore_index=True) if len(kept) else new)
    path = cache_path(season, cache_dir)
    text = rows.to_csv(index=False)
    if not path.exists() or path.read_text() != text:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
    return rows


def check_scores(rows: pd.DataFrame, games: pd.DataFrame) -> list[tuple[int, str, float, float]]:
    """(period, team, active players' points, score) wherever they differ: a commissioner's score adjustment,
    or a sign that the rows are wrong."""
    scores = pd.concat([
        games[['Match', 'Team', 'Score']].set_axis(['period', 'team', 'score'], axis=1),
        games[['Match', 'Opponent', 'OppScore']].set_axis(['period', 'team', 'score'], axis=1),
    ])
    active = rows[rows['status'] == 'active'].groupby(['period', 'team'])['fpts'].sum().rename('points').reset_index()
    both = scores.merge(active, on=['period', 'team'], how='left').fillna({'points': 0.0})
    off = both[(both['points'] - both['score']).abs() > 0.001]
    return [(int(r.period), r.team, float(r.points), float(r.score)) for r in off.itertuples()]


def _performance(row) -> dict:
    return {
        'period': int(row.period), 'team': row.team, 'player_id': row.player_id, 'player': row.player,
        'fpts': float(row.fpts), 'gp': int(row.gp),
    }


def compute_players(rows: pd.DataFrame, regular_periods: set[int], top_n: int = TOP_N) -> dict:
    """The season's player lists (regular season only).

    - best_periods: the most points by a player in the lineup in one period.
    - best_bench: the most points by a player left on the bench (not injured
      reserve or minors) in one period.
    - leaders: season points scored for a fantasy team (lineup only), with
      starts (periods in a lineup) and games played in them; a player traded
      during the season lists every team they scored for.
    - teams: per team, its points, the points its bench scored, and its top
      scorer.
    Equal values: the earlier period first, then by team and player.
    """
    r = rows[rows['period'].astype(int).isin(regular_periods)].copy()
    r['period'] = r['period'].astype(int)
    active = r[r['status'] == 'active']
    bench = r[r['status'] == 'bench']

    def top(df: pd.DataFrame) -> list[dict]:
        df = df.sort_values(['fpts', 'period', 'team', 'player'], ascending=[False, True, True, True], kind='stable')
        return [_performance(row) for row in df.head(top_n).itertuples()]

    by_player = active.groupby('player_id')
    leaders = pd.DataFrame({
        'player': by_player['player'].last(),
        'points': by_player['fpts'].sum(),
        'starts': by_player.size(),
        'gp': by_player['gp'].sum(),
    }).reset_index().sort_values(['points', 'player'], ascending=[False, True], kind='stable').head(top_n)
    # Teams in the order the player played for them
    teams_of = active.sort_values('period').groupby('player_id')['team'].unique()

    by_team_player = active.groupby(['team', 'player_id']).agg(player=('player', 'last'), points=('fpts', 'sum')).reset_index()
    top_scorer = by_team_player.sort_values(['points', 'player'], ascending=[False, True], kind='stable').groupby('team').head(1).set_index('team')
    team_points = active.groupby('team')['fpts'].sum()
    bench_points = bench.groupby('team')['fpts'].sum()

    return {
        'meta': {'periods': len(set(active['period'])), 'players': int(active['player_id'].nunique())},
        'best_periods': top(active),
        'best_bench': top(bench),
        'leaders': [{
            'player_id': row.player_id, 'player': row.player, 'teams': list(teams_of[row.player_id]),
            'points': round(float(row.points), 2), 'starts': int(row.starts), 'gp': int(row.gp),
        } for row in leaders.itertuples()],
        'teams': [{
            'team': team,
            'points': round(float(team_points[team]), 2),
            'bench_points': round(float(bench_points.get(team, 0.0)), 2),
            'top_scorer': {'player_id': top_scorer.loc[team, 'player_id'], 'player': top_scorer.loc[team, 'player'],
                           'points': round(float(top_scorer.loc[team, 'points']), 2)},
        } for team in sorted(team_points.index)],
    }
