"""
Fantrax league data: the schedule and the score of every game.

Fantrax has two undocumented APIs:
- `fxea/general/*` is public. `getLeagueInfo` has the teams, the scoring
  periods with their dates, every matchup (future ones too) and the playoff
  settings, but no scores.
- `fxpa/req` is what the Fantrax website itself calls. `getStandings` with
  view SCHEDULE has the scores, but only for a logged-in member of the league.
  Logging in takes a reCAPTCHA, so a script can't do it: it borrows the
  session cookie of a browser that is logged in (FANTRAX_COOKIE, see
  `fetch_scores`).

Fantrax's own standings are never used: they parse badly with ties (half
wins) and records are worked out from the scores anyway (league_data.py).
Both responses change without notice, so their shape is checked and anything
unexpected fails loudly; build_data.py then leaves the old data in place.
"""
import json
import re
import urllib.parse
import urllib.request
from datetime import datetime, timezone

import pandas as pd

from league_data import COLUMNS, UNUSED_COLUMNS

PUBLIC_API = 'https://www.fantrax.com/fxea/general'
PRIVATE_API = 'https://www.fantrax.com/fxpa/req'
# Fantrax rejects requests without a browser-like user agent
USER_AGENT = 'Mozilla/5.0 (dynasty-stats pipeline)'
TIMEOUT = 60

GAME_COLUMNS = [c for c in COLUMNS if c not in UNUSED_COLUMNS]
# Columns of each period's table in the SCHEDULE view
SCORE_COLUMNS = ('away', 'fpts', 'home', 'fpts')


class FantraxError(Exception):
    pass


def _get_json(request: urllib.request.Request) -> dict | list:
    request.add_header('User-Agent', USER_AGENT)
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        return json.load(response)


def fetch_league_info(league_id: str) -> dict:
    """Public league info: teams, scoring periods, matchups, playoff settings."""
    query = urllib.parse.urlencode({'leagueId': league_id})
    info = _get_json(urllib.request.Request(f'{PUBLIC_API}/getLeagueInfo?{query}'))
    if 'error' in info:
        raise FantraxError(f'getLeagueInfo failed for league {league_id}: {info["error"]}')
    return info


def fetch_scores(league_id: str, cookie: str) -> dict:
    """The league schedule with scores (getStandings, view SCHEDULE).

    `cookie` is the Cookie header of a browser logged in to Fantrax as a member
    of the league: in the browser's developer tools, open any request to
    fantrax.com/fxpa/req and copy the value of its `cookie` request header.
    """
    body = {'msgs': [{'method': 'getStandings', 'data': {'leagueId': league_id, 'view': 'SCHEDULE'}}]}
    request = urllib.request.Request(
        f'{PRIVATE_API}?{urllib.parse.urlencode({"leagueId": league_id})}',
        data=json.dumps(body).encode(),
        headers={'Content-Type': 'application/json', 'Cookie': cookie},
    )
    return check_private_response(_get_json(request))


def check_private_response(response: dict) -> dict:
    """The data of a one-message fxpa response, or a clear error."""
    error = response.get('pageError')
    if error:
        code = error.get('code', '')
        if code == 'WARNING_NOT_LOGGED_IN':
            raise FantraxError('Fantrax says the session is not logged in: FANTRAX_COOKIE is missing or has '
                               'expired. Log in on fantrax.com and copy a fresh cookie (see fantrax.fetch_scores).')
        if code == 'NOT_MEMBER_OF_LEAGUE':
            raise FantraxError('The logged-in Fantrax account is not a member of this league.')
        raise FantraxError(f'Fantrax error {code}: {error.get("text") or error.get("title") or error}')
    try:
        return response['responses'][0]['data']
    except (KeyError, IndexError, TypeError):
        raise FantraxError(f'Unexpected Fantrax response: {str(response)[:300]}')


def _parse_time(value: str) -> datetime:
    # e.g. '2025-10-24T18:29:59.0-0400'
    return datetime.strptime(value, '%Y-%m-%dT%H:%M:%S.%f%z')


def _score(cell: dict) -> float:
    return float(str(cell['content']).replace(',', ''))


def _period_number(caption: str) -> int | None:
    match = re.fullmatch(r'Scoring Period (\d+)', caption.strip())
    return int(match.group(1)) if match else None


def games_from_fantrax(info: dict, scores: dict, now: datetime | None = None) -> pd.DataFrame:
    """Played regular-season games, in the same table as league_data.load_games().

    A game is played once its scoring period has ended; the period in progress
    is left out (its scores keep changing, and unplayed games read 0-0).
    Playoff periods are left out: the stats cover the regular season only.
    Each game appears once, as Team (away) vs Opponent (home).
    """
    now = now or datetime.now(timezone.utc)
    names = {team_id: team['name'].strip() for team_id, team in info['teamInfo'].items()}
    last_regular = info['playoffs']['lastRegularSeasonPeriod']
    ended = {p['number'] for p in info['scoringPeriods'] if _parse_time(p['endDate']) < now}
    scheduled = {
        m['period']: {frozenset((g['away']['id'], g['home']['id'])) for g in m['matchupList']}
        for m in info['matchups']
    }

    rows = []
    for table in scores.get('tableList', []):
        period = _period_number(table.get('caption', ''))
        if period is None or period > last_regular or period not in ended:
            continue
        columns = tuple(cell.get('key') for cell in table.get('header', {}).get('cells', []))
        if columns != SCORE_COLUMNS:
            raise FantraxError(f'Period {period}: unexpected columns {columns}; the Fantrax response may have changed.')
        for row in table['rows']:
            away, away_score, home, home_score = row['cells'][:4]
            pair = frozenset((away.get('teamId'), home.get('teamId')))
            if pair not in scheduled.get(period, set()):
                raise FantraxError(f'Period {period}: {away.get("content")} vs {home.get("content")} '
                                   'is not in the league schedule; the Fantrax response may have changed.')
            rows.append((names[away['teamId']], _score(away_score), names[home['teamId']], _score(home_score), period))

    if not rows:
        return pd.DataFrame(columns=GAME_COLUMNS)
    games = pd.DataFrame(rows, columns=['Team', 'Score', 'Opponent', 'OppScore', 'Match'])
    for period in sorted(games['Match'].unique()):
        expected = len(scheduled.get(period, ()))
        found = int((games['Match'] == period).sum())
        if found != expected:
            raise FantraxError(f'Period {period}: {found} scored games, but the schedule has {expected}.')

    games['Period'] = 'Scoring Period ' + games['Match'].astype(str)
    won = games['Score'] > games['OppScore']
    tied = games['Score'] == games['OppScore']
    games['Result'] = won.map({True: 'W', False: 'L'}).where(~tied, 'T')
    games['Winner'] = games['Team'].where(won, games['Opponent']).where(~tied, None)
    games['Loser'] = games['Opponent'].where(won, games['Team']).where(~tied, None)
    return games[GAME_COLUMNS].sort_values(['Match', 'Team'], ignore_index=True)


def load_games(league_id: str, cookie: str) -> pd.DataFrame:
    """Played regular-season games of a Fantrax league (needs a logged-in cookie)."""
    return games_from_fantrax(fetch_league_info(league_id), fetch_scores(league_id, cookie))
