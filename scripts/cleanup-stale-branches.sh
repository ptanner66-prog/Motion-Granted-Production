#!/bin/bash
# Cleanup stale remote branches that have been merged to main
# Run with: bash scripts/cleanup-stale-branches.sh
#
# SA-005: Removes old Claude Code branches and other stale branches
# that have already been merged into main.

set -e

echo "Fetching latest remote info..."
git fetch --prune

echo ""
echo "=== Branches merged to main (safe to delete) ==="
MERGED_BRANCHES=$(git branch -r --merged origin/main | grep -v 'origin/main' | grep -v 'origin/HEAD' | sed 's/origin\///' | xargs)

if [ -z "$MERGED_BRANCHES" ]; then
    echo "No merged branches to clean up."
    exit 0
fi

echo "$MERGED_BRANCHES" | tr ' ' '\n'
echo ""

# Count branches
BRANCH_COUNT=$(echo "$MERGED_BRANCHES" | wc -w | tr -d ' ')
echo "Found $BRANCH_COUNT branches to delete."
echo ""

read -p "Delete all merged branches? (y/N) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Deleting branches..."

    for branch in $MERGED_BRANCHES; do
        echo "Deleting: $branch"
        git push origin --delete "$branch" 2>/dev/null || echo "  (already deleted or protected)"
    done

    echo ""
    echo "Done! Deleted merged branches."
else
    echo "Aborted. No branches deleted."
fi
