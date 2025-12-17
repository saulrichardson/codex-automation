import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createLogger } from "./lib/logger.js";
import { runTwoPassOnTask, TwoPassResult } from "./runTwoPass.js";

const execFileAsync = promisify(execFile);

interface TaskFile {
  taskSlug: string;
  instructionsPath: string;
}

interface CliOptions {
  baseBranch: string;
  tasksDir: string;
  tasksGlob?: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    baseBranch: "main",
    tasksDir: ".codex/tasks",
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--base-branch": {
        const val = argv[i + 1];
        if (!val) throw new Error("--base-branch requires a value");
        opts.baseBranch = val;
        i += 1;
        break;
      }
      case "--tasks-dir": {
        const val = argv[i + 1];
        if (!val) throw new Error("--tasks-dir requires a value");
        opts.tasksDir = val;
        i += 1;
        break;
      }
      case "--tasks-glob": {
        const val = argv[i + 1];
        if (!val) throw new Error("--tasks-glob requires a value");
        opts.tasksGlob = val;
        i += 1;
        break;
      }
      case "--dry-run": {
        opts.dryRun = true;
        break;
      }
      default:
        if (arg.startsWith("--")) {
          throw new Error(`Unknown flag: ${arg}`);
        }
    }
  }

  return opts;
}

function globToRegex(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|\\]/g, "\\$&");
  const regex = escaped
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${regex}$`);
}

async function findTaskFiles(repoRoot: string, tasksDir: string, tasksGlob?: string): Promise<TaskFile[]> {
  const fullTasksDir = path.isAbsolute(tasksDir) ? tasksDir : path.join(repoRoot, tasksDir);
  let entries: string[];
  try {
    entries = await fs.readdir(fullTasksDir);
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      throw new Error(`Tasks directory not found: ${fullTasksDir}`);
    }
    throw err;
  }
  const pattern = tasksGlob ? globToRegex(tasksGlob) : undefined;

  const taskFiles = entries
    .filter((name) => name.endsWith(".txt") && (!pattern || pattern.test(name)))
    .sort();
  if (taskFiles.length === 0) {
    throw new Error(`No task files found in ${fullTasksDir}${tasksGlob ? ` matching ${tasksGlob}` : ""}`);
  }
  return taskFiles
    .map((name) => ({
      taskSlug: path.basename(name, ".txt"),
      instructionsPath: path.join(fullTasksDir, name),
      fileName: name,
    }))
    .map(({ taskSlug, instructionsPath, fileName }) => {
      if (!taskSlug) {
        throw new Error(`Invalid task filename (empty slug): ${fileName}`);
      }
      return { taskSlug, instructionsPath };
    });
}

async function validateTaskRefs(repoRoot: string, tasks: TaskFile[]): Promise<void> {
  const invalid: string[] = [];
  for (const task of tasks) {
    const branchName = `codex/${task.taskSlug}`;
    try {
      await execFileAsync("git", ["check-ref-format", "--branch", branchName], { cwd: repoRoot });
    } catch {
      invalid.push(`${task.taskSlug} → ${branchName}`);
    }
  }
  if (invalid.length > 0) {
    throw new Error(
      [
        "One or more task slugs would create an invalid git branch name.",
        "Rename the task file(s) to a slug that forms a valid branch ref, or pass a different --tasks-glob.",
        ...invalid.map((s) => `- ${s}`),
      ].join("\n")
    );
  }
}

function formatFailure(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.message;
  }
  return String(reason);
}

async function main(): Promise<void> {
  const repoRoot = process.cwd();
  const log = createLogger("runAll");
  const options = parseArgs(process.argv.slice(2));

  const tasks = await findTaskFiles(repoRoot, options.tasksDir, options.tasksGlob);
  await validateTaskRefs(repoRoot, tasks);

  if (options.dryRun) {
    tasks.forEach((task) => {
      const branch = `codex/${task.taskSlug}`;
      const worktree = path.join(repoRoot, ".codex", "worktrees", task.taskSlug);
      console.log([`DRY-RUN ${task.taskSlug}`, `branch: ${branch}`, `worktree: ${worktree}`].join(" | "));
    });
    return;
  }

  let failed = 0;
  for (const task of tasks) {
    try {
      const taskInstructions = await fs.readFile(task.instructionsPath, "utf8");
      const result = await runTwoPassOnTask({
        repoRoot,
        taskSlug: task.taskSlug,
        taskInstructions,
        baseBranch: options.baseBranch,
      });
      console.log(
        [
          `✅ ${task.taskSlug}`,
          `branch: ${result.branchName}`,
          `worktree: ${result.worktreePath}`,
          `workerThread: ${result.workThreadId}`,
          `validatorThread: ${result.validationThreadId}`,
          `threadIds: ${result.threadIdsFile}`,
        ].join(" | ")
      );
    } catch (err) {
      failed += 1;
      log.error(`${task.taskSlug} | ${formatFailure(err)}`);
    }
  }

  if (failed > 0) {
    process.exitCode = 1;
  }
}

void main().catch((err) => {
  console.error(`❌ run failed | ${formatFailure(err)}`);
  process.exitCode = 1;
});
