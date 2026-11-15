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
    orders = path / 'draft_orders.csv'
    read = lambda n, dates: pd.read_csv(path / f'{n}.csv', dtype={'player_id': str, 'bid': str, 'budget': str},
                                        parse_dates=dates, keep_default_na=False, na_values={'date': [''], 'time': ['']})
    return {'claims_drops': read('claims_drops', ['date']), 'trades': read('trades', ['date']),
            'drafts': read('drafts', ['time']),
            'draft_orders': pd.read_csv(orders) if orders.exists() else None}


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



def draft_season(year: int) -> str:
    """The league season whose draft uses a year's picks: 2020 -> '2020-21' (the draft before that season)."""
    return f'{year}-{(year + 1) % 100:02d}'


def parse_pick(text: str) -> tuple[str, int, int | None, str | None] | None:
    """'2021 Draft Pick Round 2 (Milwaukee Bucks)' -> ('2021-22', 2, None, 'Milwaukee Bucks');
    '2019 Draft Pick Round 2 Pick 24' -> ('2019-20', 2, 24, None). The owner is the original one, as named then."""
    m = re.match(r'(\d{4}) Draft Pick Round (\d+)\s*(?:Pick (\d+))?\s*(?:\((.*)\))?', str(text).strip())
    if not m:
        return None
    year, rnd, slot, owner = m.groups()
    return draft_season(int(year)), int(rnd), int(slot) if slot else None, owner.strip() if owner else None


def _expected_orders(round1: list[str], worst_first: list[str] | None) -> dict[int, list[str]]:
    """The expected order of each round, by original team. Round 2 is round 1's order, except that the 14
    lottery teams pick worst first by the previous season's record (round 1 has the lottery's order)."""
    round2 = round1
    if worst_first:
        lottery = [t for t in worst_first if t in round1[:14]]
        if len(lottery) == 14:
            round2 = lottery + round1[14:]
    return {1: round1, 2: round2}


def compute_picks(tx: dict[str, pd.DataFrame], standings: dict[str, list[str]] | None = None) -> tuple[dict, dict]:
    """Every draft pick with a known path: ({pick key: pick}, {(trade set, order): pick key}).

    A pick is (draft season, round, original team); its key is '<season>/<round>/<original team>' (today's
    names). The trades are replayed from the original owners to draft day, and each team's picks are matched
    to the slots it drafted in, in the expected order (`_expected_orders`; `standings`: {season: teams, worst
    first} for round 2's lottery). `certain` when the team had one pick in that round, or round 1's order
    confirms it. A pick a team made without holding one (moves before the logs) has no original team: skipped.
    pick = {season, round, slot, overall, original, picker, player_id, certain, chain: [moves, oldest first]}.
    """
    dr, tr = tx['drafts'], tx['trades']
    orders = tx.get('draft_orders')
    traded = tr[tr['kind'] == 'pick'].copy()
    traded = traded.sort_values(['date', 'order'], ascending=[True, False], kind='stable')
    traded['parsed'] = traded['pick'].map(parse_pick)
    picks, items = {}, {}
    prev = lambda season: f'{int(season[:4]) - 1}-{int(season[:4]) % 100:02d}'
    for season, drafted in dr.groupby('season'):
        when = drafted['time'].min()
        teams = sorted({franchise(t, when) for t in drafted['team']})
        order = orders[orders['season'] == season].sort_values('pick') if orders is not None else None
        given = [franchise(t, when) for t in order['team']] if order is not None and len(order) else []
        worst = (standings or {}).get(prev(season))
        fallback = [t for t in (worst or []) if t in teams] or teams
        rounds = sorted(int(r) for r in drafted['round'].unique())
        made = drafted[drafted['round'] == 1].sort_values('pick')
        per_round = int(made['pick'].max()) if len(made) else 30  # picks are numbered across the rounds

        def replay(round1):
            expect = _expected_orders(round1, worst)
            holder = {(r, t): t for r in rounds for t in round1}
            chains, keys = {}, {}
            for t in traded[traded['parsed'].map(lambda p: p is not None and p[0] == season)].itertuples():
                _, rnd, slot, orig = t.parsed
                src, dst = franchise(t._5, t.date), franchise(t.to, t.date)  # _5: 'from'
                if orig is not None:
                    orig = franchise(orig, t.date)
                elif slot is not None and rnd in expect and slot <= len(expect[rnd]):
                    orig = expect[rnd][slot - 1]
                    if holder.get((rnd, orig)) != src:  # the slot is a guess: else the sender's only pick in the round
                        held = [o for (r, o), h in holder.items() if r == rnd and h == src]
                        orig = held[0] if len(held) == 1 else None
                if orig is None:
                    continue
                holder[(rnd, orig)] = dst  # the log wins over the replay (a few moves are missing from it)
                chains.setdefault((rnd, orig), []).append(
                    {'date': t.date, 'season': t.season, 'period': int(t.period), 'from': t._5.strip(), 'to': t.to.strip(),
                     'trade': t.set, 'label': pick_label(t.pick)})
                keys[(t.set, t.order)] = f'{season}/{rnd}/{orig}'
            return expect, holder, chains, keys

        # Fantrax's round-1 order, if the picks follow it: the team that made each pick held that slot's pick
        # (2020-21's doesn't: then the previous season's standings, worst first)
        known = False
        if given:
            expect, holder, chains, keys = replay(given)
            fits = sum(holder.get((1, given[int(r.pick) - 1])) == franchise(r.team, when)
                       for r in made.itertuples() if int(r.pick) <= len(given))
            known = fits >= 0.5 * len(made)
        round1 = given if known else fallback
        if not known:
            expect, holder, chains, keys = replay(round1)
        items.update(keys)
        for rnd, rows in drafted.groupby('round'):
            rnd = int(rnd)
            first = int(per_round * (rnd - 1)) + 1
            for picker, mine in rows.groupby(rows['team'].map(lambda t: franchise(t, when))):
                held = sorted((o for (r, o), h in holder.items() if r == rnd and h == picker),
                              key=lambda o: expect.get(rnd, round1).index(o) if o in expect.get(rnd, round1) else 99)
                mine = mine.sort_values('pick')
                slots = [int(r.pick) - first + 1 for r in mine.itertuples()]
                if rnd == 1 and known:
                    # Round 1's order is known: the slot says whose pick it was
                    assigned = [(round1[k - 1], True) for k in slots]
                elif len(held) == len(mine):
                    order_ = expect.get(rnd, round1)
                    assigned = [(o, len(held) == 1 or (k <= len(order_) and order_[k - 1] == o)) for k, o in zip(slots, held)]
                else:
                    order_ = expect.get(rnd, round1)
                    assigned = [(order_[k - 1], False) if k <= len(order_) and order_[k - 1] in held else (None, False)
                                for k in slots]
                for r, slot, (orig, certain) in zip(mine.itertuples(), slots, assigned):
                    if orig is None:
                        continue
                    picks[f'{season}/{rnd}/{orig}'] = {
                        'season': season, 'round': rnd, 'slot': slot, 'overall': int(r.pick), 'original': orig,
                        'picker': picker, 'player_id': r.player_id if isinstance(r.player_id, str) and r.player_id else None,
                        'certain': bool(certain), 'chain': chains.get((rnd, orig), [])}
    return picks, items


def _money(text: str) -> float | None:
    try:
        return float(str(text).replace('$', '').replace(',', ''))
    except ValueError:
        return None


def compute_timelines(seasons: list[tuple[str, pd.DataFrame, set[int], set[int]]],
                      tx: dict[str, pd.DataFrame], standings: dict[str, list[str]] | None = None,
                      all_trades: dict | None = None) -> dict[str, dict]:
    """{player_id: {'events': [...], 'trades': {set: trade}}}, events oldest first.

    A drafted player's timeline starts with the pick he was drafted with, when it was traded (`compute_picks`):
    'pick' (its original team) and 'pick-trade' events; a traded pick in a trade says who it became.
    `all_trades`, if given, gets every trade, each item with its `result` and `next` (`_trade_results`), for
    the trade trees.

    `seasons` is as for players.compute_player_pages (season, cached rows, regular periods, playoff periods),
    oldest or newest first.
    """
    order = {s: i for i, s in enumerate(sorted(s for s, *_ in seasons))}
    regular = {s: reg for s, _, reg, _ in seasons}

    # Roster observations: (season, period) -> team, with what he did that period
    obs = []
    for season, rows, reg, _ in seasons:
        r = rows[['period', 'team', 'player_id', 'status', 'fpts', 'gp', 'salary', 'contract']].copy()
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
    picks, pick_items = compute_picks(tx, standings)
    names = {}
    for _, rows, _, _ in seasons:
        names.update(zip(rows['player_id'], rows['player']))
    drafted_with = {p['player_id']: p for p in picks.values() if p['player_id']}
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
                                 else f'${_money(i.budget):g} budget' if _money(i.budget) is not None else i.kind),
                       'became': _became(picks.get(pick_items.get((set_id, i['order']), '')), names),
                       'pick_key': pick_items.get((set_id, i['order']))}
                      for _, i in items.iterrows()]}
    for r in tr[tr['kind'] == 'player'].rename(columns={'from': 'src'}).itertuples():
        add(r.player_id, r.season, int(r.period), r.date, 0, -r.order,
            {'kind': 'trade', 'season': r.season, 'period': int(r.period), 'date': r.date, 'from': r.src,
             'team': None if r.to == '(Drop)' else r.to, 'trade': r.set})
    per_round = dr[dr['round'] == 1].groupby('season')['pick'].max()
    for r in dr[dr['player_id'] != ''].itertuples():
        p = drafted_with.get(r.player_id) if (drafted_with.get(r.player_id) or {}).get('season') == r.season else None
        add(r.player_id, r.season, 0, r.time, 0, 0,
            {'kind': 'draft', 'season': r.season, 'period': 0, 'date': r.time, 'team': r.team,
             'round': int(r.round), 'pick': int(r.pick) - int(per_round.get(r.season, 30)) * (int(r.round) - 1),
             'overall': int(r.pick),
             'original': franchise(p['original'], r.time) if p and p['original'] != franchise(r.team, r.time) else None,
             'certain': p['certain'] if p else None})
        if p and p['chain']:
            # The pick's path: held by its original team from two seasons before its draft (or the records' start)
            draft_time = r.time
            year = int(r.season[:4])
            start = max(f'{year - 2}-{(year - 1) % 100:02d}', min(order))
            label = p['chain'][0]['label']
            add(r.player_id, start, 1, None, -1, 0,
                {'kind': 'pick', 'season': start, 'period': 1, 'date': None,
                 'team': franchise(p['original'], _season_time(start)), 'label': label})
            for k, m in enumerate(p['chain']):
                # A move on draft day sorts before the draft (period 0)
                period = 0 if m['season'] == r.season and m['date'] <= draft_time else m['period']
                add(r.player_id, m['season'], period, m['date'], -1, k,
                    {'kind': 'pick-trade', 'season': m['season'], 'period': m['period'], 'date': m['date'],
                     'from': m['from'], 'team': m['to'], 'trade': m['trade'], 'label': m['label']})

    first_season = min(order, key=order.get)
    first_period = int(obs[obs['season'] == first_season]['period'].min())
    latest = (int(obs['key_season'].max()), int(obs[obs['key_season'] == obs['key_season'].max()]['period'].max())) \
        if len(obs) else None
    timelines, rostered = {}, {}
    for pid, seen in obs.groupby('player_id', sort=False):
        last = seen.iloc[-1]
        rostered[pid] = (int(last.key_season), int(last.period)) == latest
        events = sorted(moves.get(pid, []), key=lambda m: (m[0], m[1], m[2] if pd.notna(m[2]) else pd.Timestamp.min,
                                                             m[3], m[4]))
        timeline, team, last_drop = [], None, None
        arrival = None  # the timeline event of the current stint

        def arrive(event, to_team):
            nonlocal team, arrival
            team = franchise(to_team, _when(event))
            event.update({'periods': 0, 'starts': 0, 'gp': 0, 'points': 0.0, 'salary': None, 'contract': None})
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
                if kind in ('pick', 'pick-trade'):
                    timeline.append(event)
                    continue
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
                        arrival['gp'] += int(row.gp)
                        arrival['points'] += float(row.fpts)

        timelines[pid] = timeline

    _trade_results(trades, timelines, rostered, picks)
    if all_trades is not None:
        all_trades.update({t: _clean_trade(trade) for t, trade in trades.items()})
    out = {}
    for pid, timeline in timelines.items():
        used = {e['trade'] for e in timeline if e.get('trade')}
        out[pid] = {'events': [_clean(e) for e in timeline],
                    'trades': {t: _clean_trade(trades[t]) for t in used}}
    return out


def _trade_results(trades: dict, timelines: dict[str, list[dict]], rostered: dict[str, bool], picks: dict) -> None:
    """What each side of a trade got out of it, on each item as `result`: a player's regular season with the
    team that got him, until he left it (`ongoing` if he is still there); a pick, the same for the player
    drafted with it, if that team used it (`traded_on` if it went on before the draft, with the team that
    `drafted_by` it). And `next`, what that team did with it after: {'trade': id} (traded it away),
    {'dropped': date}, {'kept': True} (still there), or absent (it left without a logged move). For a pick the
    team used, that is the drafted player's next move."""
    moves_after = {}  # (pid, index of an arrival) -> next

    def player_next(pid, k):
        timeline = timelines.get(pid, [])
        for e in timeline[k + 1:]:
            if e['kind'] == 'trade':
                return {'trade': e['trade']}
            if e['kind'] == 'drop':
                return {'dropped': _date(e['date'])}
            if e['kind'] in ('claim', 're-sign', 'joined', 'draft'):
                return None
        return {'kept': True} if rostered.get(pid) else None

    arrivals, drafted = {}, {}
    for pid, timeline in timelines.items():
        moves = [k for k, e in enumerate(timeline) if e['kind'] not in ('renamed', 'pick', 'pick-trade')]
        for k, e in enumerate(timeline):
            if 'periods' not in e:
                continue
            ongoing = bool(moves) and k == moves[-1] and rostered.get(pid, False)
            stat = {'points': round(e['points'], 2), 'starts': e['starts'], 'gp': e['gp'], 'periods': e['periods'],
                    'ongoing': ongoing}
            if e['kind'] == 'trade':
                arrivals[(e['trade'], pid)] = stat
                moves_after[(e['trade'], pid)] = player_next(pid, k)
            elif e['kind'] == 'draft':
                drafted[pid] = (franchise(e['team'], _when(e)), stat)
                moves_after[('draft', pid)] = player_next(pid, k)
    for set_id, trade in trades.items():
        when = trade['date']
        for item in trade['items']:
            if item['kind'] == 'player' and item['player_id']:
                item['result'] = arrivals.get((set_id, item['player_id']))
                item['next'] = moves_after.get((set_id, item['player_id']))
            elif item['kind'] == 'pick':
                pick = picks.get(item.get('pick_key') or '')
                chain = pick['chain'] if pick else []
                at = next((k for k, m in enumerate(chain) if m['trade'] == set_id), None)
                if at is not None and at + 1 < len(chain):
                    item['next'] = {'trade': chain[at + 1]['trade']}
                if not item.get('became'):
                    continue
                team, stat = drafted.get(item['became']['player_id'], (None, None))
                if team is not None and team == franchise(item['to'], when):
                    item['result'] = stat
                    item['next'] = moves_after.get(('draft', item['became']['player_id']))
                elif team is not None:
                    item['result'] = {'traded_on': True, 'drafted_by': team}


def _became(pick: dict | None, names: dict) -> dict | None:
    """A traded pick's outcome, for the trade panel: who was drafted with it."""
    if not pick or not pick['player_id']:
        return None
    return {'season': pick['season'], 'round': pick['round'], 'pick': pick['slot'], 'overall': pick['overall'],
            'player_id': pick['player_id'], 'player': names.get(pick['player_id']), 'certain': pick['certain']}


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
            'items': [{k: v for k, v in i.items() if v is not None and k != 'pick_key'} for i in trade['items']]}



def compute_axis(seasons: list[tuple[str, pd.DataFrame, set[int], set[int]]]) -> list[dict]:
    """The league's seasons, oldest first, for the timeline's career strip: [{'season', 'length',
    'playoffs_from'}] (length: the periods played so far; playoffs_from: the first playoff period, or None)."""
    return [{'season': season, 'length': int(max(reg | playoffs)),
             'playoffs_from': int(min(playoffs)) if playoffs else None}
            for season, _, reg, playoffs in sorted(seasons, key=lambda s: s[0]) if reg | playoffs]
