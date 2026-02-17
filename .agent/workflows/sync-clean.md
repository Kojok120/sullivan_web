---
description: Sync main/dev and delete all other branches (Cleanup)
---

# Sync & Clean Workflow

This workflow updates `main` and `dev` branches and deletes all other local and remote branches to keep the repository clean.

> [!CAUTION]
> This will delete ALL branches except `main` and `dev`. Make sure you don't have important unmerged work in other branches!

1. Check for uncommitted changes
    - If you have uncommitted changes, please stash or commit them before running this workflow.
   ```bash
   if [ -n "$(git status --porcelain)" ]; then 
     echo "Error: You have uncommitted changes. Please commit or stash them first."
     exit 1
   fi
   ```

2. Sync `main` branch
   ```bash
   git checkout main
   git fetch origin main
   git reset --hard origin/main
   ```

3. Sync `dev` branch
   ```bash
   git checkout dev
   git fetch origin dev
   git reset --hard origin/dev
   ```

4. Delete other local branches
   ```bash
   git branch | grep -v "main" | grep -v "dev" | xargs git branch -D
   ```

5. Delete other remote branches
   ```bash
   # This lists remote branches, filters out main/dev/HEAD, extracts branch name, and deletes them from origin
   # Use with extreme caution.
   # git branch -r | grep -v "main" | grep -v "dev" | grep -v "HEAD" | sed 's/origin\///' | xargs -I {} git push origin --delete {}
   echo "Remote branch deletion is commented out for safety. Uncomment in the workflow file if you really want to automate this."
   ```
