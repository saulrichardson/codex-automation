# Codex Two-Pass Runner

Automates Codex-driven task execution for a host repo. You drop plain text
instructions in `.codex/tasks/`; this runner creates an isolated branch +
worktree for each task and runs a two-pass Codex flow: first pass does the work
and writes a summary plus validation plan; second pass validates independently
against the original instructions. All tasks run in parallel.

Flow sketch:
```
.codex/tasks/*.txt
        │ (discover & parallelize)
        ▼
for each task:
  branch = codex/<slug>
  worktree = .codex/worktrees/<slug>
  thread1: do work ➜ codex/work-summary.md + validation-plan.md
  thread2: validate using instructions + plan (independent verdict)
```

## Requirements
- Node.js 18+
- Git repository (host repo)
- Environment: `CODEX_API_KEY` (and `OPENAI_BASE_URL` if you use a custom
  endpoint)

## Using in this repo (direct clone)
```bash
npm ci            # install deps
npm run build     # compile to dist/ (only needed after src changes)
node dist/runAll.js   # run from the host repo root
```

## Using as a git submodule in a host repo
```bash
git submodule add git@github.com:saulrichardson/codex-automation.git addons/codex-runner
cd addons/codex-runner && npm ci && npm run build
```
Then, from the **host repo root**:
```bash
node addons/codex-runner/dist/runAll.js
```

## Prepare task files (host repo)
```bash
mkdir -p .codex/tasks
echo "Fix the flakey CI job" > .codex/tasks/fix-ci.txt   # slug = fix-ci
```
- One file per task; filename (without `.txt`) is the task slug and must be
  unique.

## What happens when you run it
- Discovers all `.codex/tasks/*.txt`.
- For each task (in parallel):
  - Creates branch `codex/<slug>` and worktree `.codex/worktrees/<slug>`.
  - Runs Codex thread 1: does the work; then writes:
    - `codex/work-summary.md`
    - `codex/validation-plan.md`
  - Runs Codex thread 2 (fresh) to validate using the original instructions +
    the saved plan.
- Console prints per-task ✅/❌ with branch and worktree paths.

## Outputs per task
```
.codex/worktrees/<slug>/
  codex/work-summary.md
  codex/validation-plan.md
```
Branch remains at `codex/<slug>` inside that worktree.

## Notes / tips
- Keep task slugs unique to avoid worktree collisions.
- If you pull updates to the submodule, rebuild: `npm run build`.
- The runner assumes the code executes from the host repo root (so relative
  paths to `.codex/tasks` and `.codex/worktrees` resolve correctly).
