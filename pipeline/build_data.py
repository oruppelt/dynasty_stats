"""
Build the static league data files that the site serves.

Usage (from the repo root):
    python pipeline/build_data.py                    # every season still in progress, from Fantrax
    python pipeline/build_data.py --season 2025-26   # one season (a finished one too)
    python pipeline/build_data.py --season 2020-21,2019-20   # several
    python pipeline/build_data.py --season test --source games.csv  # a CSV or Google Sheet instead

The seasons and their Fantrax league IDs are in pipeline/seasons.json, newest
first. The site opens on the newest season with at least DEFAULT_MIN_PERIODS
periods played (so a new season takes over a couple of weeks in, not after
one period), else the newest season with data. A season marked "final" is over: its data file is kept
as it is, and only rebuilt when it is named with --season. Fantrax needs
FANTRAX_COOKIE, a logged-in browser's cookie (see fantrax.fetch_scores).

Optional per season:
- "note": one line the site shows with the season (e.g. a shorter regular
  season). Goes to the season list, so it can change without a rebuild.
- "regular_periods": where the regular season really ended, when Fantrax's
  own setting is off (2023-24: 32; its period 33 was the first Swiss round).
- "skip_playoff_periods": playoff periods that didn't count, e.g. the first
  half of a Swiss round that ran over two periods (fantrax.skip_playoff_periods).
- "skip_player_periods": periods left out of the player lists (players.py),
  e.g. 2019-20 period 29, when every team was given 8 or 24 points but
  the players' points still show in Fantrax. The rows stay in the cache.
- "playoffs": "other" for a season before today's playoff format (LEAGUE.md).
  It gets no playoffs block; its playoff games are listed as played
  (playoff_games), and the site shows them as a plain list instead of a
  wrong Swiss stage.
- "champion": the champion of a season with "playoffs": "other", for the
  all-time titles (the earlier formats' games don't say who won); null for
  a season without one (2019-20, COVID). "runner_up" likewise.

Writes stats-app/public/data/seasons/<season>.json, data/seasons.json, the
season list the site reads, and data/alltime.json, every season together
(alltime.py; rebuilt from the season files on every run). The list only has the seasons with data, so a new
season appears on the site once its first period is played. A season's file
is only rewritten when the data changes, and its `updated_at` (the "Updated
..." time in the header) only moves then. That keeps the scheduled GitHub
Action from committing when nothing is new. A source without any played games
leaves the existing data in place, and so does a season that fails (the
others still build; the run then exits with an error).

Players (players.py): for each season built from Fantrax, the rosters with
every player's points per period are kept in pipeline/data/players/<season>.csv
(only new periods are fetched, plus the latest few again while the season is
in progress) and the season's player lists go to data/players/<season>.json;
data/players/alltime.json has every season together. --no-players skips them.
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
import lineage
import players
from alltime import compute_alltime
from league_data import compute_league, load_games, sheet_csv_url

SEASONS_CONFIG = Path(__file__).resolve().parent / 'seasons.json'
DEFAULT_OUT = Path(__file__).resolve().parent.parent / 'stats-app' / 'public' / 'data'
DEFAULT_MIN_PERIODS = 4


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


def build_players(season: str, league_id: str, cookie: str, games: pd.DataFrame, playoff_games: pd.DataFrame,
                  out: Path, final: bool, skip_periods: list[int] | None = None, season_length: int | None = None) -> str:
    """Update the season's player cache and write data/players/<season>.json if it changed. Returns what happened.
    `season_length`: the regular season's number of periods, for a season in progress (salary paid so far)."""
    if games.empty:
        return f'{season} players: no played games yet.'
    all_games = pd.concat([g for g in (games, playoff_games) if not g.empty])
    played: dict[int, set[str]] = {}
    for g in all_games.itertuples():
        played.setdefault(int(g.Match), set()).update((g.Team, g.Opponent))
    rows = players.update_cache(season, league_id, cookie, played, refresh=0 if final else players.REFRESH_RECENT)
    skip = set(skip_periods or [])
    playoff_periods = set(playoff_games['Match'].astype(int)) if not playoff_games.empty else set()
    data = players.compute_players(rows, set(games['Match'].astype(int)) - skip, playoff_periods - skip,
                                   season_length=None if final else season_length)
    data['meta'] = {'season': season, **data['meta']}
    path = out / 'players' / f'{season}.json'
    text = to_json(data)
    changed = not path.exists() or path.read_text() != text
    if changed:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
    off = players.check_scores(rows, all_games)
    note = f'; lineup points differ from the score in {len(off)} games (e.g. {off[0]})' if off else ''
    return f'{season} players: {"updated" if changed else "no changes"}, {len(rows)} roster rows{note}.'


def write_players_alltime(config: dict, out: Path) -> None:
    """data/players/alltime.json, every season's player records together (players.compute_alltime_players),
    and the player pages: data/players/index.json (the search list) and data/players/player/<id>.json
    (players.compute_player_pages, with the timeline from lineage.compute_timelines). From the cached rows and each season's periods (the season's player
    file, whose meta also has the season's length for the salary paid); each file is written only when it changes."""
    seasons, lengths = [], {}
    for s in config['seasons']:
        path = out / 'players' / f'{s["id"]}.json'
        if not path.exists() or not players.cache_path(s['id']).exists():
            continue
        meta = json.loads(path.read_text())['meta']
        seasons.append((s['id'], players.read_cache(s['id']), set(meta['regular_periods']), set(meta['playoff_periods'])))
        if meta.get('season_length'):
            lengths[s['id']] = meta['season_length']
    if not seasons:
        return
    _write_if_changed(out / 'players' / 'alltime.json', to_json(players.compute_alltime_players(seasons, season_lengths=lengths)))
    index, pages = players.compute_player_pages(seasons, lengths)
    transactions = lineage.read_transactions()
    if transactions is not None:
        for pid, timeline in lineage.compute_timelines(seasons, transactions).items():
            if pid in pages:
                pages[pid].update(timeline=timeline['events'], trades=timeline['trades'])
        axis = lineage.compute_axis(seasons)
        for page in pages.values():
            # From his first season (a draft is in the season it's for)
            first = min([s['season'] for s in page['seasons']] + [e['season'] for e in page.get('timeline', []) if e.get('season')])
            page['axis'] = [a for a in axis if a['season'] >= first]
    _write_if_changed(out / 'players' / 'index.json', to_json(index))
    page_dir = out / 'players' / 'player'
    page_dir.mkdir(parents=True, exist_ok=True)
    for pid, page in pages.items():
        _write_if_changed(page_dir / f'{pid}.json', to_json(page))
    for stale in page_dir.glob('*.json'):
        if stale.stem not in pages:
            stale.unlink()


def _write_if_changed(path: Path, text: str) -> None:
    if not path.exists() or path.read_text() != text:
        path.write_text(text)


def write_index(config: dict, out: Path) -> None:
    """The site's season list: the seasons that have data, in seasons.json order, and the one it opens on
    (the newest with DEFAULT_MIN_PERIODS periods played, else the newest)."""
    available = [s['id'] for s in config['seasons'] if season_path(out, s['id']).exists()]
    if not available:
        return
    played = {s: json.loads(season_path(out, s).read_text())['meta']['latest_period'] for s in available}
    default = next((s for s in available if played[s] >= DEFAULT_MIN_PERIODS), available[0])
    extras = {s['id']: {key: s[key] for key in ('note', 'playoffs') if key in s} for s in config['seasons']}
    path = out / 'seasons.json'
    index = to_json({'default': default, 'seasons': [{'id': s, **extras[s]} for s in available]})
    if not path.exists() or path.read_text() != index:
        path.write_text(index)


def write_alltime(config: dict, out: Path) -> None:
    """data/alltime.json, every season together (alltime.py), from the season files; written when it changes."""
    seasons = [(s['id'], json.loads(season_path(out, s['id']).read_text()), s)
               for s in config['seasons'] if season_path(out, s['id']).exists()]
    if not seasons:
        return
    path = out / 'alltime.json'
    data = to_json(compute_alltime(seasons))
    if not path.exists() or path.read_text() != data:
        path.write_text(data)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--season', help='build only this season, or several comma-separated '
                                         '(default: every season not marked final)')
    parser.add_argument('--source', help='read the games from this sheet link, sheet ID, CSV URL or CSV file '
                                         'instead of Fantrax (needs --season)')
    parser.add_argument('--no-players', action='store_true', help='skip the players (rosters and points)')
    parser.add_argument('--out', type=Path, default=DEFAULT_OUT, help=f'output directory (default: {DEFAULT_OUT})')
    args = parser.parse_args()

    config = json.loads(SEASONS_CONFIG.read_text())
    league_ids = {s['id']: s['fantrax_league_id'] for s in config['seasons']}
    other_playoffs = {s['id'] for s in config['seasons'] if s.get('playoffs') == 'other'}
    regular_periods = {s['id']: s.get('regular_periods') for s in config['seasons']}
    skip_periods = {s['id']: s.get('skip_playoff_periods') for s in config['seasons']}
    final = {s['id'] for s in config['seasons'] if s.get('final')}
    skip_player_periods = {s['id']: s.get('skip_player_periods') for s in config['seasons']}
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
                continue
            if args.no_players:
                continue
            try:
                print(build_players(season, league_ids[season], cookie, games, playoff_games, args.out, season in final,
                                    skip_player_periods[season], (schedule or {}).get('regular_periods')))
            except Exception:
                failed.append(f'{season} players')
                print(f'{season} players: FAILED; player data left as it was.', file=sys.stderr)
                traceback.print_exc()
    write_index(config, args.out)
    write_alltime(config, args.out)
    if not args.no_players and not args.source:
        write_players_alltime(config, args.out)
    if failed:
        sys.exit(f'Failed: {", ".join(failed)}')


if __name__ == '__main__':
    main()
