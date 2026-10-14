#!/usr/bin/env bash
set -euo pipefail

# Push the local Data Lineage & Impact Analyzer monorepo to GitHub.
#
# Usage:
#   1. Create an empty repository on GitHub (no README, no .gitignore).
#   2. Export the token for the current session only:
#        export GITHUB_TOKEN="github_pat_..."
#   3. Run this script:
#        ./scripts/push-to-github.sh TU_USUARIO/NOMBRE_REPO

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "GITHUB_TOKEN environment variable is not set."
  echo "Set it for this session with: export GITHUB_TOKEN='github_pat_...'"
  exit 1
fi

REPO="${1:-}"
if [ -z "$REPO" ]; then
  echo "Usage: $0 TU_USUARIO/NOMBRE_REPO"
  exit 1
fi

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "Working directory: $PROJECT_ROOT"

if [ ! -d ".git" ]; then
  echo "Initializing git repository..."
  git init
fi

REMOTE_URL="https://${GITHUB_TOKEN}@github.com/${REPO}.git"

if git remote get-url origin >/dev/null 2>&1; then
  echo "Updating existing origin remote..."
  git remote set-url origin "$REMOTE_URL"
else
  echo "Adding origin remote..."
  git remote add origin "$REMOTE_URL"
fi

echo "Staging files..."
git add .

if ! git diff --cached --quiet; then
  echo "Creating initial commit..."
  git commit -m "feat: initial data lineage & impact analyzer with MCP"
else
  echo "No changes to commit."
fi

echo "Pushing to GitHub..."
git branch -M main
git push -u origin main

echo "Cleaning token from git remote..."
git remote set-url origin "https://github.com/${REPO}.git"

echo "Done. Repository pushed to https://github.com/${REPO}"
echo "You can now unset the token with: unset GITHUB_TOKEN"
