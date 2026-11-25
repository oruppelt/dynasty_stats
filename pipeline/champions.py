"""
Champions' players (History → Champions on the site): data/champions.json.

A player has a ring for a season when they scored for the champion that season (lineup points above 0, regular
season or playoffs), and lost a final when they scored for the runner-up. For each title:

- `seasons`: the champion's players (newest season first), with their regular-season and playoff points for it, the
  points in the final, starts, games and the salary the champion paid (players.salary_paid);
- `players`: the top RING_TOP_N players by rings, then finals reached, then points in finals; with what they
  scored for the champions in their title seasons (points, playoffs, finals, starts, salary).

Franchises are matched by team name, like the rest of the site.
"""
import pandas as pd

import players

RING_TOP_N = 30


def final_periods(data: dict, champion: str | None, runner_up: str | None) -> list[int]:
    """The periods of a season's final: the knockout's "Final" series, or in an earlier format the playoff games
    between the champion and the runner-up."""
    playoffs = data.get('playoffs')
    if playoffs:
        return sorted({g['period'] for rnd in playoffs['knockout'] if rnd['name'] == 'Final'
                       for s in rnd['series'] for g in s['games']})
    return sorted({g['period'] for g in data.get('playoff_games') or []
                   if {g['team'], g['opponent']} == {champion, runner_up}})


def _team_players(rows: pd.DataFrame, team: str, regular: set[int], playoff: set[int], final: set[int],
                  pay: pd.DataFrame) -> pd.DataFrame:
    """Every player who scored for `team` (lineup points above 0): points, playoff and finals points, starts, games
    and the salary the team paid, one row per player."""
    r = rows[(rows['team'] == team) & (rows['status'] == 'active')].copy()
    r['period'] = r['period'].astype(int)
    r = r[r['period'].isin(regular | playoff)]
    if r.empty:
        return pd.DataFrame(columns=['player_id', 'player', 'points', 'playoff_points', 'finals_points',
                                     'starts', 'playoff_starts', 'gp', 'salary'])
    r = r.sort_values('period', kind='stable')
    is_playoff = r['period'].isin(playoff)
    g = r.groupby('player_id', sort=False)
    table = pd.DataFrame({
        'player': g['player'].last(),
        'points': r[~is_playoff].groupby('player_id')['fpts'].sum(),
        'playoff_points': r[is_playoff].groupby('player_id')['fpts'].sum(),
        'finals_points': r[r['period'].isin(final)].groupby('player_id')['fpts'].sum(),
        'starts': r[~is_playoff].groupby('player_id').size(),
        'playoff_starts': r[is_playoff].groupby('player_id').size(),
        'gp': g['gp'].sum(),
        'total': g['fpts'].sum(),
    }).fillna(0.0)
    paid = pay[pay['team'] == team].set_index('player_id')['paid']
    table['salary'] = paid.reindex(table.index).fillna(0.0)
    table = table[table['total'] > 0].drop(columns='total')
    return table.reset_index()


def _row(r) -> dict:
    return {'player_id': r.player_id, 'player': r.player, 'points': round(float(r.points), 2),
            'playoff_points': round(float(r.playoff_points), 2), 'finals_points': round(float(r.finals_points), 2),
            'starts': int(r.starts), 'playoff_starts': int(r.playoff_starts), 'gp': int(r.gp),
            'salary': int(round(float(r.salary)))}


def compute_champions(seasons: list[dict], top_n: int = RING_TOP_N) -> dict:
    """data/champions.json from the finished seasons with a champion: dicts with season, champion, runner_up,
    rows (the player cache), regular_periods, playoff_periods and final_periods."""
    titles, won, lost = [], [], []
    for s in sorted(seasons, key=lambda s: s['season'], reverse=True):
        regular, playoff, final = set(s['regular_periods']), set(s['playoff_periods']), set(s['final_periods'])
        pay = players.salary_paid(s['rows'], regular)
        champ = _team_players(s['rows'], s['champion'], regular, playoff, final, pay)
        champ = champ.sort_values(['points', 'playoff_points', 'player'], ascending=[False, False, True], kind='stable')
        titles.append({'season': s['season'], 'champion': s['champion'], 'runner_up': s.get('runner_up'),
                       'final_periods': sorted(final), 'players': [_row(r) for r in champ.itertuples()]})
        won.append(champ.assign(season=s['season'], team=s['champion']))
        if s.get('runner_up'):
            runner = _team_players(s['rows'], s['runner_up'], regular, playoff, final, pay)
            lost.append(runner.assign(season=s['season'], team=s['runner_up']))

    won = pd.concat(won, ignore_index=True) if won else pd.DataFrame()
    lost = pd.concat(lost, ignore_index=True) if lost else pd.DataFrame(columns=['player_id', 'player', 'season', 'team', 'finals_points'])
    if won.empty:
        return {'seasons': titles, 'players': [], 'ring_holders': 0}
    names = pd.concat([won, lost], ignore_index=True).sort_values('season', kind='stable').groupby('player_id')['player'].last()
    out = []
    for pid in set(won['player_id']) | set(lost['player_id']):
        w, lo = won[won['player_id'] == pid], lost[lost['player_id'] == pid]
        out.append({
            'player_id': pid, 'player': names[pid],
            'rings': len(w), 'finals_lost': len(lo),
            'titles': [{'season': x.season, 'team': x.team} for x in w.sort_values('season').itertuples()],
            'lost': [{'season': x.season, 'team': x.team} for x in lo.sort_values('season').itertuples()],
            # Everything for the champion, in the title seasons (a lost final is only counted)
            'points': round(float(w['points'].sum()), 2), 'playoff_points': round(float(w['playoff_points'].sum()), 2),
            'finals_points': round(float(w['finals_points'].sum()), 2),
            'starts': int(w['starts'].sum() + w['playoff_starts'].sum()), 'gp': int(w['gp'].sum()),
            'salary': int(round(float(w['salary'].sum()))),
        })
    out = [p for p in out if p['rings']]
    out.sort(key=lambda p: (-p['rings'], -(p['rings'] + p['finals_lost']), -p['finals_points'], -p['playoff_points'], p['player']))
    return {'seasons': titles, 'players': out[:top_n], 'ring_holders': len(out)}
