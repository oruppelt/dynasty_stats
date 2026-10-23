"""
Build the static league data file that the site serves.

Usage (from the repo root):
    python pipeline/build_data.py                     # read the league Google Sheet
    python pipeline/build_data.py --source <sheet>    # another sheet (link or ID)
    python pipeline/build_data.py --source games.csv  # or a local CSV
    python pipeline/build_data.py --fantrax <league_id>  # a Fantrax league instead of the sheet

Fantrax is used when --fantrax or the FANTRAX_LEAGUE_ID environment variable
(a GitHub repository variable in the Action) names a league. It needs
FANTRAX_COOKIE, a logged-in browser's cookie (see fantrax.fetch_scores).

The sheet defaults to the LEAGUE_SHEET environment variable (a sheet link or
ID; the GitHub Action sets it from a repository variable), else the sheet in
league_data.py. That way a new season's sheet needs no code change.

Writes stats-app/public/data/league.json. The file is only rewritten when the
data changes, and its `updated_at` (the "Updated ..." time in the header) only
moves then. That keeps the scheduled GitHub Action from committing when
nothing is new. A source without any played games (e.g. a new season's sheet
before the first period) leaves the existing data in place.
"""
import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

import fantrax
from league_data import SHEET_ID, compute_league, load_games, sheet_csv_url

DEFAULT_OUT = Path(__file__).resolve().parent.parent / 'stats-app' / 'public' / 'data'


def to_json(data) -> str:
    # allow_nan=False: NaN is not valid JSON and would break the site, so fail loudly instead
    return json.dumps(data, indent=2, allow_nan=False) + '\n'


def build(games: pd.DataFrame, out: Path) -> str:
    """Write league.json from the played games if the data changed. Returns what happened, for the log."""
    if games.empty:
        return 'No played games yet; data left as it was.'

    league = compute_league(games)
    path = out / 'league.json'
    if path.exists():
        previous = json.loads(path.read_text())
        previous['meta'].pop('updated_at', None)
        if to_json(previous) == to_json(league):
            return 'No changes; league.json left as it was.'

    league['meta'] = {'updated_at': datetime.now(timezone.utc).isoformat(timespec='seconds'), **league['meta']}
    out.mkdir(parents=True, exist_ok=True)
    path.write_text(to_json(league))
    return f'Updated league.json: {len(games)} games, {len(league["teams"])} teams, through period {league["meta"]["latest_period"]}.'


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--source', default=os.environ.get('LEAGUE_SHEET') or SHEET_ID,
                        help='sheet link, sheet ID, CSV URL or CSV file (default: $LEAGUE_SHEET, else the league sheet)')
    parser.add_argument('--fantrax', metavar='LEAGUE_ID', default=os.environ.get('FANTRAX_LEAGUE_ID'),
                        help='read this Fantrax league instead of the sheet (default: $FANTRAX_LEAGUE_ID; '
                             'needs $FANTRAX_COOKIE)')
    parser.add_argument('--out', type=Path, default=DEFAULT_OUT, help=f'output directory (default: {DEFAULT_OUT})')
    args = parser.parse_args()
    if args.fantrax:
        cookie = os.environ.get('FANTRAX_COOKIE')
        if not cookie:
            parser.error('--fantrax needs FANTRAX_COOKIE (see fantrax.fetch_scores)')
        games = fantrax.load_games(args.fantrax, cookie)
    else:
        games = load_games(sheet_csv_url(str(args.source)))
    print(build(games, args.out))


if __name__ == '__main__':
    main()
