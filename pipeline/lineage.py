"""
Player lineage: how each player moved between teams, for the player page's timeline.

Reads the transaction logs in data/transactions/ (from analysis/fetch_transactions.py) and replays them per
player, with the roster cache (data/players/) as the check:
- events: drafted, signed (a claim; "re-signed" when the team that dropped him signs him back), traded,
  dropped; plus "joined" when the rosters show a player on a team that no logged move explains (the rosters
  from before the logs, and the few arrivals Fantrax didn't log);
- every arrival gets the contract he played on (his first period on that team after it) and what he did
  there until he left (periods, starts and lineup points, regular season);
- a trade event links the whole trade, so the page can show what came back.

The rules come from analysis/check_transactions.py (findings in ROADMAP.md section 3): at the same minute,
trades first, then claims and drops in Fantrax's order; a trade item "to (Drop)" is a drop; a trade or drop
of a player who isn't on that team changes nothing; the Lakers and Clippers owners swapped team names on
2025-06-27 (`RENAMES`: teams are followed by owner, names are shown as they were at the time).
"""
from __future__ import annotations

import re
from pathlib import Path

import pandas as pd

DATA = Path(__file__).resolve().parent / 'data' / 'transactions'
RENAMES = [(pd.Timestamp('2025-06-27'), {'Los Angeles Lakers': 'Los Angeles Clippers',
                                          'Los Angeles Clippers': 'Los Angeles Lakers'})]


def read_transactions(path: Path = DATA) -> dict[str, pd.DataFrame] | None:
    """The logs (claims_drops, trades, drafts), or None if they haven't been fetched."""
    names = ('claims_drops', 'trades', 'drafts')
    if not all((path / f'{n}.csv').exists() for n in names):
        return None
    read = lambda n, dates: pd.read_csv(path / f'{n}.csv', dtype={'player_id': str, 'bid': str, 'budget': str},
                                        parse_dates=dates, keep_default_na=False, na_values={'date': [''], 'time': ['']})
    return {'claims_drops': read('claims_drops', ['date']), 'trades': read('trades', ['date']),
            'drafts': read('drafts', ['time'])}


def franchise(team: str, when: pd.Timestamp | None) -> str:
    """The team's name today (after every rename), so a team is followed by its owner."""
    for date, mapping in RENAMES:
        if when is not None and not pd.isna(when) and when < date:
            team = mapping.get(team, team)
    return team


def pick_label(text: str) -> str:
    """'2021 Draft Pick Round 2 (Milwaukee Bucks)' -> '2021 round 2 pick (Milwaukee Bucks)';
    '2019 Draft Pick Round 2 Pick 24' -> '2019 round 2 pick, no. 24'."""
    m = re.match(r'(\d{4}) Draft Pick Round (\d+)\s*(?:Pick (\d+))?\s*(?:\((.*)\))?', text.strip())
    if not m:
        return text.strip()
    year, rnd, slot, owner = m.groups()
    label = f'{year} round {rnd} pick'
    if slot:
        label += f', no. {slot}'
    if owner:
        label += f' ({owner.strip()})'
    return label


def _money(text: str) -> float | None:
    try:
        return float(str(text).replace('$', '').replace(',', ''))
    except ValueError:
        return None


def compute_timelines(seasons: list[tuple[str, pd.DataFrame, set[int], set[int]]],
                      tx: dict[str, pd.DataFrame]) -> dict[str, dict]:
    """{player_id: {'events': [...], 'trades': {set: trade}}}, events oldest first.

    `seasons` is as for players.compute_player_pages (season, cached rows, regular periods, playoff periods),
    oldest or newest first.
    """
    order = {s: i for i, s in enumerate(sorted(s for s, *_ in seasons))}
    regular = {s: reg for s, _, reg, _ in seasons}

    # Roster observations: (season, period) -> team, with what he did that period
    obs = []
    for season, rows, reg, _ in seasons:
        r = rows[['period', 'team', 'player_id', 'status', 'fpts', 'salary', 'contract']].copy()
        r['period'] = r['period'].astype(int)
        r['season'] = season
        r['regular'] = r['period'].isin(reg)
        obs.append(r)
    obs = pd.concat(obs, ignore_index=True)
    obs = obs[obs['season'].isin(order)]
    obs['key_season'] = obs['season'].map(order)
    obs = obs.sort_values(['key_season', 'period'], kind='stable')

    # Logged moves per player: (season index, period, date, rank, -order, event)
    cd, tr, dr = tx['claims_drops'], tx['trades'], tx['drafts']
    moves: dict[str, list[tuple]] = {}

    def add(pid, season, period, date, rank, sub, event):
        if season in order and pid:
            moves.setdefault(pid, []).append((order[season], period, date, rank, sub, event))

    for r in cd[cd['code'].isin(['CLAIM', 'DROP'])].itertuples():
        claim = r.code == 'CLAIM'
        add(r.player_id, r.season, int(r.period), r.date, 1, -r.order,
            {'kind': 'claim' if claim else 'drop', 'season': r.season, 'period': int(r.period), 'date': r.date,
             'team': r.team.strip(), 'bid': _money(r.bid) if claim else None})
    trades = {}
    for set_id, items in tr.groupby('set', sort=False):
        first = items.iloc[0]
        trades[set_id] = {
            'date': first['date'], 'season': first['season'], 'period': int(first['period']),
            'items': [{'kind': i.kind, 'from': i['from'], 'to': i['to'], 'player_id': i.player_id or None,
                       'player': i.player or None,
                       'label': (i.player if i.kind == 'player' else pick_label(i.pick) if i.kind == 'pick'
                                 else f'${_money(i.budget):g} budget' if _money(i.budget) is not None else i.kind)}
                      for _, i in items.iterrows()]}
    for r in tr[tr['kind'] == 'player'].rename(columns={'from': 'src'}).itertuples():
        add(r.player_id, r.season, int(r.period), r.date, 0, -r.order,
            {'kind': 'trade', 'season': r.season, 'period': int(r.period), 'date': r.date, 'from': r.src,
             'team': None if r.to == '(Drop)' else r.to, 'trade': r.set})
    for r in dr[dr['player_id'] != ''].itertuples():
        add(r.player_id, r.season, 0, r.time, 0, 0,
            {'kind': 'draft', 'season': r.season, 'period': 0, 'date': r.time, 'team': r.team,
             'round': int(r.round), 'pick': int(r.pick)})

    first_season = min(order, key=order.get)
    first_period = int(obs[obs['season'] == first_season]['period'].min())
    out = {}
    for pid, seen in obs.groupby('player_id', sort=False):
        events = sorted(moves.get(pid, []), key=lambda m: (m[0], m[1], m[2] if pd.notna(m[2]) else pd.Timestamp.min,
                                                             m[3], m[4]))
        timeline, team, last_drop = [], None, None
        arrival = None  # the timeline event of the current stint

        def arrive(event, to_team):
            nonlocal team, arrival
            team = franchise(to_team, _when(event))
            event.update({'periods': 0, 'starts': 0, 'points': 0.0, 'salary': None, 'contract': None})
            arrival = event

        def leave():
            nonlocal team, arrival
            team, arrival = None, None

        pending = list(RENAMES)

        def renamed(when):
            # A team he is on changes its name: a marker, so the names on the timeline add up
            while pending and when >= pending[0][0]:
                date, mapping = pending.pop(0)
                shown = timeline[-1].get('team') if timeline and arrival is not None else None
                if shown in mapping:
                    timeline.append({'kind': 'renamed', 'season': None, 'period': None, 'date': date,
                                     'from': shown, 'team': mapping[shown]})

        i = 0
        rows = list(seen.itertuples())
        for j, row in enumerate(rows + [None]):
            key = (row.key_season, row.period) if row is not None else (len(order), 0)
            # The moves effective up to this period, then the roster that period
            while i < len(events) and (events[i][0], events[i][1]) <= key:
                event = dict(events[i][5])
                i += 1
                kind, when = event['kind'], _when(event)
                renamed(when)
                if kind in ('trade', 'drop') and team != franchise(event['team' if kind == 'drop' else 'from'], when):
                    continue  # not on that team: changes nothing
                if kind == 'drop' or (kind == 'trade' and event['team'] is None):
                    if kind == 'trade':
                        event = {**event, 'kind': 'drop', 'team': event['from']}
                        event.pop('trade', None)
                        event.pop('from', None)
                    last_drop = franchise(event['team'], when)
                    timeline.append(event)
                    leave()
                    continue
                if kind == 'claim' and team is None and last_drop == franchise(event['team'], when):
                    event['kind'] = 're-sign'
                timeline.append(event)
                arrive(event, event['team'])
            if row is None:
                break
            renamed(_season_time(row.season))
            here = franchise(row.team, _season_time(row.season))
            if here != team:
                # A trade the rosters show a period late (2020-21): the old team still has him
                late = timeline and timeline[-1]['kind'] == 'trade' and \
                    franchise(timeline[-1]['from'], _when(timeline[-1])) == here and \
                    timeline[-1]['season'] == row.season and timeline[-1]['period'] == row.period
                if late:
                    continue
                event = {'kind': 'joined', 'season': row.season, 'period': int(row.period), 'date': None,
                         'team': row.team, 'before_logs': row.season == first_season and row.period == first_period}
                timeline.append(event)
                arrive(event, row.team)
            if arrival is not None:
                if arrival['salary'] is None:
                    arrival['salary'], arrival['contract'] = int(row.salary), row.contract
                if row.regular:
                    arrival['periods'] += 1
                    if row.status == 'active':
                        arrival['starts'] += 1
                        arrival['points'] += float(row.fpts)

        used = {e['trade'] for e in timeline if e.get('trade')}
        out[pid] = {'events': [_clean(e) for e in timeline],
                    'trades': {t: _clean_trade(trades[t]) for t in used}}
    return out


def _when(event: dict) -> pd.Timestamp:
    """When a move happened; a time in its league's season when the log has none."""
    date = event.get('date')
    return _season_time(event['season']) if date is None or pd.isna(date) else date


def _season_time(season: str) -> pd.Timestamp:
    """A time inside a league's season, for the team names its rosters use."""
    return pd.Timestamp(f'{int(season[:4])}-12-01')


def _date(value) -> str | None:
    return None if value is None or pd.isna(value) else pd.Timestamp(value).strftime('%Y-%m-%d')


def _clean(event: dict) -> dict:
    e = {k: v for k, v in event.items() if v is not None}
    e['date'] = _date(event.get('date'))
    if 'points' in e:
        e['points'] = round(e['points'], 2)
    return e


def _clean_trade(trade: dict) -> dict:
    return {'date': _date(trade['date']), 'season': trade['season'], 'period': trade['period'],
            'items': [{k: v for k, v in i.items() if v is not None} for i in trade['items']]}


def compute_tracks(seasons: list[tuple[str, pd.DataFrame, set[int], set[int]]]) -> dict[str, dict]:
    """{player_id: track}, the per-period data behind the timeline's career strip.

    track = {'seasons': [{'season', 'length', 'playoffs_from'}] from his first season on the rosters to the
    newest (length: the periods played so far; playoffs_from: the first playoff period, or null),
    'teams': [names], 'periods': [[season index, period, team index, fpts, 1 if in the lineup]]}.
    """
    axis, frames = [], []
    for season, rows, reg, playoffs in sorted(seasons, key=lambda s: s[0]):
        played = reg | playoffs
        if not played:
            continue
        axis.append({'season': season, 'length': int(max(played)), 'playoffs_from': int(min(playoffs)) if playoffs else None})
        r = rows[['period', 'team', 'player_id', 'status', 'fpts']].copy()
        r['period'] = r['period'].astype(int)
        r = r[r['period'].isin(played)]
        r['season'] = len(axis) - 1
        frames.append(r)
    if not frames:
        return {}
    rows = pd.concat(frames, ignore_index=True).sort_values(['season', 'period'], kind='stable')
    out = {}
    for pid, mine in rows.groupby('player_id', sort=False):
        start = int(mine['season'].min())
        teams = list(dict.fromkeys(mine['team']))
        out[pid] = {'seasons': axis[start:], 'teams': teams,
                    'periods': [[int(r.season) - start, int(r.period), teams.index(r.team), round(float(r.fpts), 2),
                                 int(r.status == 'active')] for r in mine.itertuples()]}
    return out
