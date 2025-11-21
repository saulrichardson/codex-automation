"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const runTwoPass_1 = require("./runTwoPass");
async function findTaskFiles(repoRoot) {
    const tasksDir = node_path_1.default.join(repoRoot, ".codex", "tasks");
    const entries = await promises_1.default.readdir(tasksDir);
    const taskFiles = entries.filter((name) => name.endsWith(".txt"));
    if (taskFiles.length === 0) {
        throw new Error("No task files found in .codex/tasks");
    }
    return taskFiles.map((name) => ({
        taskSlug: node_path_1.default.basename(name, ".txt"),
        instructionsPath: node_path_1.default.join(tasksDir, name),
    }));
}
function formatFailure(reason) {
    if (reason instanceof Error) {
        return reason.message;
    }
    return String(reason);
}
async function main() {
    const repoRoot = process.cwd();
    const tasks = await findTaskFiles(repoRoot);
    const taskPromises = tasks.map(async (task) => {
        const taskInstructions = await promises_1.default.readFile(task.instructionsPath, "utf8");
        const result = await (0, runTwoPass_1.runTwoPassOnTask)({
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
            console.log(`✅ ${taskSlug} | branch: ${result.branchName} | worktree: ${result.worktreePath}`);
        }
        else {
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
