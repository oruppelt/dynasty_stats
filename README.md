# Dynasty Stats

NBA fantasy league stats: all-play strength, schedule luck, points for/against
and head-to-head matrices, built from the league's Google Sheet.

- `pipeline/`: Python that turns the sheet into JSON (runs hourly in GitHub Actions)
- `stats-app/`: Next.js static site that displays it (hosted on Render)

See [DEPLOYMENT.md](DEPLOYMENT.md) for setup, deployment and local development,
and [UX_PLAN.md](UX_PLAN.md) for the roadmap.
