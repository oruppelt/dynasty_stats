"""
Fetch every season's transactions and drafts from Fantrax into pipeline/data/transactions/ (analysis for the
player lineage, ROADMAP.md section 3; nothing in the build reads these yet).

    FANTRAX_COOKIE="$(cat ~/.fantrax_cookie)" .venv/bin/python pipeline/analysis/fetch_transactions.py

Writes:
- trades.csv: one row per traded item (kind player, pick or budget); `set` groups a trade's items; `order` is
  the row's position in Fantrax's list (newest first), which orders moves made in the same minute.
- claims_drops.csv: claims and drops (code CLAIM, DROP, or LINEUP_CHANGE: 5 rows, no effect); a claim and the
  drop that made room for it share a `set`.
- drafts.csv: every draft pick (round, pick, team that picked, player, time in US Eastern).
- draft_orders.csv: each draft's round-1 order; future_picks.csv: each league's next two years of picks with
  the original owner and the owner at the end of that league; teams.csv: team IDs and names per league.
Dates are US Eastern, as Fantrax shows them; `period` is the period the move takes effect in (the log's
"week"); team names are the names at the time of the move.
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import fantrax  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'transactions'
EASTERN = ZoneInfo('America/New_York')


def private(league_id: str, cookie: str, method: str, **data) -> dict:
    body = {'msgs': [{'method': method, 'data': {'leagueId': league_id, **data}}]}
    request = urllib.request.Request(f'{fantrax.PRIVATE_API}?leagueId={league_id}', data=json.dumps(body).encode(),
                                     headers={'Content-Type': 'application/json', 'Cookie': cookie})
    return fantrax.check_private_response(fantrax._get_json(request))


def public(path: str, **query) -> dict:
    time.sleep(6)  # getDraftResults allows one call every 5 seconds
    return fantrax._get_json(urllib.request.Request(f'{fantrax.PUBLIC_API}/{path}?{urllib.parse.urlencode(query)}'))


def log_rows(league_id: str, cookie: str, view: str) -> list[dict]:
    rows, page = [], 1
    while True:
        data = private(league_id, cookie, 'getTransactionDetailsHistory', maxResultsPerPage='500', view=view,
                       pageNumber=str(page))
        rows += data['table'].get('rows', [])
        if page >= data['paginatedResultSet']['totalNumPages']:
            return rows
        page += 1


def _date(text: str):
    return datetime.strptime(text, '%a %b %d, %Y, %I:%M%p') if text else None


def _cells(row: dict) -> dict:
    return {c['key']: c for c in row['cells']}


def claims_drops(season: str, rows: list[dict]) -> list[dict]:
    out, team, date = [], None, None
    for i, r in enumerate(rows):
        c = _cells(r)
        # The team and date are on a set's first row only
        team = c['team']['content'].strip() if 'team' in c else team
        date = _date(c['date']['content']) if 'date' in c else date
        out.append({'season': season, 'set': r['txSetId'], 'order': i, 'code': r['transactionCode'], 'team': team,
                    'date': date, 'period': int(c['week']['content']), 'player_id': r['scorer'].get('scorerId'),
                    'player': r['scorer'].get('name'), 'bid': (c.get('bid') or {}).get('content', '')})
    return out


def trades(season: str, rows: list[dict]) -> list[dict]:
    out, date = [], None
    for i, r in enumerate(rows):
        c = _cells(r)
        date = _date(c['date']['content']) if 'date' in c else date
        scorer = r.get('scorer') or {}
        pick = r.get('draftPickDisplayParts') or {}
        kind = 'player' if scorer.get('scorerId') else 'pick' if pick else 'budget' if 'budgetAmountTradeObj' in r else '?'
        out.append({'season': season, 'set': r['txSetId'], 'order': i, 'kind': kind,
                    'from': c['from']['content'].strip(), 'to': c['to']['content'].strip(), 'date': date,
                    'period': int(c['week']['content']), 'player_id': scorer.get('scorerId'), 'player': scorer.get('name'),
                    'pick': f"{pick.get('year', '')} {pick.get('roundInfo', '')}".replace('<b>', '').replace('</b>', '') if pick else '',
                    'budget': (r.get('budgetAmountTradeObj') or {}).get('budget', '')})
    return out


def main() -> None:
    cookie = os.environ.get('FANTRAX_COOKIE')
    if not cookie:
        raise SystemExit('Needs FANTRAX_COOKIE')
    seasons = json.loads((ROOT / 'seasons.json').read_text())['seasons'][::-1]  # oldest first
    tables = {name: [] for name in ('claims_drops', 'trades', 'drafts', 'draft_orders', 'future_picks', 'teams')}
    for s in seasons:
        sid, lid = s['id'], s['fantrax_league_id']
        names = {t['id']: t['name'].strip() for t in fantrax.fetch_league_info(lid)['teamInfo'].values()}
        tables['teams'] += [{'season': sid, 'team_id': k, 'team': v} for k, v in names.items()]
        tables['claims_drops'] += claims_drops(sid, log_rows(lid, cookie, 'CLAIM_DROP'))
        tables['trades'] += trades(sid, log_rows(lid, cookie, 'TRADE'))
        draft = public('getDraftResults', leagueId=lid)
        for p in draft.get('draftPicks') or []:
            when = datetime.fromtimestamp(p['time'] / 1000, EASTERN).replace(tzinfo=None) if p.get('time') else None
            tables['drafts'].append({'season': sid, 'round': p['round'], 'pick': p['pick'],
                                     'team': names.get(p.get('teamId'), p.get('teamId')), 'player_id': p.get('playerId'),
                                     'time': when})
        tables['draft_orders'] += [{'season': sid, 'draft_date': draft['draftDate'][:10], 'draft_type': draft.get('draftType'),
                                    'pick': i + 1, 'team': names.get(t, t)} for i, t in enumerate(draft.get('draftOrder') or [])]
        for f in public('getDraftPicks', leagueId=lid).get('futureDraftPicks') or []:
            tables['future_picks'].append({'season': sid, 'year': f['year'], 'round': f['round'],
                                           'original': names.get(f['originalOwnerTeamId']), 'owner': names.get(f['currentOwnerTeamId'])})
        print(sid, 'done')
    OUT.mkdir(parents=True, exist_ok=True)
    for name, rows in tables.items():
        pd.DataFrame(rows).to_csv(OUT / f'{name}.csv', index=False)
    print({name: len(rows) for name, rows in tables.items()})


if __name__ == '__main__':
    main()
