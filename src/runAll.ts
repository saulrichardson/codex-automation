import fs from "node:fs/promises";
import path from "node:path";
import { createLogger } from "./lib/logger.js";
import { runTwoPassOnTask, TwoPassResult } from "./runTwoPass.js";

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
  const entries = await fs.readdir(fullTasksDir);
  const pattern = tasksGlob ? globToRegex(tasksGlob) : undefined;

  const taskFiles = entries.filter((name) => name.endsWith(".txt") && (!pattern || pattern.test(name)));
  if (taskFiles.length === 0) {
    throw new Error(`No task files found in ${fullTasksDir}${tasksGlob ? ` matching ${tasksGlob}` : ""}`);
  }
  return taskFiles.map((name) => ({
    taskSlug: path.basename(name, ".txt"),
    instructionsPath: path.join(fullTasksDir, name),
  }));
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

  if (options.dryRun) {
    tasks.forEach((task) => {
      const branch = `codex/${task.taskSlug}`;
      const worktree = path.join(repoRoot, ".codex", "worktrees", task.taskSlug);
      console.log([`DRY-RUN ${task.taskSlug}`, `branch: ${branch}`, `worktree: ${worktree}`].join(" | "));
    });
    return;
  }

  const taskPromises = tasks.map(async (task) => {
    const taskInstructions = await fs.readFile(task.instructionsPath, "utf8");
    const result = await runTwoPassOnTask({
      repoRoot,
      taskSlug: task.taskSlug,
      taskInstructions,
      baseBranch: options.baseBranch,
    });
    return { taskSlug: task.taskSlug, result };
  });

  const settled = await Promise.allSettled(taskPromises);

  let failed = 0;
  settled.forEach((entry, index) => {
    const taskSlug = tasks[index]?.taskSlug ?? "unknown-task";
    if (entry.status === "fulfilled") {
      const { result } = entry.value;
      console.log(
        [
          `✅ ${taskSlug}`,
          `branch: ${result.branchName}`,
          `worktree: ${result.worktreePath}`,
          `workerThread: ${result.workThreadId}`,
          `validatorThread: ${result.validationThreadId}`,
          `threadIds: ${result.threadIdsFile}`,
        ].join(" | ")
      );
    } else {
      failed += 1;
      log.error(`${taskSlug} | ${formatFailure(entry.reason)}`);
    }
  });

  if (failed > 0) {
    process.exitCode = 1;
  }
}

void main().catch((err) => {
  console.error(`❌ run failed | ${formatFailure(err)}`);
  process.exitCode = 1;
});
