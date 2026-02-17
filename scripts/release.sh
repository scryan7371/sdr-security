#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <patch|minor|major>"
  exit 1
fi

BUMP="$1"
case "$BUMP" in
  patch|minor|major) ;;
  *)
    echo "Invalid bump type: $BUMP"
    echo "Allowed: patch, minor, major"
    exit 1
    ;;
esac

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Working tree is not clean. Commit or stash changes first."
  exit 1
fi

if [ "$(git rev-parse --abbrev-ref HEAD)" = "HEAD" ]; then
  echo "Detached HEAD. Checkout a branch first."
  exit 1
fi

echo "Running tests..."
npm test

echo "Building package..."
npm run build

RAW_VERSION="$(npm version "$BUMP" --no-git-tag-version)"
VERSION="${RAW_VERSION#v}"
TAG="sdr-security-v${VERSION}"

git add package.json package-lock.json
git commit -m "chore(release): v${VERSION}"
git tag "$TAG"

echo "Pushing commit and tag..."
git push
git push origin "$TAG"

echo "Release prepared and pushed: ${TAG}"
echo "Publish workflow should trigger from the tag push."
