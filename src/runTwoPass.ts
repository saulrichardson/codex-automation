import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Codex } from "@openai/codex-sdk";
import { loadConfig, threadOptionsForCwd } from "./config.js";
import { buildPlanPrompt, buildReflectionPrompt, buildValidationPrompt, buildWorkPrompt } from "./prompts.js";
import { runWithRetries } from "./lib/runWithRetries.js";
import { createLogger } from "./lib/logger.js";
import { ensureDir, readIfExists, writeJson } from "./lib/fs.js";

const execFileAsync = promisify(execFile);

export interface TwoPassResult {
  branchName: string;
  worktreePath: string;
  firstPassWorkMessage: string;
  firstPassValidationPlanMessage: string;
  validationResultMessage: string;
  summaryFile: string;
  validationPlanFile: string;
  validationReportFile: string;
  postValidationReflectionMessage: string;
  workThreadId: string;
  validationThreadId: string;
  threadIdsFile: string;
}

export interface RunTwoPassOptions {
  repoRoot: string;
  taskSlug: string;
  taskInstructions: string;
  baseBranch?: string;
}

interface WorktreeOptions {
  repoRoot: string;
  worktreePath: string;
  branchName: string;
  baseBranch: string;
}
async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function ensureWorktree(opts: WorktreeOptions): Promise<void> {
  const { repoRoot, worktreePath, branchName, baseBranch } = opts;
  const alreadyExists = await pathExists(worktreePath);
  if (alreadyExists) return;

  await fs.mkdir(path.dirname(worktreePath), { recursive: true });
  const relPath = path.relative(repoRoot, worktreePath) || ".";
  await execFileAsync("git", ["worktree", "add", relPath, "-b", branchName, baseBranch], {
    cwd: repoRoot,
  });
}


export async function runTwoPassOnTask(opts: RunTwoPassOptions): Promise<TwoPassResult> {
  const { repoRoot, taskSlug, taskInstructions, baseBranch = "main" } = opts;

  const branchName = `codex/${taskSlug}`;
  const worktreePath = path.join(repoRoot, ".codex", "worktrees", taskSlug);

  const log = createLogger(taskSlug);
  const { codexConfig, threadOptionsBase, apiKey, baseURL } = await loadConfig(repoRoot);

  await ensureWorktree({ repoRoot, worktreePath, branchName, baseBranch });
  log.info(`worktree ready at ${worktreePath} (branch ${branchName})`);

  const threadOptions = threadOptionsForCwd(threadOptionsBase, worktreePath);

  const codex = new Codex({
    apiKey,
    baseURL,
    ...(codexConfig ? ({ config: codexConfig } as any) : undefined),
  });

  const thread1 = codex.startThread(threadOptions);
  const workTurn = await runWithRetries(thread1, buildWorkPrompt(taskInstructions));
  const firstPassWorkMessage = workTurn.finalResponse;

  const codexDir = path.join(worktreePath, "codex");
  await ensureDir(codexDir);

  const planTurn = await runWithRetries(thread1, buildPlanPrompt());
  let firstPassValidationPlanMessage = planTurn.finalResponse;

  const summaryFile = path.join(codexDir, "work-summary.md");
  const validationPlanFile = path.join(codexDir, "validation-plan.md");
  let validationPlanText = await readIfExists(validationPlanFile);
  if (!validationPlanText) {
    const retryPrompt = [
      "The file codex/validation-plan.md was not found.",
      "Write the validation plan to codex/validation-plan.md now, then reply with a short confirmation.",
    ].join("\n\n");

    const retryTurn = await runWithRetries(thread1, retryPrompt);
    firstPassValidationPlanMessage = `${firstPassValidationPlanMessage}\n\n[retry]\n${retryTurn.finalResponse}`;
    validationPlanText = await readIfExists(validationPlanFile);
    if (!validationPlanText) {
      throw new Error("Validation plan was not written after retry");
    }
  }

  const thread2 = codex.startThread(threadOptions);
  const validationTurn = await runWithRetries(
    thread2,
    buildValidationPrompt(taskInstructions, validationPlanText)
  );
  let validationResultMessage = validationTurn.finalResponse;

  const validationReportFile = path.join(codexDir, "validation-report.md");
  let validationReportText = await readIfExists(validationReportFile);
  if (!validationReportText) {
    const retryPrompt = [
      "The file codex/validation-report.md was not found.",
      "Write the validation report to codex/validation-report.md now, then reply with a short confirmation.",
    ].join("\n\n");

    const retryTurn = await runWithRetries(thread2, retryPrompt);
    validationResultMessage = `${validationResultMessage}\n\n[retry]\n${retryTurn.finalResponse}`;
    validationReportText = await readIfExists(validationReportFile);
    if (!validationReportText) {
      throw new Error("Validation report was not written after retry");
    }
  }

  const reflectionTurn = await runWithRetries(
    thread1,
    buildReflectionPrompt(validationReportText)
  );
  const postValidationReflectionMessage = reflectionTurn.finalResponse;

  const workThreadId = thread1.id;
  const validationThreadId = thread2.id;
  if (!workThreadId || !validationThreadId) {
    throw new Error("Thread IDs missing; cannot persist session info");
  }

  const threadIdsFile = path.join(codexDir, "thread-ids.json");
  await writeJson(threadIdsFile, { workThreadId, validationThreadId });

  log.info(`workerThread=${workThreadId} validatorThread=${validationThreadId}`);

  return {
    branchName,
    worktreePath,
    firstPassWorkMessage,
    firstPassValidationPlanMessage,
    validationResultMessage,
    summaryFile,
    validationPlanFile,
    validationReportFile,
    postValidationReflectionMessage,
    workThreadId,
    validationThreadId,
    threadIdsFile,
  };
}
