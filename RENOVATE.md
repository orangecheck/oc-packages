# Renovate — family-wide auto-bumper

When an `@orangecheck/*` package publishes a new version, this repo's
**Renovate** workflow fans the bump out to every consumer site in the
family. No more 13-repo manual sweep — publish, wait one day, and the
new version lands on every subdomain.

## What it does

- Runs Renovate every 30 minutes (self-hosted via GitHub Actions).
- Reads the per-repo rules in each consumer's `renovate.json`.
- For `@orangecheck/*` **patch + minor** bumps: opens one PR on
  `renovate/@orangecheck-(family)`. Renovate does **not** merge it. The
  consumer's own CI does: its `merge-renovate` job `needs` the gating jobs
  and rebase-merges the PR with `GITHUB_TOKEN` once they pass. Vercel then
  auto-deploys. A red gating job skips the merge and the PR stays open.
- Why CI merges instead of Renovate: this token cannot read check runs
  (403), so Renovate would merge on Vercel's status alone, before CI has
  run. It did exactly that to twelve repos on 2026-09-16. A ruleset
  cannot stop it either: Renovate acts as an org admin, and the admin
  bypass lets its merge through.
- For `@orangecheck/*` **major** bumps: opens a PR labelled
  `major-bump` for human review (these change wire shape).
- 1-day **stability window** — Renovate waits 24 h after a publish
  before opening any PR. A yanked-within-24h publish never reaches a
  consumer.
- Bundles every `@orangecheck/*` update visible at run time into one
  PR per consumer (`groupName: "@orangecheck/* (family)"`).

Result: net manual work on a routine publish — **zero**.

## Repos under management

The 13 consumer surfaces listed in [`renovate-global.json`](./renovate-global.json) —
every site that pins `@orangecheck/*` via npm. Add a new site by
appending it to that file _and_ dropping a `renovate.json` in its
repo (copy any existing one), _and_ adding the `merge-renovate` job to the
end of its CI workflow with `needs` naming its gating jobs. Without that
job the family PR opens and never merges.

`oc-packages` itself is also under management, but with the **stricter
rule set** in its own [`renovate.json`](./renovate.json). Its family PR
is merged by `packages.yml`'s `merge-renovate` job after every package
builds; anything else opens for visibility and waits for a human. A
third-party bump that lands here propagates to every consumer via the
next npm publish, so each one is a deliberate decision.

## One-time setup (operator)

Renovate needs cross-repo write access, which the default
`GITHUB_TOKEN` does not grant. Provision a token once:

1. Mint a fine-grained PAT — https://github.com/settings/personal-access-tokens/new
   - **Resource owner:** `orangecheck`
   - **Repository access:** _All repositories_ (or just the 13 in
     `renovate-global.json`, plus this repo)
   - **Repository permissions:**
     - `Contents` → **Read and write**
     - `Issues` → **Read and write** (Renovate's initRepo GraphQL
       query asks for `repository.issues`, which 403s on private
       repos without this — the `:dependencyDashboard` extend also
       needs it to maintain the per-repo dashboard issue)
     - `Pull requests` → **Read and write**
     - `Commit statuses` → **Read and write** (without it Renovate
       pushes the branch, 403s reading `commits/{sha}/statuses`, logs
       "Error updating branch" and never opens the PR — so nothing
       auto-merges and the run still reports success)
     - `Workflows` → **Read and write** (so Renovate can update
       workflow files when those have dep refs)
     - `Dependabot alerts` → Read (optional — lets Renovate flag
       vulnerable deps in PR descriptions)
     - `Metadata` → Read (granted automatically)
   - **Organization permissions:** `Members` → Read-only
   - This list follows Renovate's own table for fine-grained tokens:
     https://docs.renovatebot.com/modules/platform/github/
   - **Expiration:** 1 year (renew via the calendar reminder you
     will set on the date you mint this token)
2. Copy the token. On `oc-packages`, save it as the
   **`RENOVATE_TOKEN`** repo secret —
   https://github.com/orangecheck/oc-packages/settings/secrets/actions/new
3. Trigger a first run manually to verify:
   `gh workflow run renovate.yml -R orangecheck/oc-packages` — or use
   the **Run workflow** button on the Actions tab. Set the `dryRun`
   input to `full` for the first run to preview what Renovate would
   do without actually opening any PRs / pushing any branches.

That is the entire setup. After this, you can ignore the workflow
unless it stops succeeding.

## Tuning

Tweak per-repo behaviour in that repo's `renovate.json`:

- Stop merging family bumps in one repo: delete that repo's
  `merge-renovate` job. (Renovate's own `automerge` is `false` everywhere
  and must stay that way — see "What it does".)
- Tighten the stability window:
  `"minimumReleaseAge": "3 days"`.
- Exclude a specific package:
  add a rule with `"matchPackageNames": ["@orangecheck/sdk"]` +
  `"enabled": false`.

Tweak global behaviour (which repos are processed, schedule) in
[`renovate-global.json`](./renovate-global.json) and
[`.github/workflows/renovate.yml`](./.github/workflows/renovate.yml).

## Why self-hosted instead of the Renovate SaaS app

The Mend Renovate GitHub App is free for OSS and a small free tier
for private use. Most OC consumer sites are private (per the family
privacy rule). Self-hosted via this workflow keeps Renovate free at
the family's scale, keeps the access token under OC control, and
fits the family's "we self-host the load-bearing infrastructure"
posture (alongside oc-btcpay-infra, oc-relay-ochk, etc.).
