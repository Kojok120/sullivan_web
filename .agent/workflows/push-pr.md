---
description: Push current changes and create a PR to dev (Interactive)
---

# Push & PR Workflow

This workflow automates the process of pushing your current changes and creating a Pull Request against the `dev` branch.
It strictly follows the project's commit instructions (Conventional Commits).

1. Ensure we are on a proper branch & Create Branch
   ```bash
   current_branch=$(git branch --show-current)
   
   # Default type variable for later use
   commit_type="feat"

   if [ "$current_branch" = "dev" ] || [ "$current_branch" = "main" ]; then
     echo "You are currently on '$current_branch'. Let's create a new branch."
     
     # Interactive prompts for branch creation
     echo "Select change type (feat, fix, refactor, perf, etc.):"
     read type_input
     if [ -z "$type_input" ]; then type_input="feat"; fi
     commit_type=$type_input

     echo "Enter branch description (English, kebab-case, e.g., user-auth-fix):"
     read branch_desc
     if [ -z "$branch_desc" ]; then 
       branch_desc="update-$(date +%Y%m%d-%H%M%S)"
       echo "No description provided. Using: $branch_desc"
     fi

     new_branch="${type_input}/${branch_desc}"
     git checkout -b "$new_branch"
     echo "Switched to new branch: $new_branch"
   else
     echo "On branch: $current_branch"
     # Try to guess type from branch name if possible, otherwise default
     if [[ "$current_branch" == */* ]]; then
        commit_type=$(echo "$current_branch" | cut -d'/' -f1)
     fi
   fi
   ```

2. Commit changes
   ```bash
   # Add all changes
   git add .
   
   if ! git diff-index --quiet HEAD --; then
     echo "--- Commit Message Setup (Conventional Commits) ---"
     
     # Type
     echo "Enter commit type (default: $commit_type):"
     read input_type
     if [ -n "$input_type" ]; then commit_type="$input_type"; fi
     
     # Scope
     echo "Enter scope (optional, e.g., auth, api):"
     read scope
     
     # Description
     echo "Enter commit description (Japanese):"
     read description
     if [ -z "$description" ]; then
       echo "Description is required."
       exit 1
     fi
     
     # Construct message
     if [ -n "$scope" ]; then
       msg="${commit_type}(${scope}): ${description}"
     else
       msg="${commit_type}: ${description}"
     fi
     
     git commit -m "$msg"
     echo "Committed with message: $msg"
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
   # Check authentication
   if ! gh auth status >/dev/null 2>&1; then
     echo "Error: You are not logged into GitHub CLI. Run 'gh auth login' first."
     exit 1
   fi

   # Create PR
   # Uses the commit title as PR title and opens web for details
   gh pr create --base dev --fill --web
   ```
