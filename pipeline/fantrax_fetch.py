"""
Save a Fantrax league's raw responses and check them against the site data.

Usage (from the repo root, with FANTRAX_COOKIE set; see fantrax.fetch_scores):
    python pipeline/fantrax_fetch.py <league_id> <out_dir>

Writes <out_dir>/league_info.json and <out_dir>/scores.json (the cookie is not
saved), then prints what the games table holds and how its scores compare
with stats-app/public/data/league.json. For looking at the responses and
making test fixtures; the site build doesn't use it.
"""
import argparse
import json
import os
import sys
from pathlib import Path

import fantrax

SITE_DATA = Path(__file__).resolve().parent.parent / 'stats-app' / 'public' / 'data' / 'league.json'


def compare_with_site(games) -> None:
    if not SITE_DATA.exists():
        return
    site = {(r['period'], r['team']): (r['opponent'], r['score'], r['opp_score'])
            for r in json.loads(SITE_DATA.read_text())['results']}
    common = missing = 0
    differences = []
    for g in games.itertuples():
        key = (g.Match, g.Team)
        if key not in site:
            missing += 1
            continue
        common += 1
        if site[key] != (g.Opponent, g.Score, g.OppScore):
            differences.append((g.Match, g.Team, g.Score, g.Opponent, g.OppScore, site[key]))
    print(f'Compared with league.json: {common} games in both, {missing} only in Fantrax, '
          f'{len(differences)} different.')
    for d in differences[:20]:
        print(f'  period {d[0]}: Fantrax {d[1]} {d[2]} - {d[4]} {d[3]}; site {d[5]}')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('league_id')
    parser.add_argument('out_dir', type=Path)
    args = parser.parse_args()
    cookie = os.environ.get('FANTRAX_COOKIE')
    if not cookie:
        sys.exit('Set FANTRAX_COOKIE first (see fantrax.fetch_scores).')

    info = fantrax.fetch_league_info(args.league_id)
    scores = fantrax.fetch_scores(args.league_id, cookie)
    args.out_dir.mkdir(parents=True, exist_ok=True)
    (args.out_dir / 'league_info.json').write_text(json.dumps(info, indent=1))
    (args.out_dir / 'scores.json').write_text(json.dumps(scores, indent=1))
    print(f'Saved the responses to {args.out_dir}')

    captions = [t.get('caption') for t in scores.get('tableList', [])]
    print(f'{info["leagueName"]} ({info["seasonYear"]}): {len(info["teamInfo"])} teams, '
          f'{len(captions)} schedule tables ({captions[0] if captions else "-"} ... {captions[-1] if captions else "-"})')
    games = fantrax.games_from_fantrax(info, scores)
    print(f'Games table: {len(games)} played regular-season games, periods '
          f'{games["Match"].min() if len(games) else "-"}-{games["Match"].max() if len(games) else "-"}, '
          f'{int((games["Result"] == "T").sum())} ties')
    compare_with_site(games)


if __name__ == '__main__':
    main()
