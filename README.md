# Codex Two-Pass Runner

Run Codex on a set of plain-text tasks, one branch/worktree per task, with a built-in validator pass.

```
         tasks: .codex/tasks/*.txt
                      │
          ┌───────────┴───────────┐
          │   for each <slug>    │
          ▼                       ▼
 branch codex/<slug>    worktree .codex/worktrees/<slug>
                      (isolated copy of repo)
          │
   ┌──────┴──────┐
   │  Pass 1     │ ➜ codex/work-summary.md
   │  worker     │ ➜ codex/validation-plan.md
   ├──────┬──────┤
   │  Pass 2     │ ➜ codex/validation-report.md
   │  validator  │
   └──────┴──────┘
          │
    codex/thread-ids.json (resume threads later)
```

## What It Does (high level)
- Reads `.codex/tasks/*.txt` (one file = one task slug).
- For each task: creates branch `codex/<slug>` and worktree `.codex/worktrees/<slug>`.
- Pass 1 (worker): executes the task, writes `codex/work-summary.md` and `codex/validation-plan.md`.
- Pass 2 (validator): independently checks the work and writes `codex/validation-report.md`.
- Saves `codex/thread-ids.json` so threads can be resumed.

## Requirements
- Node.js 18+
- Git repo
- Env: `CODEX_API_KEY` and `CODEX_MODEL` (or set `model` in `codex.config.toml`). No default model is assumed.
- Optional: `CODEX_BASE_URL`/`OPENAI_BASE_URL`, `codex.config.toml` (or `CODEX_CONFIG_PATH`) for sandbox, approval, network/web-search settings. `.env` in the host repo is auto-loaded.

## Quick Start (direct clone)
```bash
npm ci
npm run build
CODEX_API_KEY=... CODEX_MODEL=gpt-5.1-codex node dist/runAll.js
```

With Makefile (direct clone only):
```bash
make run ARGS="--tasks-dir .codex/tasks"
# env inline works too: CODEX_API_KEY=... CODEX_MODEL=... make run
make dry-run ARGS="--tasks-glob fix-*"
make clean-worktrees               # dry-run
make clean-worktrees ARGS="--yes" # remove worktrees/branches
```

> Note: Makefile targets assume you run them from the runner repo root. When used as a submodule, run the node command from the host repo root instead (see below).

## As a Submodule in a Host Repo
TL;DR
```bash
git submodule add git@github.com:saulrichardson/codex-automation.git addons/codex-runner
cd addons/codex-runner && npm ci && npm run build
CODEX_API_KEY=... CODEX_MODEL=gpt-5.1-codex node addons/codex-runner/dist/runAll.js
```

```bash
git submodule add git@github.com:saulrichardson/codex-automation.git addons/codex-runner
cd addons/codex-runner && npm ci && npm run build
# from host repo root
CODEX_API_KEY=... CODEX_MODEL=gpt-5.1-codex node addons/codex-runner/dist/runAll.js
```

## Prepare Tasks
```bash
mkdir -p .codex/tasks
echo "Fix the flakey CI job" > .codex/tasks/fix-ci.txt   # slug = fix-ci
```
- One `.txt` per task. Filename (minus `.txt`) must be unique; this becomes the branch/worktree name.

## CLI Flags
- `--base-branch <name>`: base branch for worktrees (default `main`).
- `--tasks-dir <path>`: where task files live (default `.codex/tasks`).
- `--tasks-glob <glob>`: simple `*`/`?` filename filter.
- `--dry-run`: list tasks and intended branch/worktree without calling Codex.

## Outputs per Task
```
.codex/worktrees/<slug>/
  report.txt, code changes, etc. (whatever the task did)
  codex/work-summary.md
  codex/validation-plan.md
  codex/validation-report.md
  codex/thread-ids.json
```

## Resume Threads
`codex/thread-ids.json` stores `workThreadId` and `validationThreadId`; use the Codex SDK’s `resumeThread` with `workingDirectory` set to the worktree.

## Cleanup
Run from the host repo root:
```bash
npm run clean-worktrees          # dry-run
npm run clean-worktrees -- --yes # remove .codex/worktrees/* and delete codex/<slug> branches
# or: CODEX_API_KEY=... CODEX_MODEL=... node addons/codex-runner/scripts/cleanWorktrees.js --yes
```

## Tips
- Always set a model via env or `codex.config.toml` (no fallback).
- Keep task slugs unique to avoid worktree collisions.
- Rebuild the submodule after pulling updates: `npm run build` inside `addons/codex-runner`.
