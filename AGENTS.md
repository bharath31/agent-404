# AGENTS.md

Instructions and workflow rules for AI coding agents (Claude, Cursor, Copilot, Pi, Codex) working on this repository.

## Critical Workflow Rule: Git Worktrees

**Any new change, feature, or bugfix must ALWAYS be started from a new Git worktree pulled off the latest `main` branch.**

Because multiple agents and human contributors work concurrently on this codebase, working directly on existing branches or the main working tree leads to collision and state corruption.

### Starting a New Task

1. Fetch latest changes from remote:
   ```bash
   git fetch origin main
   ```

2. Create a dedicated isolated worktree:
   ```bash
   git worktree add ../agent-404-<feature-name> origin/main -b feat/<feature-name>
   ```

3. Navigate to the new worktree and link node_modules / install dependencies:
   ```bash
   cd ../agent-404-<feature-name>
   ln -s /Users/bharath/dev/agent-404/node_modules ./node_modules
   ```

4. Verify all tests pass before making changes:
   ```bash
   npm test
   ```

5. When work is complete and committed, push your branch and remove the worktree if needed:
   ```bash
   git push origin feat/<feature-name>
   ```
