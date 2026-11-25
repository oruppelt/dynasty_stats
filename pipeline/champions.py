"""
Champions' players (History → Champions on the site): data/champions.json.

A player has a ring for a season when they scored for the champion that season (lineup points above 0, regular
season or playoffs), and lost a final when they were on the runner-up's roster (lineup or bench) in a period of the
final. For each title:

- `seasons`: the champion's players (newest season first), with their regular-season and playoff points for it, the
  points in the final, starts, games and the salary the champion paid (players.salary_paid);
- `players`: every ring holder by rings, then finals reached, then points in finals (lineup points in every final,
  won or lost); with their career playoff points and starts (any team).

Franchises are matched by team name, like the rest of the site.
"""
import pandas as pd

import players

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


def compute_champions(seasons: list[dict], career: pd.DataFrame | None = None) -> dict:
    """data/champions.json from the finished seasons with a champion: dicts with season, champion, runner_up,
    rows (the player cache), regular_periods, playoff_periods and final_periods. `career`: career_playoffs."""
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
            lost.append(_finalists(s['rows'], s['runner_up'], final).assign(season=s['season'], team=s['runner_up']))

    won = pd.concat(won, ignore_index=True) if won else pd.DataFrame()
    lost = pd.concat(lost, ignore_index=True) if lost else pd.DataFrame(columns=['player_id', 'player', 'season', 'team', 'finals_points'])
    if won.empty:
        return {'seasons': titles, 'players': [], 'ring_holders': 0}
    names = pd.concat([won, lost], ignore_index=True).sort_values('season', kind='stable').groupby('player_id')['player'].last()
    career = career if career is not None else pd.DataFrame(columns=['playoff_points', 'playoff_starts'])
    out = []
    for pid in set(won['player_id']):
        w, lo = won[won['player_id'] == pid], lost[lost['player_id'] == pid]
        mine = career.loc[pid] if pid in career.index else None
        out.append({
            'player_id': pid, 'player': names[pid],
            'rings': len(w), 'finals_lost': len(lo),
            'titles': [{'season': x.season, 'team': x.team} for x in w.sort_values('season').itertuples()],
            'lost': [{'season': x.season, 'team': x.team} for x in lo.sort_values('season').itertuples()],
            # Lineup points in every final, won or lost
            'finals_points': round(float(w['finals_points'].sum() + lo['finals_points'].sum()), 2),
            # Career playoffs, any team
            'playoff_points': round(float(mine['playoff_points']), 2) if mine is not None else 0.0,
            'playoff_starts': int(mine['playoff_starts']) if mine is not None else 0,
        })
    out.sort(key=lambda p: (-p['rings'], -(p['rings'] + p['finals_lost']), -p['finals_points'], -p['playoff_points'], p['player']))
    return {'seasons': titles, 'players': out, 'ring_holders': len(out)}


def _finalists(rows: pd.DataFrame, team: str, final: set[int]) -> pd.DataFrame:
    """Everyone on `team`'s roster (lineup or bench) in a period of the final, with their lineup points in it."""
    r = rows[(rows['team'] == team) & rows['period'].astype(int).isin(final) & rows['status'].isin(['active', 'bench'])]
    if r.empty:
        return pd.DataFrame(columns=['player_id', 'player', 'finals_points'])
    points = r['fpts'].where(r['status'] == 'active', 0.0)
    return (r.assign(finals_points=points).groupby('player_id')
            .agg(player=('player', 'last'), finals_points=('finals_points', 'sum')).reset_index())


def career_playoffs(seasons: list[tuple[pd.DataFrame, set[int]]]) -> pd.DataFrame:
    """Lineup points and starts in the playoffs over every season, any team, by player_id: (rows, playoff periods)."""
    frames = [rows[(rows['status'] == 'active') & rows['period'].astype(int).isin(periods)] for rows, periods in seasons]
    frames = [f for f in frames if not f.empty]
    if not frames:
        return pd.DataFrame(columns=['playoff_points', 'playoff_starts'])
    r = pd.concat(frames, ignore_index=True)
    return r.groupby('player_id').agg(playoff_points=('fpts', 'sum'), playoff_starts=('fpts', 'size'))
