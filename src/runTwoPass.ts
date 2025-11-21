import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Codex } from "@openai/codex-sdk";

const execFileAsync = promisify(execFile);

export interface TwoPassResult {
  branchName: string;
  worktreePath: string;
  firstPassWorkMessage: string;
  firstPassValidationPlanMessage: string;
  validationResultMessage: string;
  summaryFile: string;
  validationPlanFile: string;
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
    "Task instructions:",
    "```",
    taskInstructions,
    "```",
    "Validation plan:",
    "```",
    validationPlan,
    "```",
    "Follow (and refine if needed) this plan to validate the repository. Inspect files and run commands as needed. In final response, give verdict (ACCEPT/REJECT), issues, and recommendations.",
  ].join("\n\n");
}

export async function runTwoPassOnTask(opts: RunTwoPassOptions): Promise<TwoPassResult> {
  const { repoRoot, taskSlug, taskInstructions, baseBranch = "main" } = opts;

  const branchName = `codex/${taskSlug}`;
  const worktreePath = path.join(repoRoot, ".codex", "worktrees", taskSlug);

  await ensureWorktree({ repoRoot, worktreePath, branchName, baseBranch });

  const codex = new Codex();
  const cwd = worktreePath;

  const thread1 = codex.startThread({ workingDirectory: cwd });
  const workPrompt = buildWorkPrompt(taskInstructions);
  const workTurn = await thread1.run(workPrompt);
  const firstPassWorkMessage = workTurn.finalResponse;

  await fs.mkdir(path.join(cwd, "codex"), { recursive: true });
  const planPrompt = buildPlanPrompt();
  const planTurn = await thread1.run(planPrompt);
  const firstPassValidationPlanMessage = planTurn.finalResponse;

  const summaryFile = path.join(cwd, "codex", "work-summary.md");
  const validationPlanFile = path.join(cwd, "codex", "validation-plan.md");
  const validationPlanText = await fs.readFile(validationPlanFile, "utf8");

  const thread2 = codex.startThread({ workingDirectory: cwd });
  const validationPrompt = buildValidationPrompt(taskInstructions, validationPlanText);
  const validationTurn = await thread2.run(validationPrompt);
  const validationResultMessage = validationTurn.finalResponse;

  return {
    branchName,
    worktreePath,
    firstPassWorkMessage,
    firstPassValidationPlanMessage,
    validationResultMessage,
    summaryFile,
    validationPlanFile,
  };
}
