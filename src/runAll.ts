import fs from "node:fs/promises";
import path from "node:path";
import { runTwoPassOnTask, TwoPassResult } from "./runTwoPass";

interface TaskFile {
  taskSlug: string;
  instructionsPath: string;
}

async function findTaskFiles(repoRoot: string): Promise<TaskFile[]> {
  const tasksDir = path.join(repoRoot, ".codex", "tasks");
  const entries = await fs.readdir(tasksDir);
  const taskFiles = entries.filter((name) => name.endsWith(".txt"));
  if (taskFiles.length === 0) {
    throw new Error("No task files found in .codex/tasks");
  }
  return taskFiles.map((name) => ({
    taskSlug: path.basename(name, ".txt"),
    instructionsPath: path.join(tasksDir, name),
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
  const tasks = await findTaskFiles(repoRoot);

  const taskPromises = tasks.map(async (task) => {
    const taskInstructions = await fs.readFile(task.instructionsPath, "utf8");
    const result = await runTwoPassOnTask({
      repoRoot,
      taskSlug: task.taskSlug,
      taskInstructions,
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
        `✅ ${taskSlug} | branch: ${result.branchName} | worktree: ${result.worktreePath}`
      );
    } else {
      failed += 1;
      console.error(`❌ ${taskSlug} | ${formatFailure(entry.reason)}`);
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
