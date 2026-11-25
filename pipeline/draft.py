"""
The drafts (History → Draft on the site): data/draft.json.

Every pick of every draft (pipeline/data/transactions/drafts.csv), with what the player became: their seasons since
(teams, contract, salary, points), points in the rookie deal's 3 seasons, points for the team that drafted them, the
money earned and the average salary after the rookie deal.

A pick's value:
- `salary`: the average salary after the rookie deal (the league's own price for the player; 0 when nobody signed
  him), for the drafts whose 4th season has started;
- `points` for the newer ones: points in the regular season on any roster (lineup or bench), so neither the lineup
  calls nor a playoff run of the team holding him count.

`expected` is what the pick's slot usually gives: the average value of the picks within SLOT_WINDOW of it in every
draft compared (for points, every draft over the same span: as many seasons, the last one up to the same period).
`vs_slot` is value minus expected, and `score` puts it in average first-rounders (vs_slot / the first round's
average value), so the drafts measured by salary and by points add up for `teams`: each team's draft score (the
picks it made; the draft in progress and unused picks are left out), hit rate (picks above their slot) and points for itself.

Teams are today's names (lineage.franchise).
"""
import pandas as pd

import lineage

ROOKIE_SEASONS = 3
SLOT_WINDOW = 2   # a slot is compared with the picks up to 2 either side


def compute_draft(drafts: pd.DataFrame, seasons: list[dict], known: dict[str, str] | None = None) -> dict:
    """data/draft.json. `drafts`: drafts.csv (season, round, pick: overall, team, player_id, time). `seasons`:
    oldest first, dicts with season, rows (the player cache), regular_periods, playoff_periods and season_length
    (the regular season's full length; more than regular_periods while in progress). `known`: names of players
    never on a roster (from the claims and trades logs)."""
    order = [s['season'] for s in seasons]
    if not order:
        return {'drafts': [], 'teams': []}
    rows = _rows(seasons)
    played = {s['season']: max(s['regular_periods'], default=0) for s in seasons}
    current = order[-1]
    stats = _season_stats(rows, seasons)
    names = {**(known or {}), **rows.sort_values(['idx', 'period'], kind='stable').groupby('player_id')['player'].last()}

    picks, drafted = [], {}
    for d in drafts.sort_values(['season', 'pick'], kind='stable').itertuples():
        if d.season not in order:
            continue
        i = order.index(d.season)
        team = lineage.franchise(d.team, pd.Timestamp(d.time) if d.time else None)
        pid = d.player_id or None
        # Drafted before: a placeholder for a rookie not in Fantrax yet (who came in by hand). A miss: what the
        # player did belongs to his earlier pick
        redraft = drafted.get(pid)
        if pid:
            drafted.setdefault(pid, d.season)
        mine = stats[(stats['player_id'] == pid) & (stats['idx'] >= i)] if pid and not redraft else stats.iloc[0:0]
        after = mine[mine['idx'] >= i + ROOKIE_SEASONS]
        picks.append({
            'season': d.season, 'round': int(d.round), 'pick': int(d.pick), 'slot': int(d.pick) - 30 * (int(d.round) - 1),
            'team': team, 'player_id': pid, 'player': names.get(pid) if pid else None, 'idx': i, 'redraft': redraft,
            'rookie_points': float(mine.loc[mine['idx'] < i + ROOKIE_SEASONS, 'points'].sum()),
            'points': float(mine['points'].sum()), 'playoff_points': float(mine['playoff_points'].sum()),
            'starts': int(mine['starts'].sum()), 'playoff_starts': int(mine['playoff_starts'].sum()),
            'earned': float(mine['paid'].sum()),
            'salary_after': float(after['salary'].mean()) if len(after) else 0.0,
            'seasons_after': len(after),
            'team_points': float(rows.loc[(rows['player_id'] == pid) & (rows['franchise'] == team) & (rows['idx'] >= i)
                                          & (rows['status'] == 'active'), 'fpts'].sum()) if pid and not redraft else 0.0,
            'history': [_season(r) for r in mine.itertuples()],
        })

    # The value of each draft: salary once its 4th season has started, else points over the span played so far
    by_draft: dict[str, list[dict]] = {}
    for p in picks:
        by_draft.setdefault(p['season'], []).append(p)
    out = []
    for season, ps in by_draft.items():
        i = order.index(season)
        if i + ROOKIE_SEASONS < len(order):
            metric = 'salary'
            pool = [p for p in picks if p['idx'] + ROOKIE_SEASONS < len(order) and _rookie(p)]
            value = {id(p): p['salary_after'] for p in pool}
        else:
            metric = 'points'
            span, upto = len(order) - i, played[current]
            pool = [p for p in picks if p['idx'] + span <= len(order) and _rookie(p)]
            window = _window(rows, span, upto)
            value = {id(p): 0.0 if p['redraft'] else window.get((p['player_id'], p['idx']), 0.0) for p in pool}
        first = [value[id(p)] for p in pool if p['round'] == 1]
        unit = sum(first) / len(first) if first else 0.0
        for p in ps:
            p['metric'] = metric
            if not _rookie(p):
                p.update(value=None, expected=None, vs_slot=None, score=None)
                continue
            near = [value[id(q)] for q in pool if abs(q['pick'] - p['pick']) <= SLOT_WINDOW]
            expected = sum(near) / len(near) if near else 0.0
            v = value[id(p)]
            p.update(value=v, expected=expected, vs_slot=v - expected, score=(v - expected) / unit if unit else 0.0)
        out.append({'season': season, 'metric': metric, 'in_progress': season == current,
                    'rookie_deal_over': i + ROOKIE_SEASONS < len(order), 'picks': [_pick(p) for p in ps]})
    out.sort(key=lambda d: d['season'], reverse=True)
    return {'drafts': out, 'teams': _teams(picks, current)}


def _rookie(p: dict) -> bool:
    """A pick that was used (a re-drafted player too: a miss, value 0)."""
    return bool(p['player_id'])


def _rows(seasons: list[dict]) -> pd.DataFrame:
    """The player cache of every season, with the season's index and the franchise (today's name)."""
    frames = []
    for i, s in enumerate(seasons):
        r = s['rows'].copy()
        r['period'] = r['period'].astype(int)
        r['idx'] = i
        r['season'] = s['season']
        r['regular'] = r['period'].isin(set(s['regular_periods']))
        r['playoff'] = r['period'].isin(set(s['playoff_periods']))
        when = lineage._season_time(s['season'])
        r['franchise'] = [lineage.franchise(t, when) for t in r['team']]
        frames.append(r)
    return pd.concat(frames, ignore_index=True)


def _season_stats(rows: pd.DataFrame, seasons: list[dict]) -> pd.DataFrame:
    """One row per player and season: teams, contract and salary (last on a roster), lineup points and starts in
    the regular season and playoffs, and the salary paid (regular season, by periods on a roster, every team)."""
    lineup = rows['status'] == 'active'
    r = rows.assign(points=rows['fpts'].where(lineup & rows['regular'], 0.0),
                    playoff_points=rows['fpts'].where(lineup & rows['playoff'], 0.0),
                    starts=(lineup & rows['regular']).astype(int), playoff_starts=(lineup & rows['playoff']).astype(int))
    r = r.sort_values(['idx', 'period'], kind='stable')
    g = r.groupby(['player_id', 'idx'], sort=False)
    table = g.agg(season=('season', 'first'), contract=('contract', 'last'), salary=('salary', 'last'),
                  points=('points', 'sum'), playoff_points=('playoff_points', 'sum'),
                  starts=('starts', 'sum'), playoff_starts=('playoff_starts', 'sum'))
    table['teams'] = g['franchise'].agg(lambda t: list(dict.fromkeys(t)))
    lengths = {i: s.get('season_length') or len(s['regular_periods']) for i, s in enumerate(seasons)}
    reg = r[r['regular']]
    paid = reg.groupby(['player_id', 'idx'])['salary'].sum().astype(float)
    paid = paid / [lengths[i] for i in paid.index.get_level_values('idx')]
    table['paid'] = paid.reindex(table.index).fillna(0.0)
    return table.reset_index()


def _window(rows: pd.DataFrame, span: int, upto: int) -> dict[tuple[str, int], float]:
    """Regular-season points on any roster from a draft's season over `span` seasons, the last one up to period
    `upto`: {(player_id, draft's season index): points}, for every draft season."""
    reg = rows[rows['regular']]
    out: dict[tuple[str, int], float] = {}
    for start in sorted(rows['idx'].unique()):
        last = start + span - 1
        r = reg[(reg['idx'] >= start) & (reg['idx'] <= last)]
        r = r[(r['idx'] < last) | (r['period'] <= upto)]
        for pid, pts in r.groupby('player_id')['fpts'].sum().items():
            out[(pid, int(start))] = float(pts)
    return out


def _season(r) -> dict:
    return {'season': r.season, 'teams': r.teams, 'contract': r.contract, 'salary': int(r.salary),
            'points': round(float(r.points), 2), 'playoff_points': round(float(r.playoff_points), 2),
            'starts': int(r.starts), 'playoff_starts': int(r.playoff_starts)}


def _pick(p: dict) -> dict:
    out = {k: v for k, v in p.items() if k != 'idx'}
    for k in ('rookie_points', 'points', 'playoff_points', 'team_points', 'value', 'expected', 'vs_slot'):
        if out.get(k) is not None:
            out[k] = round(out[k], 2)
    for k in ('earned', 'salary_after'):
        out[k] = int(round(out[k]))
    if out.get('metric') == 'salary':
        for k in ('value', 'expected', 'vs_slot'):
            if out[k] is not None:
                out[k] = int(round(out[k]))
    if out.get('score') is not None:
        out['score'] = round(out['score'], 3)
    return out


def _teams(picks: list[dict], current: str) -> list[dict]:
    """Each team's drafting over the drafts done (not the one in progress): draft score (sum of the picks' scores),
    per pick, hits (picks above their slot), its best and worst pick, and the points its picks scored for it."""
    teams: dict[str, list[dict]] = {}
    for p in picks:
        if p['season'] != current and _rookie(p):
            teams.setdefault(p['team'], []).append(p)
    out = []
    for team, ps in teams.items():
        best, worst = max(ps, key=lambda p: p['score']), min(ps, key=lambda p: p['score'])
        total = sum(p['points'] + p['playoff_points'] for p in ps)
        mine = sum(p['team_points'] for p in ps)
        out.append({
            'team': team, 'picks': len(ps), 'first_round': sum(p['round'] == 1 for p in ps),
            'score': round(sum(p['score'] for p in ps), 2),
            'per_pick': round(sum(p['score'] for p in ps) / len(ps), 3),
            'hits': sum(p['vs_slot'] > 0 for p in ps),
            'best': _ref(best), 'worst': _ref(worst),
            'team_points': round(mine, 2), 'points': round(total, 2),
            'kept': round(mine / total, 3) if total else None,
        })
    out.sort(key=lambda t: (-t['score'], t['team']))
    return out


def _ref(p: dict) -> dict:
    return {'season': p['season'], 'pick': p['pick'], 'player_id': p['player_id'], 'player': p['player'],
            'score': round(p['score'], 2)}
