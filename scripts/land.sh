#!/usr/bin/env bash
# Land a branch on main through the merge queue.
#
# main takes no direct push: the queue tests each PR on top of main and the
# ones queued ahead of it, then moves main to the exact commit it tested, so
# two lanes landing at once never race. This pushes the branch, opens (or
# reuses) its PR, queues it, and waits until main holds it.
#
#   bash scripts/land.sh <branch>          LAND_TIMEOUT=<seconds> (default 3600)
#   LAND_PR=<number> bash scripts/land.sh   only watch PR <number>: did it land?
#
# Refuses when a check fails on the PR, when the queue drops it, or when the PR
# is closed. Rebase isn't needed first: the queue rebases onto main itself, so
# the commits main takes are new ones; a release tag goes on the commit main
# holds, never the branch's.
# Before it says a PR was dropped, it reads the PR again: one the queue has just
# merged can still read as open for a moment, and main may already hold it.
# The repository is the one origin names, so oc-docs and oc-packages run the
# same file. LAND_GH and LAND_POLL (seconds) are for the script's tests.
set -euo pipefail

poll=${LAND_POLL:-20}
# A stale GITHUB_TOKEN in the environment answers "Bad credentials".
gh() { env -u GITHUB_TOKEN "${LAND_GH:-gh}" "$@"; }
refuse() {
    echo "land: $*" >&2
    exit 1
}

origin=$(git remote get-url origin)
repo=$(sed -E 's#^(git@github\.com:|ssh://git@github\.com/|https://github\.com/)##; s#\.git$##; s#/$##' <<< "$origin")
[[ $repo =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || refuse "origin is not a GitHub repository: $origin"

if [ -n "${LAND_PR:-}" ]; then
    number=$LAND_PR
else
    branch=${1:?usage: bash scripts/land.sh <branch>}
    sha=$(git rev-parse --verify "$branch^{commit}")
    git push -q origin "$sha:refs/heads/$branch"
    if ! gh pr view "$branch" -R "$repo" --json number > /dev/null 2>&1; then
        gh pr create -R "$repo" --base main --head "$branch" --title "$(git log -1 --format=%s "$sha")" \
            --body "Landed by scripts/land.sh through the merge queue." > /dev/null
    fi
    gh pr merge "$branch" -R "$repo" --auto > /dev/null
    number=$(gh pr view "$branch" -R "$repo" --json number --jq .number)
fi

# shellcheck disable=SC2016 # GraphQL variables, not shell ones
query='query($o: String!, $r: String!, $n: Int!) { repository(owner: $o, name: $r) { pullRequest(number: $n) {
    state isInMergeQueue autoMergeRequest { enabledAt } mergeQueueEntry { state } mergeCommit { oid } headRefOid
    commits(last: 1) { nodes { commit { statusCheckRollup { state } } } } } } }'
read_pr() {
    local line
    line=$(gh api graphql -f query="$query" -f o="${repo%/*}" -f r="${repo#*/}" -F n="$number" --jq '.data.repository.pullRequest
        | [.state, .isInMergeQueue, (.autoMergeRequest != null), (.mergeQueueEntry.state // "-"),
           (.commits.nodes[0].commit.statusCheckRollup.state // "-"), (.mergeCommit.oid // "-"), .headRefOid] | @tsv')
    IFS=$'\t' read -r state in_queue auto entry checks merged head <<< "$line"
}
verb='is now'
finish() {
    echo "land: merged; main $verb $merged (PR #$number)"
    exit 0
}
# Whether the PR landed after all: merged on a fresh read, or main holds its head.
landed() {
    local i status
    for i in 1 2 3; do
        read_pr
        [ "$state" != MERGED ] || return 0
        status=$(gh api "repos/$repo/compare/main...$head" --jq .status 2> /dev/null || echo unknown)
        if [ "$status" = behind ] || [ "$status" = identical ]; then
            merged="$head, the PR's head"
            verb=holds
            return 0
        fi
        [ "$i" = 3 ] || sleep "$poll"
    done
    return 1
}
# Refuse with the reason, unless a fresh read shows the PR landed.
dropped() {
    landed || refuse "$1"
    finish
}

deadline=$((SECONDS + ${LAND_TIMEOUT:-3600}))
queued=
while :; do
    read_pr
    case $state in
        MERGED) finish ;;
        CLOSED) refuse "PR #$number was closed" ;;
    esac
    case $checks in FAILURE | ERROR) refuse "a check failed on PR #$number: gh pr checks $number -R $repo" ;; esac
    [ "$entry" != UNMERGEABLE ] || dropped "the queue can't merge PR #$number: its group run failed or it conflicts with main"
    [ "$in_queue" = true ] && queued=1
    # A failed group run drops the PR from the queue and turns auto-merge off.
    [ -z "$queued" ] || [ "$in_queue" = true ] || [ "$auto" = true ] \
        || dropped "the queue dropped PR #$number: its group run failed or main changed under it"
    ((SECONDS < deadline)) || dropped "timed out waiting for the queue to merge PR #$number"
    sleep "$poll"
done
