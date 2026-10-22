# Deployment and setup

How the app runs now, and the one-time steps to set it up.

## How it works

```
Google Sheet ──(hourly GitHub Action)──▶ pipeline/build_data.py
                                              │ writes JSON, commits only if data changed
                                              ▼
                              stats-app/public/data/*.json on main
                                              │ push triggers Render
                                              ▼
                         Render Static Site builds stats-app → out/
```

- There is **no backend server** any more. The calculations run once per
  hour in GitHub Actions, and the site is plain static files.
- After you edit the sheet, the site updates within about an hour, plus
  ~2 minutes of Render build time. To update right away, trigger the
  workflow by hand (see "Day to day").
- If the sheet is broken (for example a column was added), the workflow
  fails, GitHub emails you, and the site keeps showing the last good data.

---

## One-time setup

### Step 1: Create the GitHub repository

1. Go to <https://github.com/new>.
2. Owner: `oruppelt`. Name: `dynasty_stats`. (Done: <https://github.com/oruppelt/dynasty_stats>.)
3. Public or private:
   - **Public:** unlimited free Actions minutes. GitHub pauses scheduled
     workflows after 60 days without commits (see "Off-season" below).
   - **Private:** 2,000 free Actions minutes/month. The hourly refresh
     uses roughly 720, so it fits.
4. Leave **all** "Initialize this repository" options unchecked (no README,
   .gitignore or license). The repo must be empty.
5. Click **Create repository**.

### Step 2: Push the code

In Terminal:

```bash
cd ~/Documents/Projects/dynasty-stats
git remote add origin https://github.com/oruppelt/dynasty_stats.git
git push -u origin main
git push -u origin ux/phase-1-static-data
```

### Step 3: Merge the static-site branch

1. On the repo page, GitHub shows a banner for `ux/phase-1-static-data`.
   Click **Compare & pull request**, then **Create pull request**.
2. Wait for the **CI** checks at the bottom of the pull request to turn
   green (~2–3 minutes): "Pipeline tests" and "Lint and build site".
3. Click **Merge pull request** → **Confirm merge**.

### Step 4: Run the data refresh once by hand

1. Repo → **Actions** tab. If GitHub asks, click **I understand my
   workflows, go ahead and enable them**.
2. Left sidebar → **Refresh league data** → **Run workflow** → branch
   `main` → **Run workflow**.
3. After ~1 minute it should be green. The log ends with either
   "Data unchanged; nothing to commit." or a new commit "Update league data".

If it fails at the push step with a permission error: repo **Settings** →
**Actions** → **General** → **Workflow permissions** → choose **Read and
write permissions** → **Save**, then run it again.

### Step 5: Create the Render static site

1. <https://dashboard.render.com> → **New** → **Static Site**.
2. Connect the `oruppelt/dynasty_stats` repo. If it isn't listed, click
   **Configure account** (or "Configure GitHub") and give Render access to it.
   The old repos were under the `Blindshooter` account, so Render may only be
   connected to that account so far. In that case, connect the `oruppelt`
   account as well.
3. Fill in:

   | Field | Value |
   |---|---|
   | Name | `dynasty-stats`. This becomes `dynasty-stats.onrender.com`; pick another if taken |
   | Branch | `main` |
   | Root Directory | `stats-app` |
   | Build Command | `npm ci && npm run build` |
   | Publish Directory | `out` |

4. Under **Advanced** (or **Environment** afterwards), add the environment
   variable `NODE_VERSION` = `22`.
5. Click **Create Static Site** and wait for the first deploy (~2–4 min).
6. Open the `.onrender.com` URL and check:
   - The header shows **"Updated <date>"**.
   - All five tabs load (Points, All vs All, Strength, Schedule, Luck).

Auto-deploy is on by default, so every commit to `main` that touches
`stats-app/` (including the hourly data commits) redeploys the site.

### Step 6: Move users over and switch off the old setup

1. **The address people use:**
   - **Custom domain** (e.g. `stats.yourleague.com`): in the *old* frontend
     service, go to Settings → Custom Domains and remove it. Then add it in
     the new static site's Settings → Custom Domains and follow Render's DNS
     instructions.
   - **Only a `.onrender.com` link**: post the new link in the league chat.
     Keep the old services running for a week or so, then continue below.
2. In Render, open the old **backend** service → **Settings** → **Suspend
   Service** (or **Delete Service**). Do the same for the old **frontend**
   service once nobody uses its link. Remove old environment variables
   such as `NEXT_PUBLIC_BACKEND_URL` along with them.
3. On GitHub, archive the old repos, which makes them read-only but keeps
   them: `stats-app` and `stats-app-backend` → **Settings** → bottom of
   the page → **Archive this repository**.
4. On your Mac, the old folder `~/Documents/Projects/dynasty_stats` is now
   only a backup. Once everything works, you can delete it. From then on,
   work in (and start Claude Code from) `~/Documents/Projects/dynasty-stats`.

---

## Day to day

- **Sheet updated, want it live now:** GitHub → Actions → **Refresh league
  data** → **Run workflow**. The site updates ~2 minutes after the workflow
  finishes.
- **Change the refresh frequency:** edit the `cron` line in
  `.github/workflows/refresh-data.yml` (e.g. `"17 */3 * * *"` for every
  3 hours).
- **Off-season (public repos):** GitHub disables scheduled workflows after
  60 days without commits. Before the new season, go to Actions →
  Refresh league data and click **Enable workflow**.
- **Workflow failed email:** open the failed run's log. The most common
  cause is a change to the sheet's columns; the error lists the columns it
  found. The site keeps the last good data until it is fixed.

## Local development

```bash
cd ~/Documents/Projects/dynasty-stats

# Data (Python 3.13)
python3 -m venv .venv
.venv/bin/pip install -r pipeline/requirements-dev.txt
.venv/bin/python pipeline/build_data.py      # refresh stats-app/public/data/ from the sheet
(cd pipeline && ../.venv/bin/python -m pytest)

# Site (Node 22)
cd stats-app
npm ci
npm run dev        # http://localhost:3000
npm run build      # static export to out/, same as Render
```

Running `build_data.py` locally changes the files in `stats-app/public/data/`.
Committing them is fine, though the hourly workflow will do it anyway.
