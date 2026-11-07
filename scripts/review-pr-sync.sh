#!/usr/bin/env bash
# Syncs and checks the open weekly review PR (scampedia/pending-batch).
#
#   scripts/review-pr-sync.sh update   rewrite the description's entry list, then check
#   scripts/review-pr-sync.sh check    only check (for pushes and edits by a person)
#
# After checking it sets a "Review entries" commit status on the PR's head
# commit and keeps one comment up to date with the final entry list, so the
# list Nick merges is on the PR. Needs GH_TOKEN with pull-requests: write and
# statuses: write. Run from a checkout of the review branch, with origin/main
# fetched. Pushes and edits made with the workflow token don't start other
# workflows, so the bots call this themselves after pushing.
set -euo pipefail
cd "$(dirname "$0")/.."

MODE=${1:?usage: review-pr-sync.sh update|check}
PR=$(gh pr list --head scampedia/pending-batch --base main --state open --json number --jq '.[0].number // empty')
if [ -z "$PR" ]; then
  echo "No open review PR."
  exit 0
fi
SHA=$(git rev-parse HEAD)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

gh pr view "$PR" --json body --jq '.body' > "$TMP/body.md"
if [ "$MODE" = "update" ]; then
  node scripts/review-pr-entries.js splice --body-file "$TMP/body.md" > "$TMP/new.md"
  gh pr edit "$PR" --body-file "$TMP/new.md"
  cp "$TMP/new.md" "$TMP/body.md"
fi

REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner')
if node scripts/review-pr-entries.js check --body-file "$TMP/body.md"; then
  gh api "repos/$REPO/statuses/$SHA" -f state=success -f context="Review entries" \
    -f description="The description lists every entry in the diff" > /dev/null
else
  gh api "repos/$REPO/statuses/$SHA" -f state=failure -f context="Review entries" \
    -f description="The description doesn't match the entries in the diff" > /dev/null
  exit 1
fi

# One comment, edited in place, with the list for the current head commit.
{
  echo "<!-- review-entries:comment -->"
  echo "**Final entry list for commit \`${SHA:0:7}\`.** Merging this PR publishes exactly this. The comment is rewritten whenever the branch changes."
  echo
  node scripts/review-pr-entries.js render
} > "$TMP/comment.md"
COMMENT_ID=$(gh api "repos/$REPO/issues/$PR/comments" --paginate \
  --jq '.[] | select(.body | startswith("<!-- review-entries:comment -->")) | .id' | head -1)
if [ -n "$COMMENT_ID" ]; then
  gh api -X PATCH "repos/$REPO/issues/comments/$COMMENT_ID" -F body=@"$TMP/comment.md" > /dev/null
else
  gh pr comment "$PR" --body-file "$TMP/comment.md"
fi
