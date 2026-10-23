"""
Build the static league data files that the site serves.

Usage (from the repo root):
    python pipeline/build_data.py                    # every season still in progress, from Fantrax
    python pipeline/build_data.py --season 2025-26   # one season (a finished one too)
    python pipeline/build_data.py --season 2020-21,2019-20   # several
    python pipeline/build_data.py --season test --source games.csv  # a CSV or Google Sheet instead

The seasons, their Fantrax league IDs and the season the site opens on are in
pipeline/seasons.json. A season marked "final" is over: its data file is kept
as it is, and only rebuilt when it is named with --season. Fantrax needs
FANTRAX_COOKIE, a logged-in browser's cookie (see fantrax.fetch_scores).

Optional per season:
- "note": one line the site shows with the season (e.g. a shorter regular
  season). Goes to the season list, so it can change without a rebuild.
- "regular_periods": where the regular season really ended, when Fantrax's
  own setting is off (2023-24: 32; its period 33 was the first Swiss round).
- "skip_playoff_periods": playoff periods that didn't count, e.g. the first
  half of a Swiss round that ran over two periods (fantrax.skip_playoff_periods).
- "playoffs": "other" for a season before today's playoff format (LEAGUE.md).
  It gets no playoffs block; its playoff games are listed as played
  (playoff_games), and the site shows them as a plain list instead of a
  wrong Swiss stage.

Writes stats-app/public/data/seasons/<season>.json, and data/seasons.json, the
season list the site reads. The list only has the seasons with data, so a new
season appears on the site once its first period is played. A season's file
is only rewritten when the data changes, and its `updated_at` (the "Updated
..." time in the header) only moves then. That keeps the scheduled GitHub
Action from committing when nothing is new. A source without any played games
leaves the existing data in place, and so does a season that fails (the
others still build; the run then exits with an error).
"""
import argparse
import json
import os
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

import fantrax
from league_data import compute_league, load_games, sheet_csv_url

SEASONS_CONFIG = Path(__file__).resolve().parent / 'seasons.json'
DEFAULT_OUT = Path(__file__).resolve().parent.parent / 'stats-app' / 'public' / 'data'


def to_json(data) -> str:
    # allow_nan=False: NaN is not valid JSON and would break the site, so fail loudly instead
    return json.dumps(data, indent=2, allow_nan=False) + '\n'


def season_path(out: Path, season: str) -> Path:
    return out / 'seasons' / f'{season}.json'


def build(games: pd.DataFrame, path: Path, season: str, playoff_games: pd.DataFrame | None = None,
          schedule: dict | None = None, playoff_format: str = 'swiss') -> str:
    """Write a season's data file from the played games if the data changed. Returns what happened, for the log."""
    if games.empty:
        return f'{season}: no played games yet; data left as it was.'

    league = compute_league(games, playoff_games, schedule, playoff_format)
    league['meta'] = {'season': season, **league['meta']}
    if path.exists():
        previous = json.loads(path.read_text())
        previous['meta'].pop('updated_at', None)
        if to_json(previous) == to_json(league):
            return f'{season}: no changes; data left as it was.'

    league['meta'] = {'updated_at': datetime.now(timezone.utc).isoformat(timespec='seconds'), **league['meta']}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(to_json(league))
    return (f'{season}: updated, {len(games)} games, {len(league["teams"])} teams, '
            f'through period {league["meta"]["latest_period"]}.')


def write_index(config: dict, out: Path) -> None:
    """The site's season list: the seasons that have data, in seasons.json order, and the one it opens on."""
    available = [s['id'] for s in config['seasons'] if season_path(out, s['id']).exists()]
    if not available:
        return
    default = config['default'] if config['default'] in available else available[0]
    extras = {s['id']: {key: s[key] for key in ('note', 'playoffs') if key in s} for s in config['seasons']}
    path = out / 'seasons.json'
    index = to_json({'default': default, 'seasons': [{'id': s, **extras[s]} for s in available]})
    if not path.exists() or path.read_text() != index:
        path.write_text(index)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--season', help='build only this season, or several comma-separated '
                                         '(default: every season not marked final)')
    parser.add_argument('--source', help='read the games from this sheet link, sheet ID, CSV URL or CSV file '
                                         'instead of Fantrax (needs --season)')
    parser.add_argument('--out', type=Path, default=DEFAULT_OUT, help=f'output directory (default: {DEFAULT_OUT})')
    args = parser.parse_args()

    config = json.loads(SEASONS_CONFIG.read_text())
    league_ids = {s['id']: s['fantrax_league_id'] for s in config['seasons']}
    other_playoffs = {s['id'] for s in config['seasons'] if s.get('playoffs') == 'other'}
    regular_periods = {s['id']: s.get('regular_periods') for s in config['seasons']}
    skip_periods = {s['id']: s.get('skip_playoff_periods') for s in config['seasons']}
    failed = []
    if args.source:
        if not args.season:
            parser.error('--source needs --season')
        print(build(load_games(sheet_csv_url(args.source)), season_path(args.out, args.season), args.season))
    else:
        # --season takes one season or several, comma-separated
        named = [s.strip() for s in args.season.split(',') if s.strip()] if args.season else []
        for season in named:
            if season not in league_ids:
                parser.error(f'{season} is not in {SEASONS_CONFIG.name}')
        seasons = named or [s['id'] for s in config['seasons'] if not s.get('final')]
        cookie = os.environ.get('FANTRAX_COOKIE')
        if seasons and not cookie:
            parser.error('Fantrax needs FANTRAX_COOKIE (see fantrax.fetch_scores)')
        for season in seasons:
            # A season that fails keeps its old data; the others still build
            try:
                games, playoff_games, schedule = fantrax.load_season(
                    league_ids[season], cookie, regular_periods[season], skip_periods[season])
                playoff_format = 'other' if season in other_playoffs else 'swiss'
                print(build(games, season_path(args.out, season), season, playoff_games, schedule, playoff_format))
            except Exception:
                failed.append(season)
                print(f'{season}: FAILED; data left as it was.', file=sys.stderr)
                traceback.print_exc()
    write_index(config, args.out)
    if failed:
        sys.exit(f'Failed: {", ".join(failed)}')


if __name__ == '__main__':
    main()
