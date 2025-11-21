"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runTwoPassOnTask = runTwoPassOnTask;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const codex_sdk_1 = require("@openai/codex-sdk");
const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
async function pathExists(target) {
    try {
        await promises_1.default.access(target);
        return true;
    }
    catch {
        return false;
    }
}
async function ensureWorktree(opts) {
    const { repoRoot, worktreePath, branchName, baseBranch } = opts;
    const alreadyExists = await pathExists(worktreePath);
    if (alreadyExists)
        return;
    await promises_1.default.mkdir(node_path_1.default.dirname(worktreePath), { recursive: true });
    const relPath = node_path_1.default.relative(repoRoot, worktreePath) || ".";
    await execFileAsync("git", ["worktree", "add", relPath, "-b", branchName, baseBranch], {
        cwd: repoRoot,
    });
}
function buildWorkPrompt(taskInstructions) {
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
function buildPlanPrompt() {
    return [
        "Write two files in the repository:",
        "1. codex/work-summary.md: summarize what you did and any open questions.",
        "2. codex/validation-plan.md: numbered checklist a validator can follow.",
        "After writing the files, reply with a brief confirmation (not the full file contents).",
    ].join("\n\n");
}
function buildValidationPrompt(taskInstructions, validationPlan) {
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
        "Focus on judging the correctness and sufficiency of the work/approach (not just echoing the current state).",
        "In your final response, give a verdict (ACCEPT/REJECT against the original instructions), list issues, and recommend follow-ups.",
    ].join("\n\n");
}
async function runTwoPassOnTask(opts) {
    const { repoRoot, taskSlug, taskInstructions, baseBranch = "main" } = opts;
    const branchName = `codex/${taskSlug}`;
    const worktreePath = node_path_1.default.join(repoRoot, ".codex", "worktrees", taskSlug);
    await ensureWorktree({ repoRoot, worktreePath, branchName, baseBranch });
    const codex = new codex_sdk_1.Codex();
    const cwd = worktreePath;
    const thread1 = codex.startThread({ workingDirectory: cwd });
    const workPrompt = buildWorkPrompt(taskInstructions);
    const workTurn = await thread1.run(workPrompt);
    const firstPassWorkMessage = workTurn.finalResponse;
    await promises_1.default.mkdir(node_path_1.default.join(cwd, "codex"), { recursive: true });
    const planPrompt = buildPlanPrompt();
    const planTurn = await thread1.run(planPrompt);
    const firstPassValidationPlanMessage = planTurn.finalResponse;
    const summaryFile = node_path_1.default.join(cwd, "codex", "work-summary.md");
    const validationPlanFile = node_path_1.default.join(cwd, "codex", "validation-plan.md");
    const validationPlanText = await promises_1.default.readFile(validationPlanFile, "utf8");
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
