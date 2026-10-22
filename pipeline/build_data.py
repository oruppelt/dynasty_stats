"""
Build the static league data file that the site serves.

Usage (from the repo root):
    python pipeline/build_data.py                     # read the league Google Sheet
    python pipeline/build_data.py --source <sheet>    # another sheet (link or ID)
    python pipeline/build_data.py --source games.csv  # or a local CSV

The sheet defaults to the LEAGUE_SHEET environment variable (a sheet link or
ID; the GitHub Action sets it from a repository variable), else the sheet in
league_data.py. That way a new season's sheet needs no code change.

Writes stats-app/public/data/league.json. The file is only rewritten when the
data changes, and its `updated_at` (the "Updated ..." time in the header) only
moves then. That keeps the scheduled GitHub Action from committing when
nothing is new. A sheet without any played games (e.g. a new season's sheet
before the first period) leaves the existing data in place.
"""
import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from league_data import SHEET_ID, compute_league, load_games, sheet_csv_url

DEFAULT_OUT = Path(__file__).resolve().parent.parent / 'stats-app' / 'public' / 'data'


def to_json(data) -> str:
    # allow_nan=False: NaN is not valid JSON and would break the site, so fail loudly instead
    return json.dumps(data, indent=2, allow_nan=False) + '\n'


def build(source: str, out: Path) -> str:
    """Write league.json from the sheet if its data changed. Returns what happened, for the log."""
    games = load_games(sheet_csv_url(str(source)))
    if games.empty:
        return 'No played games in the sheet yet; data left as it was.'

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
    parser.add_argument('--out', type=Path, default=DEFAULT_OUT, help=f'output directory (default: {DEFAULT_OUT})')
    args = parser.parse_args()
    print(build(args.source, args.out))


if __name__ == '__main__':
    main()
