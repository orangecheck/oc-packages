#!/usr/bin/env bash
# Land a branch on main without bypassing the required checks.
#
# A direct push to main reaches it before the required checks have run on that
# commit, and an admin push goes through anyway ("Bypassed rule violations"):
# three times on 2026-10-24. This opens (or reuses) a PR so CI runs on the
# branch's exact head, waits for every check on that sha, and only then
# fast-forwards main to it, so the statuses already exist when main moves.
#
#   scripts/land.sh <branch>          LAND_TIMEOUT=<seconds> (default 2700)
#
# Refuses when the branch is not on top of origin/main, when main moves while CI
# runs, when a required check is missing, or when any check on the sha fails.
# Tag only after it prints "land: main is now <sha>".
set -euo pipefail

branch=${1:?usage: scripts/land.sh <branch>}
repo=orangecheck/oc-packages
# A stale GITHUB_TOKEN in the environment answers "Bad credentials".
gh() { env -u GITHUB_TOKEN gh "$@"; }
refuse() {
    echo "land: $*" >&2
    exit 1
}

git fetch -q origin
main=$(git rev-parse origin/main)
sha=$(git rev-parse --verify "$branch^{commit}")
[ "$sha" != "$main" ] || refuse "$branch is already main"
git merge-base --is-ancestor "$main" "$sha" || refuse "$branch is not on top of origin/main; rebase it first"

required=$(gh api "repos/$repo/rules/branches/main" \
    --jq '.[] | select(.type == "required_status_checks") | .parameters.required_status_checks[].context')
[ -n "$required" ] || refuse "main has no required checks to wait for; read the ruleset before landing"

git push -q origin "$sha:refs/heads/$branch"
if ! gh pr view "$branch" -R "$repo" --json number > /dev/null 2>&1; then
    gh pr create -R "$repo" --base main --head "$branch" --title "$(git log -1 --format=%s "$sha")" \
        --body "Landed by scripts/land.sh: main fast-forwards to this head once every check on it passes." > /dev/null
fi

deadline=$((SECONDS + ${LAND_TIMEOUT:-2700}))
while :; do
    runs=$(gh api "repos/$repo/commits/$sha/check-runs?per_page=100" \
        --jq '.check_runs[] | [.name, .status, (.conclusion // "")] | @tsv')
    failed=$(printf '%s\n' "$runs" | awk -F'\t' '$2 == "completed" && $3 != "success" && $3 != "skipped" && $3 != "neutral" { print $1 }')
    [ -z "$failed" ] || refuse "a check failed on $sha: $(printf '%s\n' "$failed" | paste -sd, -)"
    waiting=$(printf '%s\n' "$runs" | awk -F'\t' 'NF && $2 != "completed" { print $1 }')
    while IFS= read -r check; do
        printf '%s\n' "$runs" | awk -F'\t' -v c="$check" '$1 == c && $3 == "success" { ok = 1 } END { exit !ok }' \
            || waiting="${waiting:+$waiting$'\n'}$check"
    done <<< "$required"
    [ -n "$waiting" ] || break
    ((SECONDS < deadline)) || refuse "timed out waiting on $sha for: $(printf '%s\n' "$waiting" | sort -u | paste -sd, -)"
    sleep 20
done

git fetch -q origin
[ "$(git rev-parse origin/main)" = "$main" ] || refuse "main moved while CI ran; rebase $branch on it and run again"
out=$(git push origin "$sha:refs/heads/main" 2>&1) || {
    echo "$out" >&2
    refuse "the push to main failed"
}
echo "$out"
! grep -q "Bypassed rule" <<< "$out" || refuse "main took the push only by bypassing a rule: tell the lead before tagging"
echo "land: main is now $sha"
