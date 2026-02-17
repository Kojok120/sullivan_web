---
description: Push current changes and create a PR to dev
---

# Push & PR Workflow

This workflow automates the process of pushing your current changes and creating a Pull Request against the `dev` branch.

1. Ensure we are on a proper branch
   ```bash
   current_branch=$(git branch --show-current)
   if [ "$current_branch" = "dev" ] || [ "$current_branch" = "main" ]; then
     new_branch="feature/update-$(date +%Y%m%d-%H%M%S)"
     git checkout -b "$new_branch"
     echo "Switched to new branch: $new_branch"
   else
     echo "On branch: $current_branch"
   fi
   ```

2. Commit changes
   ```bash
   # Add all changes
   git add .
   
   # Commit (if there are changes to commit)
   if ! git diff-index --quiet HEAD --; then
     git commit -m "Update: $(date +%Y-%m-%d %H:%M:%S)"
     echo "Changes committed."
   else
     echo "No changes to commit."
   fi
   ```

3. Push to remote
   ```bash
   current_branch=$(git branch --show-current)
   git push -u origin "$current_branch"
   ```

4. Create Pull Request
   ```bash
   # Creates a PR to 'dev' with title/body filled from commit (or interactive)
   # The --web flag opens it in the browser
   gh pr create --base dev --fill --web
   ```
