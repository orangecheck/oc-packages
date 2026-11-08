#!/usr/bin/env bash
# Exits 0 only when every path changed since $1 sits in another package's own directory.
# app-design's checks also read root files (package.json, .gitignore, .gitattributes, root
# node_modules), so a root file, a hidden directory or a directory with no package.json counts
# as reaching them, and any error exits non-zero so the checks run.
set -euo pipefail
base=$1
cd "$(git rev-parse --show-toplevel)"
git fetch -q --depth=1 origin "$base"
changed=$(git diff --no-renames --name-only "$base" HEAD)
while IFS= read -r path; do
    [ -n "$path" ] || continue
    dir=${path%%/*}
    if [ "$dir" = "$path" ] || [ "$dir" = app-design ] || [ ! -f "$dir/package.json" ]; then
        echo "app-design's checks can read $path"
        exit 1
    fi
done <<< "$changed"
