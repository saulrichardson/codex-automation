import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Codex, type ModelReasoningEffort } from "@openai/codex-sdk";

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

function buildWorkPrompt(taskInstructions: string): string {
  return [
    "You are an autonomous coding agent working in this repository.",
    "Task instructions:",
    "```",
    taskInstructions,
    "```",
    "Work as comprehensively as you reasonably can to complete the task.",
    "You may edit files and run commands.",
    "At the end, explain what you did and what you're unsure about.",
    "Do not write summary/validation files yet.",
  ].join("\n\n");
}

function buildPlanPrompt(): string {
  return [
    "Write two files in the repository:",
    "1. codex/work-summary.md: summarize what you did and any open questions.",
    "2. codex/validation-plan.md: numbered checklist a validator can follow.",
    "After writing the files, reply with a brief confirmation (not the full file contents).",
  ].join("\n\n");
}

function buildValidationPrompt(taskInstructions: string, validationPlan: string): string {
  return [
    "You are the validator agent. You did not perform the work.",
    "Original task instructions (source of truth):",
    "```",
    taskInstructions,
    "```",
    "First-pass validation plan (guidance only—verify independently):",
    "```",
    validationPlan,
    "```",
    "Validate whether the approach and work done actually accomplish the original instructions. Use the plan for structure but do not trust its claims—inspect files and run commands yourself, refining the plan if needed.",
    "Write your validation report to codex/validation-report.md. Include: a clear ACCEPT/REJECT verdict against the original instructions, numbered issues, and recommended follow-ups.",
    "After writing the file, reply with a brief confirmation (not the full report).",
  ].join("\n\n");
}

function buildReflectionPrompt(validationReport: string): string {
  return [
    "Validator report:",
    "```",
    validationReport,
    "```",
    "You are the original worker. Briefly react: state whether you agree, what fixes or follow-ups you would prioritize, and any clarifications. Keep it concise.",
  ].join("\n\n");
}

export async function runTwoPassOnTask(opts: RunTwoPassOptions): Promise<TwoPassResult> {
  const { repoRoot, taskSlug, taskInstructions, baseBranch = "main" } = opts;

  const branchName = `codex/${taskSlug}`;
  const worktreePath = path.join(repoRoot, ".codex", "worktrees", taskSlug);

  await ensureWorktree({ repoRoot, worktreePath, branchName, baseBranch });

  const model = process.env.CODEX_MODEL ?? "gpt-5.1-codex-max";
  const modelReasoningEffort = (process.env.CODEX_REASONING_EFFORT ?? "high") as ModelReasoningEffort;
  const codex = new Codex();
  const cwd = worktreePath;

  const thread1 = codex.startThread({ workingDirectory: cwd, model, modelReasoningEffort });
  const workPrompt = buildWorkPrompt(taskInstructions);
  const workTurn = await thread1.run(workPrompt);
  const firstPassWorkMessage = workTurn.finalResponse;

  await fs.mkdir(path.join(cwd, "codex"), { recursive: true });
  const planPrompt = buildPlanPrompt();
  const planTurn = await thread1.run(planPrompt);
  let firstPassValidationPlanMessage = planTurn.finalResponse;

  const summaryFile = path.join(cwd, "codex", "work-summary.md");
  const validationPlanFile = path.join(cwd, "codex", "validation-plan.md");
  let validationPlanText: string;
  try {
    validationPlanText = await fs.readFile(validationPlanFile, "utf8");
  } catch (err) {
    const missingPlan = (err as NodeJS.ErrnoException)?.code === "ENOENT";
    if (!missingPlan) throw err;

    const retryPrompt = [
      "The file codex/validation-plan.md was not found.",
      "Write the validation plan to codex/validation-plan.md now, then reply with a short confirmation.",
    ].join("\n\n");

    const retryTurn = await thread1.run(retryPrompt);
    firstPassValidationPlanMessage = `${firstPassValidationPlanMessage}\n\n[retry]\n${retryTurn.finalResponse}`;
    validationPlanText = await fs.readFile(validationPlanFile, "utf8");
  }

  const thread2 = codex.startThread({ workingDirectory: cwd, model, modelReasoningEffort });
  const validationPrompt = buildValidationPrompt(taskInstructions, validationPlanText);
  const validationTurn = await thread2.run(validationPrompt);
  let validationResultMessage = validationTurn.finalResponse;

  const validationReportFile = path.join(cwd, "codex", "validation-report.md");
  let validationReportText: string;
  try {
    validationReportText = await fs.readFile(validationReportFile, "utf8");
  } catch (err) {
    const missingReport = (err as NodeJS.ErrnoException)?.code === "ENOENT";
    if (!missingReport) throw err;

    const retryPrompt = [
      "The file codex/validation-report.md was not found.",
      "Write the validation report to codex/validation-report.md now, then reply with a short confirmation.",
    ].join("\n\n");

    const retryTurn = await thread2.run(retryPrompt);
    validationResultMessage = `${validationResultMessage}\n\n[retry]\n${retryTurn.finalResponse}`;
    validationReportText = await fs.readFile(validationReportFile, "utf8");
  }

  const reflectionPrompt = buildReflectionPrompt(validationReportText);
  const reflectionTurn = await thread1.run(reflectionPrompt);
  const postValidationReflectionMessage = reflectionTurn.finalResponse;

  const workThreadId = thread1.id;
  const validationThreadId = thread2.id;
  if (!workThreadId || !validationThreadId) {
    throw new Error("Thread IDs missing; cannot persist session info");
  }

  const threadIdsFile = path.join(cwd, "codex", "thread-ids.json");
  await fs.writeFile(
    threadIdsFile,
    JSON.stringify(
      {
        workThreadId,
        validationThreadId,
      },
      null,
      2
    )
  );

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
