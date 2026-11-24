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


def restore_zeroed_scores(games: pd.DataFrame, rows: pd.DataFrame) -> tuple[pd.DataFrame, list[tuple[int, str, float]]]:
    """Fantrax can void a game years later (a player then on IL no longer counts as injured, so the lineup is
    illegal) and shows the team's score as 0. Wherever a score is 0 but the team's active players scored, the
    score becomes their points (and the result follows). Any other score, however different, stays Fantrax's.
    Returns the games and the fixes: (period, team, points)."""
    if games.empty or rows is None or rows.empty:
        return games, []
    active = rows[rows['status'] == 'active'].groupby(['period', 'team'])['fpts'].sum()
    points = lambda period, team: round(float(active.get((int(period), team), 0.0)), 2)
    games = games.copy()
    fixes = []
    for i, g in games.iterrows():
        for team, col in ((g['Team'], 'Score'), (g['Opponent'], 'OppScore')):
            if g[col] == 0 and points(g['Match'], team) > 0:
                games.at[i, col] = points(g['Match'], team)
                fixes.append((int(g['Match']), team, points(g['Match'], team)))
    if fixes and 'Result' in games:
        won, tied = games['Score'] > games['OppScore'], games['Score'] == games['OppScore']
        games['Result'] = won.map({True: 'W', False: 'L'}).where(~tied, 'T')
        games['Winner'] = games['Team'].where(won, games['Opponent']).where(~tied, None)
        games['Loser'] = games['Opponent'].where(won, games['Team']).where(~tied, None)
    return games, fixes


def _performance(row) -> dict:
    entry = {
        'period': int(row.period), 'team': row.team, 'player_id': row.player_id, 'player': row.player,
        'fpts': float(row.fpts), 'gp': int(row.gp),
    }
    season = getattr(row, 'season', None)
    return {'season': season, **entry} if season else entry


def _top_periods(df: pd.DataFrame, n: int) -> list[dict]:
    """The `n` biggest single-period scores; equal points: the earlier period first, then by team and player."""
    keys = [k for k in ('season', 'period') if k in df.columns]
    df = df.sort_values(['fpts', *keys, 'team', 'player'], ascending=[False, *[True] * len(keys), True, True], kind='stable')
    return [_performance(row) for row in df.head(n).itertuples()]


def _leaders(active: pd.DataFrame, n: int | None, by: tuple[str, ...] = ('player_id',), pay: pd.DataFrame | None = None) -> list[dict]:
    """Points scored in lineups, per player (or per `by`, e.g. season and player): the top `n`, with the
    teams in the order the player scored for them, starts (periods in a lineup), games played in them, and
    for several seasons the number of seasons. With `pay` (season_salary or salary_paid rows), also the
    salary (summed over the same keys: pass rows for the same teams and seasons as `active`). `n` None: all."""
    if active.empty:
        return []
    order = [k for k in ('season', 'period') if k in active.columns]
    active = active.sort_values(order)
    groups = active.groupby(list(by), sort=False)
    table = pd.DataFrame({
        'player': groups['player'].last(),
        'points': groups['fpts'].sum(),
        'starts': groups.size(),
        'gp': groups['gp'].sum(),
        'teams': groups['team'].unique(),
        **({'seasons': groups['season'].nunique()} if 'season' in active.columns and 'season' not in by else {}),
    })
    if pay is not None:
        table['salary'] = pay.groupby(list(by))['paid'].sum().reindex(table.index).fillna(0.0)
    table = table.reset_index().sort_values(['points', 'player'], ascending=[False, True], kind='stable')
    if n is not None:
        table = table.head(n)
    leaders = []
    for row in table.itertuples():
        entry = {key: getattr(row, key) for key in by}
        entry.update({'player_id': row.player_id, 'player': row.player, 'teams': list(row.teams),
                      'points': round(float(row.points), 2), 'starts': int(row.starts), 'gp': int(row.gp)})
        if hasattr(row, 'seasons'):
            entry['seasons'] = int(row.seasons)
        if hasattr(row, 'salary'):
            entry['salary'] = int(round(float(row.salary)))
        leaders.append(entry)
    return leaders


def salary_paid(rows: pd.DataFrame, regular_periods: set[int], season_length: int | None = None) -> pd.DataFrame:
    """Salary paid in a regular season, per team and player: each period on the team's roster (any slot)
    costs 1/season_length of that period's salary. So a whole season costs the salary once, and a player
    cut, picked up or traded mid-season is split between the teams by periods. `season_length` is the
    season's number of regular-season periods (default: `regular_periods`, for a finished season; a
    season in progress passes its full length, so it shows the salary paid so far)."""
    length = season_length or len(regular_periods)
    r = rows[rows['period'].astype(int).isin(regular_periods)]
    if r.empty or not length:
        return pd.DataFrame(columns=['team', 'player_id', 'paid'])
    paid = r.groupby(['team', 'player_id'])['salary'].sum().astype(float) / length
    return paid.rename('paid').reset_index()


def season_salary(rows: pd.DataFrame, regular_periods: set[int], season_length: int | None = None) -> pd.DataFrame:
    """A player's salary for a regular season, whoever paid it: the salary in the player's last period on
    a roster that season, in full (a trade or a cut doesn't lower it). For a season in progress, the share
    of the season played so far (periods played / `season_length`)."""
    length = season_length or len(regular_periods)
    r = rows[rows['period'].astype(int).isin(regular_periods)]
    if r.empty or not length:
        return pd.DataFrame(columns=['player_id', 'paid'])
    last = r.assign(period=r['period'].astype(int)).sort_values('period', kind='stable').groupby('player_id')['salary'].last()
    return (last.astype(float) * min(1.0, len(regular_periods) / length)).rename('paid').reset_index()


def _split(rows: pd.DataFrame, periods: set[int]) -> tuple[pd.DataFrame, pd.DataFrame]:
    """The lineup and bench rows of `periods` (bench: not injured reserve or minors)."""
    r = rows[rows['period'].astype(int).isin(periods)].copy()
    r['period'] = r['period'].astype(int)
    return r[r['status'] == 'active'], r[r['status'] == 'bench']


PERIOD_BEST = 5
PERIOD_BENCH = 3
TEAM_PLAYERS = 5
PLAYOFF_TOP_N = 10


def compute_players(rows: pd.DataFrame, regular_periods: set[int], playoff_periods: set[int] = frozenset(),
                    top_n: int = TOP_N, season_length: int | None = None) -> dict:
    """The season's player lists. Regular season, apart from `playoffs`.

    - best_periods: the most points by a player in the lineup in one period.
    - best_bench: the most points by a player left on the bench (not injured
      reserve or minors) in one period.
    - leaders: season points scored for a fantasy team (lineup only), with
      starts (periods in a lineup) and games played in them; a player traded
      during the season lists every team they scored for.
    - teams: per team, its points, the points its bench scored, its top
      scorer, its top players and its best player period.
    - periods: per period, its best players, best bench players and each
      team's top scorer (for the recap).
    - playoffs: the best playoff periods and the playoff leaders; null
      before the playoffs.
    Equal values: the earlier period first, then by team and player.
    """
    active, bench = _split(rows, regular_periods)
    pay = season_salary(rows, regular_periods, season_length)

    teams = []
    for team, mine in active.groupby('team'):
        top_players = _leaders(mine, TEAM_PLAYERS)
        teams.append({
            'team': team,
            'points': round(float(mine['fpts'].sum()), 2),
            'bench_points': round(float(bench.loc[bench['team'] == team, 'fpts'].sum()), 2),
            'top_scorer': {k: top_players[0][k] for k in ('player_id', 'player', 'points')},
            'top_players': [{k: p[k] for k in ('player_id', 'player', 'points', 'starts', 'gp')} for p in top_players],
            'best_period': _top_periods(mine, 1)[0],
        })

    periods = []
    for period, played in active.groupby('period'):
        best_by_team = played.sort_values(['fpts', 'player'], ascending=[False, True], kind='stable').groupby('team').head(1)
        periods.append({
            'period': int(period),
            'best': _top_periods(played, PERIOD_BEST),
            'bench': _top_periods(bench[bench['period'] == period], PERIOD_BENCH),
            'team_top': {row.team: {'player_id': row.player_id, 'player': row.player, 'fpts': float(row.fpts), 'gp': int(row.gp)}
                         for row in best_by_team.sort_values('team').itertuples()},
        })

    playoff_active, _ = _split(rows, set(playoff_periods))
    return {
        'meta': {
            'periods': len(set(active['period'])), 'players': int(active['player_id'].nunique()),
            'regular_periods': sorted(int(p) for p in regular_periods),
            'playoff_periods': sorted(int(p) for p in playoff_periods),
            'season_length': season_length or len(regular_periods),
        },
        'best_periods': _top_periods(active, top_n),
        'best_bench': _top_periods(bench, top_n),
        'leaders': _leaders(active, top_n, pay=pay),
        'teams': teams,
        'periods': periods,
        'playoffs': {
            'best_periods': _top_periods(playoff_active, PLAYOFF_TOP_N),
            'leaders': _leaders(playoff_active, PLAYOFF_TOP_N),
        } if len(playoff_active) else None,
    }


FRANCHISE_TOP_N = 10
ALLTIME_PLAYOFF_TOP_N = 15
# Best value and share of team points: a season needs this many starts (about a third of a regular season)
VALUE_MIN_STARTS = 12


def _records(active: pd.DataFrame, top_n: int, salaries: pd.DataFrame, pay: pd.DataFrame) -> dict:
    """The lineup records over every season: best periods and seasons, career and franchise leaders.
    Seasons and careers have the player's salary (`salaries`: season_salary rows with the season), a
    franchise's scorers what that team paid them (`pay`: salary_paid rows with the season)."""
    return {
        'best_periods': _top_periods(active, top_n),
        'best_seasons': _leaders(active, top_n, by=('season', 'player_id'), pay=salaries),
        # Every player with a start: the site sorts and filters it (Career leaders)
        'career': _leaders(active, None, pay=salaries),
        'franchises': {team: [{k: v for k, v in p.items() if k != 'teams'}
                              for p in _leaders(mine, FRANCHISE_TOP_N, pay=pay[pay['team'] == team])]
                       for team, mine in sorted(active.groupby('team'), key=lambda t: t[0])},
    }


def compute_alltime_players(seasons: list[tuple[str, pd.DataFrame, set[int], set[int]]], top_n: int = TOP_N,
                            season_lengths: dict[str, int] | None = None) -> dict:
    """Player records over every season: (season, rows, regular periods, playoff periods), oldest first or not.

    - best_periods, best_bench: the biggest single-period scores ever, in a
      lineup and on a bench (regular season).
    - best_seasons: a player's points in one regular season (every team).
    - career: regular-season points over every season, for every player with a start (the site sorts it), with the seasons
      and teams.
    - franchises: per team, its all-time top scorers (points for that team).
    - with_playoffs: best_periods, best_seasons, career and franchises again,
      counting playoff points too (still lineup only).
    - Career and best seasons have the player's salary (`season_salary`),
      franchise lists what the team paid (`salary_paid`); `season_lengths`
      for seasons in progress.
    - playoffs: the best playoff periods and the career playoff leaders.
    Franchises are matched by team name (team IDs change every season).
    """
    regular, benches, playoff, last_rosters, pays, salaries = [], [], [], {}, [], []
    for season, rows, regular_periods, playoff_periods in seasons:
        active, bench = _split(rows, regular_periods)
        length = (season_lengths or {}).get(season)
        pays.append(salary_paid(rows, regular_periods, length).assign(season=season))
        salaries.append(season_salary(rows, regular_periods, length).assign(season=season))
        regular.append(active.assign(season=season))
        benches.append(bench.assign(season=season))
        playoff.append(_split(rows, playoff_periods)[0].assign(season=season))
        if regular_periods:
            last = rows[rows['period'].astype(int) == max(regular_periods)]
            last_rosters[season] = set(zip(last['team'], last['player_id']))
    regular, benches, playoff, pay, salary = (pd.concat(frames, ignore_index=True)
                                              for frames in (regular, benches, playoff, pays, salaries))
    return {
        'meta': {'seasons': sorted({s for s, *_ in seasons})},
        **_records(regular, top_n, salary, pay),
        'best_bench': _top_periods(benches, top_n),
        'with_playoffs': _records(pd.concat([regular, playoff], ignore_index=True), top_n, salary, pay),
        **_more_records(regular, top_n, salary),
        'continuity': _continuity(regular, last_rosters),
        'playoffs': {
            'best_periods': _top_periods(playoff, ALLTIME_PLAYOFF_TOP_N),
            'career': _leaders(playoff, ALLTIME_PLAYOFF_TOP_N),
        },
    }


def _more_records(regular: pd.DataFrame, top_n: int, salaries: pd.DataFrame) -> dict:
    """Regular-season lineup records beyond points:

    - longest_serving: most starts for one franchise (player and team).
    - franchise_starts: per team, its 10 players with the most starts.
    - journeymen: most franchises a player started for.
    - best_value: a season's points per $1M of the player's salary
      (`season_salary`; at least VALUE_MIN_STARTS starts).
    - team_share: a player's share of a team's lineup points in a season (at
      least VALUE_MIN_STARTS starts there).
    """
    if regular.empty:
        return {'longest_serving': [], 'franchise_starts': {}, 'journeymen': [], 'best_value': [], 'team_share': []}
    regular = regular.sort_values(['season', 'period'])

    stints = regular.groupby(['team', 'player_id'], sort=False).agg(
        player=('player', 'last'), starts=('fpts', 'size'), points=('fpts', 'sum'), gp=('gp', 'sum'),
        seasons=('season', 'nunique'), first=('season', 'first'), last=('season', 'last')).reset_index()
    stints = stints.sort_values(['starts', 'points'], ascending=False, kind='stable')

    def stint(row) -> dict:
        return {'player_id': row.player_id, 'player': row.player, 'team': row.team, 'starts': int(row.starts),
                'points': round(float(row.points), 2), 'gp': int(row.gp), 'seasons': int(row.seasons),
                'first': row.first, 'last': row.last}

    travel = regular.groupby('player_id', sort=False).agg(
        player=('player', 'last'), teams=('team', 'unique'), points=('fpts', 'sum'), starts=('fpts', 'size'),
        seasons=('season', 'nunique')).reset_index()
    travel['count'] = travel['teams'].map(len)
    travel = travel[travel['count'] > 1].sort_values(['count', 'points'], ascending=False, kind='stable').head(top_n)

    seasons = regular.groupby(['season', 'player_id'], sort=False).agg(
        player=('player', 'last'), teams=('team', 'unique'), points=('fpts', 'sum'), starts=('fpts', 'size'),
        contract=('contract', 'last')).reset_index()
    seasons = seasons.join(salaries.set_index(['season', 'player_id'])['paid'].rename('salary'), on=['season', 'player_id'])
    seasons = seasons[(seasons['starts'] >= VALUE_MIN_STARTS) & (seasons['salary'] > 0)].copy()
    seasons['per_million'] = seasons['points'] / (seasons['salary'] / 1e6)
    seasons = seasons.sort_values(['per_million', 'points'], ascending=False, kind='stable').head(top_n)

    team_points = regular.groupby(['season', 'team'])['fpts'].sum().rename('team_points')
    shares = regular.groupby(['season', 'team', 'player_id'], sort=False).agg(
        player=('player', 'last'), points=('fpts', 'sum'), starts=('fpts', 'size')).reset_index()
    shares = shares.join(team_points, on=['season', 'team'])
    shares['share'] = shares['points'] / shares['team_points']
    shares = shares[shares['starts'] >= VALUE_MIN_STARTS]
    shares = shares.sort_values(['share', 'points'], ascending=False, kind='stable').head(top_n)

    return {
        'longest_serving': [stint(r) for r in stints.head(top_n).itertuples()],
        'franchise_starts': {team: [stint(r) for r in mine.head(FRANCHISE_TOP_N).itertuples()]
                             for team, mine in sorted(stints.groupby('team', sort=False), key=lambda t: t[0])},
        'journeymen': [{'player_id': r.player_id, 'player': r.player, 'teams': list(r.teams),
                        'points': round(float(r.points), 2), 'starts': int(r.starts), 'seasons': int(r.seasons)}
                       for r in travel.itertuples()],
        'best_value': [{'season': r.season, 'player_id': r.player_id, 'player': r.player, 'teams': list(r.teams),
                        'points': round(float(r.points), 2), 'starts': int(r.starts), 'salary': int(round(float(r.salary))),
                        'contract': r.contract, 'per_million': round(float(r.per_million), 1)}
                       for r in seasons.itertuples()],
        'team_share': [{'season': r.season, 'team': r.team, 'player_id': r.player_id, 'player': r.player,
                        'points': round(float(r.points), 2), 'starts': int(r.starts),
                        'team_points': round(float(r.team_points), 2), 'share': round(float(r.share), 4)}
                       for r in shares.itertuples()],
    }


def _continuity(regular: pd.DataFrame, last_rosters: dict[str, set[tuple[str, str]]]) -> dict[str, dict[str, float]]:
    """Per season (apart from the first) and team: the share of its regular-season lineup points scored by
    players who were on its roster in the last regular-season period of the season before."""
    order = sorted(last_rosters)
    result = {}
    for before, season in zip(order, order[1:]):
        mine = regular[regular['season'] == season]
        if mine.empty:
            continue
        kept = pd.Series([(t, p) in last_rosters[before] for t, p in zip(mine['team'], mine['player_id'])],
                         index=mine.index)
        totals = mine.groupby('team')['fpts'].sum()
        kept_points = mine[kept].groupby('team')['fpts'].sum().reindex(totals.index, fill_value=0.0)
        result[season] = {team: round(float(kept_points[team] / totals[team]), 4) if totals[team] else 0.0
                          for team in totals.index}
    return result


def compute_player_pages(seasons: list[tuple[str, pd.DataFrame, set[int], set[int]]],
                         season_lengths: dict[str, int] | None = None) -> tuple[list[dict], dict[str, dict]]:
    """Every player's career, for the player page: (the search index, {player_id: page}).

    A page lists each season and team the player was on a roster (any
    status): periods there, starts, games and points in the lineup, bench
    points (regular season), playoff starts and points, and the salary and
    contract in the last period there, and the salary paid there
    (`salary_paid`), and the career salary (`season_salary`, every season). Plus the best 5 periods (lineup,
    regular season or playoffs). The index has each player's name, latest
    team and season, and career regular-season lineup points.
    """
    frames, pays, salaries = [], [], []
    for season, rows, regular_periods, playoff_periods in seasons:
        pays.append(salary_paid(rows, regular_periods, (season_lengths or {}).get(season)).assign(season=season))
        salaries.append(season_salary(rows, regular_periods, (season_lengths or {}).get(season)))
        r = rows.copy()
        r['period'] = r['period'].astype(int)
        r = r[r['period'].isin(regular_periods | playoff_periods)]
        r['season'] = season
        r['playoffs'] = r['period'].isin(playoff_periods)
        frames.append(r)
    if not frames:
        return [], {}
    rows = pd.concat(frames, ignore_index=True).sort_values(['season', 'period'], kind='stable')
    rows['lineup'] = rows['status'] == 'active'
    rows['regular_lineup'] = rows['lineup'] & ~rows['playoffs']
    rows['playoff_lineup'] = rows['lineup'] & rows['playoffs']
    rows['regular_bench'] = (rows['status'] == 'bench') & ~rows['playoffs']
    for key in ('regular_lineup', 'playoff_lineup', 'regular_bench'):
        rows[f'{key}_fpts'] = rows['fpts'].where(rows[key], 0.0)
        rows[f'{key}_gp'] = rows['gp'].where(rows[key], 0)

    stints = rows.groupby(['player_id', 'season', 'team'], sort=False).agg(
        player=('player', 'last'), first_period=('period', 'min'), periods=('period', 'nunique'),
        starts=('regular_lineup', 'sum'), gp=('regular_lineup_gp', 'sum'), points=('regular_lineup_fpts', 'sum'),
        bench_points=('regular_bench_fpts', 'sum'), playoff_starts=('playoff_lineup', 'sum'),
        playoff_points=('playoff_lineup_fpts', 'sum'), salary=('salary', 'last'), contract=('contract', 'last'),
    ).reset_index().sort_values(['season', 'first_period'], kind='stable')
    pay = pd.concat(pays, ignore_index=True).set_index(['player_id', 'season', 'team'])['paid']
    stints['paid'] = [float(pay.get((r.player_id, r.season, r.team), 0.0)) for r in stints.itertuples()]

    lineup = rows[rows['lineup']]
    best = lineup.sort_values(['fpts', 'season', 'period'], ascending=[False, True, True], kind='stable') \
        .groupby('player_id', sort=False).head(5)
    best_by_player = {pid: [{**_performance(r), 'playoffs': bool(r.playoffs)} for r in group.itertuples()]
                      for pid, group in best.groupby('player_id', sort=False)}

    career_salary = pd.concat(salaries, ignore_index=True).groupby('player_id')['paid'].sum()
    pages, index = {}, []
    for pid, mine in stints.groupby('player_id', sort=False):
        last = mine.iloc[-1]
        page_seasons = [{
            'season': r.season, 'team': r.team, 'periods': int(r.periods), 'starts': int(r.starts), 'gp': int(r.gp),
            'points': round(float(r.points), 2), 'bench_points': round(float(r.bench_points), 2),
            'playoff_starts': int(r.playoff_starts), 'playoff_points': round(float(r.playoff_points), 2),
            'salary': int(r.salary), 'contract': r.contract, 'paid': int(round(r.paid)),
        } for r in mine.itertuples()]
        points = round(float(mine['points'].sum()), 2)
        pages[pid] = {'player_id': pid, 'player': last.player, 'salary': int(round(float(career_salary.get(pid, 0.0)))),
                      'seasons': page_seasons,
                      'best_periods': best_by_player.get(pid, [])}
        index.append({'player_id': pid, 'player': last.player, 'team': last.team, 'season': last.season,
                      'points': points})
    index.sort(key=lambda p: (-p['points'], p['player']))
    return index, pages
