#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function listWorktrees(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

async function main() {
  const repoRoot = process.cwd();
  const worktreeRoot = path.join(repoRoot, ".codex", "worktrees");
  const doDelete = process.argv.includes("--yes");

  if (!(await pathExists(worktreeRoot))) {
    console.log(`No worktrees directory found at ${worktreeRoot}`);
    return;
  }

  const slugs = await listWorktrees(worktreeRoot);
  if (slugs.length === 0) {
    console.log("No worktrees to clean.");
    return;
  }

  console.log(`${doDelete ? "Cleaning" : "Would clean"} ${slugs.length} worktree(s):`);
  slugs.forEach((slug) => {
    const branch = `codex/${slug}`;
    const worktreePath = path.join(worktreeRoot, slug);
    console.log(`- ${slug} | branch ${branch} | ${worktreePath}`);
  });

  if (!doDelete) {
    console.log("Dry run. Pass --yes to remove worktrees and branches.");
    return;
  }

  for (const slug of slugs) {
    const branch = `codex/${slug}`;
    const worktreePath = path.join(worktreeRoot, slug);
    try {
      await execFileAsync("git", ["worktree", "remove", "--force", worktreePath], { cwd: repoRoot });
      console.log(`Removed worktree ${worktreePath}`);
    } catch (err) {
      console.warn(`Failed to remove worktree ${worktreePath}: ${String(err.message ?? err)}`);
    }

    try {
      await execFileAsync("git", ["branch", "-D", branch], { cwd: repoRoot });
      console.log(`Deleted branch ${branch}`);
    } catch (err) {
      console.warn(`Failed to delete branch ${branch}: ${String(err.message ?? err)}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
