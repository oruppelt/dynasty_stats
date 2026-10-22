"""
Build the static league data files that the site serves.

Usage (from the repo root):
    python pipeline/build_data.py                    # read the live Google Sheet
    python pipeline/build_data.py --source games.csv # read a local CSV instead

Writes one JSON file per dataset to stats-app/public/data/. Files are only
rewritten when their content changes, and metadata.json (the "Updated ..."
time shown in the header) is only bumped when some data changed. That keeps
the scheduled GitHub Action from committing when nothing is new.
"""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from league_data import SHEET_CSV_URL, compute_all, load_games

DEFAULT_OUT = Path(__file__).resolve().parent.parent / 'stats-app' / 'public' / 'data'


def to_json(data) -> str:
    # allow_nan=False: NaN is not valid JSON and would break the site, so fail loudly instead
    return json.dumps(data, indent=2, allow_nan=False) + '\n'


def write_if_changed(path: Path, text: str) -> bool:
    if path.exists() and path.read_text() == text:
        return False
    path.write_text(text)
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--source', default=SHEET_CSV_URL, help='CSV URL or file path (default: the league Google Sheet)')
    parser.add_argument('--out', type=Path, default=DEFAULT_OUT, help=f'output directory (default: {DEFAULT_OUT})')
    args = parser.parse_args()

    games = load_games(args.source)
    datasets = compute_all(games)

    args.out.mkdir(parents=True, exist_ok=True)
    changed = [name for name, data in datasets.items()
               if write_if_changed(args.out / f'{name}.json', to_json(data))]

    metadata_path = args.out / 'metadata.json'
    if changed or not metadata_path.exists():
        metadata = {
            'updated_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
            'games': len(games),
            'latest_match': int(games['Match'].max()),
        }
        metadata_path.write_text(to_json(metadata))

    teams = len(datasets['strength']['teams'])
    print(f'Read {len(games)} games for {teams} teams.')
    print(f'Updated: {", ".join(changed)}' if changed else 'No changes; data files left as they were.')


if __name__ == '__main__':
    main()
