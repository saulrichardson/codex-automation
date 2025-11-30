# Codex Two-Pass Runner

Automates Codex-driven task execution for a host repo. You drop plain text
instructions in `.codex/tasks/`; this runner creates an isolated branch +
worktree for each task and runs a two-pass Codex flow: first pass does the work
and writes a summary plus validation plan; second pass validates independently
against the original instructions. All tasks run in parallel.

Best suited for multiple independent tasks you want to execute concurrently,
each in its own branch/worktree without cross-contamination.

Flow sketch:
```
.codex/tasks/*.txt
        │ (discover & parallelize)
        ▼
for each task:
  branch = codex/<slug>
  worktree = .codex/worktrees/<slug>
  thread1: do work ➜ codex/work-summary.md + validation-plan.md
  thread2: validate using instructions + plan ➜ codex/validation-report.md
  thread1: reflect on validator report (no new files)
  Save thread IDs for resuming later ➜ codex/thread-ids.json
```

## Requirements
- Node.js 18+
- Git repository (host repo)
- Environment: `CODEX_API_KEY` and `CODEX_MODEL` (or set `model` in
  `codex.config.toml`). No hardcoded model fallback is used.
- Custom endpoint (optional): `CODEX_BASE_URL` or `OPENAI_BASE_URL`.
- Optional: `codex.config.toml` in the host repo (or point to it with
  `CODEX_CONFIG_PATH`). The runner mirrors the gov-gpt tooling and will read
  model, sandbox, approval policy, network/web search toggles from this config.
  A `.env` in the host repo is also loaded automatically.

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

### CLI flags
- `--base-branch <name>`: branch to base worktrees on (default `main`).
- `--tasks-dir <path>`: directory containing `.txt` task files (default `.codex/tasks`).
- `--tasks-glob <glob>`: filter task filenames (simple `*`/`?` wildcards).
- `--dry-run`: list tasks + intended branch/worktree without running Codex.

### Maintenance helpers
- `npm run clean-worktrees` (dry-run) or `npm run clean-worktrees -- --yes` to remove `.codex/worktrees/*` and delete matching `codex/<slug>` branches.

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
    the saved plan and writes codex/validation-report.md.
- Console prints per-task ✅/❌ with branch and worktree paths.

## Outputs per task
```
.codex/worktrees/<slug>/
  codex/work-summary.md
  codex/validation-plan.md
  codex/validation-report.md
  codex/thread-ids.json   # contains workThreadId and validationThreadId
```

### Resuming agent threads later
Thread sessions are persisted in `~/.codex/sessions` and we record the IDs per task in `codex/thread-ids.json`. To resume:

```ts
import { Codex } from "@openai/codex-sdk";
import path from "node:path";
import fs from "node:fs/promises";

const cwd = ".codex/worktrees/<slug>";
const { workThreadId, validationThreadId } = JSON.parse(
  await fs.readFile(path.join(cwd, "codex", "thread-ids.json"), "utf8")
);

const codex = new Codex();
const worker = codex.resumeThread(workThreadId, { workingDirectory: cwd });
const validator = codex.resumeThread(validationThreadId, { workingDirectory: cwd });

// e.g., continue chatting with the worker
const turn = await worker.run("Pick up where you left off and address the validator's issues.");
console.log(turn.finalResponse);
```

You can also resume just one thread (worker or validator) depending on what you need.
Branch remains at `codex/<slug>` inside that worktree.

## Notes / tips
- Keep task slugs unique to avoid worktree collisions.
- If you pull updates to the submodule, rebuild: `npm run build`.
- The runner assumes the code executes from the host repo root (so relative
  paths to `.codex/tasks` and `.codex/worktrees` resolve correctly).
