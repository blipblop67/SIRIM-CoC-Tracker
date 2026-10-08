#!/usr/bin/env bash
# ==============================================================================
# Helper Script: Push SIRIM CoC Tracker to GitHub
# ==============================================================================

set -e

echo "🚀 Preparing to push to GitHub..."

# 1. Verify Git is initialized
if [ ! -d ".git" ]; then
  echo "📦 Initializing git repository..."
  git init
  git branch -M main
fi

# 2. Check Git user config
if [ -z "$(git config user.name)" ]; then
  echo "👤 Setting default git user name..."
  git config user.name "SIRIM Workspace Admin"
fi

if [ -z "$(git config user.email)" ]; then
  echo "📧 Setting default git user email..."
  git config user.email "admin@sirim-tracker.local"
fi

# 3. Add and commit any outstanding changes
echo "📁 Staging tracked files (excluding secrets in data/*.json & .env)..."
git add .
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
  echo "💾 Creating commit..."
  git commit -m "update: latest tracker changes and fixes"
else
  echo "✅ Working tree is clean."
fi

# 4. Check if remote URL was supplied as an argument
REPO_URL="$1"

if [ -z "$REPO_URL" ]; then
  CURRENT_REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
  if [ -n "$CURRENT_REMOTE" ]; then
    echo "🔗 Found existing origin remote: $CURRENT_REMOTE"
    REPO_URL="$CURRENT_REMOTE"
  else
    echo ""
    echo "⚠️  No GitHub repository URL provided."
    echo "👉 Usage:"
    echo "   ./push-to-github.sh https://github.com/<YOUR_USERNAME>/<YOUR_REPO>.git"
    echo "   or"
    echo "   ./push-to-github.sh git@github.com:<YOUR_USERNAME>/<YOUR_REPO>.git"
    echo ""
    echo "If using HTTPS with a GitHub Personal Access Token (PAT):"
    echo "   ./push-to-github.sh https://<YOUR_GITHUB_TOKEN>@github.com/<YOUR_USERNAME>/<YOUR_REPO>.git"
    exit 1
  fi
fi

# 5. Set or update remote origin
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REPO_URL"
else
  git remote add origin "$REPO_URL"
fi

echo "🚀 Pushing branch 'main' to origin..."
# Push main branch. If remote already has an existing initial commit (e.g. from GitHub web UI), offer safe push
if ! git push -u origin main; then
  echo ""
  echo "⚠️ Standard push failed. Remote might already contain commits (like a README or license created on GitHub)."
  echo "🔄 Attempting to rebase and merge with remote..."
  git pull origin main --rebase --allow-unrelated-histories || true
  git push -u origin main
fi

echo ""
echo "🎉 Successfully pushed to GitHub!"
