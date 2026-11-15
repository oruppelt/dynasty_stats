"""
Do the transaction logs explain every roster change? Replays pipeline/data/transactions/ on the rosters in the
player cache (pipeline/data/players/) and prints what doesn't fit. Analysis for the player lineage
(ROADMAP.md section 3).

    .venv/bin/python pipeline/analysis/check_transactions.py

- Within a season: the roster at period p plus the moves effective in p+1, against the roster at p+1
  (regular season; eliminated teams aren't cached in the playoffs).
- Across seasons: each player's last cached team, the previous league's moves after that, then the new
  league's moves up to period 1 and its draft, against the period-1 rosters.

Rules the data needs (see ROADMAP.md, "What the transaction data showed"):
- moves at the same minute: trades first, then claims and drops in Fantrax's own order (the log is newest
  first), so a free-agency signing entered on the wrong team and fixed in the same minute replays right;
- a trade item "to (Drop)" is a drop; a drop or trade item for a player who isn't on that team changes nothing
  (fixes, and the 2025-26 record of the Lakers/Clippers swap);
- on 2025-06-27 the Lakers and Clippers owners swapped team names (`RENAMES`);
- in 2020-21 some trades show on the rosters a period after the log's period (the only expected mismatches).
"""
import collections
import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
SEASONS = [s['id'] for s in json.loads((ROOT / 'seasons.json').read_text())['seasons']][::-1]
RENAMES = [(pd.Timestamp('2025-06-27'), {'Los Angeles Lakers': 'Los Angeles Clippers',
                                          'Los Angeles Clippers': 'Los Angeles Lakers'})]

cd = pd.read_csv(DATA / 'transactions/claims_drops.csv', dtype={'player_id': str}, parse_dates=['date'])
tr = pd.read_csv(DATA / 'transactions/trades.csv', dtype={'player_id': str}, parse_dates=['date'], keep_default_na=False)
tr['date'] = pd.to_datetime(tr['date'])
dr = pd.read_csv(DATA / 'transactions/drafts.csv', dtype={'player_id': str}, parse_dates=['time'])
ro = pd.concat([pd.read_csv(DATA / f'players/{s}.csv', dtype={'player_id': str}).assign(season=s) for s in SEASONS])
names = {**dict(zip(cd.player_id, cd.player)), **dict(zip(ro.player_id, ro.player))}


def season_start(season: str) -> pd.Timestamp:
    data = json.loads((ROOT.parent / f'stats-app/public/data/seasons/{season}.json').read_text())
    return pd.Timestamp(data['schedule']['periods'][0]['start'])


def moves(season: str, lo: int, hi: int) -> list[tuple]:
    """(time, rank, -order, kind, player, from, to, period) effective in periods lo..hi of a league's log."""
    out = []
    for r in cd[(cd.season == season) & cd.period.between(lo, hi)].itertuples():
        if r.code in ('CLAIM', 'DROP'):
            claim = r.code == 'CLAIM'
            out.append((r.date, 1, -r.order, 'claim' if claim else 'drop', r.player_id,
                        None if claim else r.team, r.team if claim else None, r.period))
    t = tr[(tr.season == season) & (tr.kind == 'player') & tr.period.between(lo, hi)]
    for r in t.rename(columns={'from': 'src'}).itertuples():
        out.append((r.date, 0, -r.order, 'trade', r.player_id, r.src, None if r.to == '(Drop)' else r.to, r.period))
    return out


def replay(roster: dict, events: list[tuple], log: collections.Counter) -> dict:
    if events:
        lo, hi = min(e[0] for e in events), max(e[0] for e in events)
        events = events + [(when, -1, 0, 'rename', m, None, None, 0) for when, m in RENAMES if lo <= when <= hi]
    for _, _, _, kind, pid, src, dst, _ in sorted(events, key=lambda e: e[:3]):
        if kind == 'rename':
            roster = {p: pid.get(team, team) for p, team in roster.items()}
            log['team names swapped'] += 1
        elif kind in ('trade', 'drop') and roster.get(pid) != src:
            log[f'{kind} of a player not on that team (no effect)'] += 1
        else:
            if kind == 'claim' and roster.get(pid):
                log['claim of a player on another team (moves him)'] += 1
            if dst:
                roster[pid] = dst
            else:
                roster.pop(pid, None)
    return roster


def compare(expected: dict, actual: dict, log: collections.Counter, where: str, examples: list) -> None:
    for pid in set(expected) | set(actual):
        if expected.get(pid) != actual.get(pid):
            log['MISMATCH'] += 1
            examples.append(f'{where}: {names.get(pid, pid)} ({pid}) expected {expected.get(pid)}, roster {actual.get(pid)}')


def roster_at(season: str, period: int) -> dict:
    r = ro[(ro.season == season) & (ro.period == period)]
    return dict(zip(r.player_id, r.team))


def report(label: str, log: collections.Counter, examples: list) -> None:
    print(label, dict(log) or 'all explained')
    for line in examples[:12]:
        print('   ', line)


print('Within a season')
for s in SEASONS:
    log, ex = collections.Counter(), []
    r = ro[ro.season == s]
    teams = r.groupby('period').team.nunique()
    periods = sorted(r.period.unique())
    for p, q in zip(periods, periods[1:]):
        if teams[q] < teams[p]:
            break
        compare(replay(roster_at(s, p), moves(s, q, q), log), roster_at(s, q), log, f'{s} P{q}', ex)
    report(s, log, ex)

print('\nAcross seasons (end of the previous season to period 1)')
for prev, s in zip(SEASONS, SEASONS[1:]):
    log, ex = collections.Counter(), []
    last = ro[ro.season == prev].sort_values('period').groupby('player_id').last()
    seen = last['period'].to_dict()
    start = season_start(prev)
    tail = [m for m in moves(prev, 0, 99) if m[7] > seen.get(m[4], 0) and m[0] >= start]
    roster = replay(last['team'].to_dict(), tail, log)
    draft = dr[(dr.season == s) & dr.player_id.notna()]
    picks = [(t, 1, 0, 'claim', pid, None, team, 0) for t, pid, team in zip(draft.time, draft.player_id, draft.team)]
    compare(replay(roster, moves(s, 0, 1) + picks, log), roster_at(s, 1), log, s, ex)
    report(s, log, ex)
