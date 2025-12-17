#!/usr/bin/env node
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import semver from "semver";
import toml from "@iarna/toml";

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exitCode = 1;
}

function checkNode() {
  const version = process.version; // vXX
  if (!semver.satisfies(version, ">=18.0.0")) {
    fail(`Node ${version} found, need >=18`);
  } else {
    console.log(`✅ Node ${version}`);
  }
}

function checkGitRepo() {
  try {
    const out = execSync("git rev-parse --is-inside-work-tree", { stdio: "pipe" }).toString().trim();
    if (out !== "true") throw new Error("not in git repo");
    console.log("✅ Git repository detected");
  } catch (err) {
    fail("Not inside a git repository");
  }
}

function checkEnv() {
  if (process.env.CODEX_API_KEY) {
    console.log("✅ CODEX_API_KEY present");
  } else {
    fail("CODEX_API_KEY not set (this workflow does not fall back to `codex login`)");
  }

  if (process.env.CODEX_MODEL) {
    console.log(`✅ CODEX_MODEL=${process.env.CODEX_MODEL}`);
  } else {
    const configPath = process.env.CODEX_CONFIG_PATH || path.join(process.cwd(), "codex.config.toml");
    try {
      const raw = fs.readFileSync(configPath, "utf8");
      const cfg = toml.parse(raw);
      if (cfg && typeof cfg.model === "string" && cfg.model.trim().length > 0) {
        console.log(`✅ model found in ${path.basename(configPath)} (${cfg.model})`);
      } else {
        fail("CODEX_MODEL not set and no model found in codex.config.toml");
      }
    } catch (err) {
      fail("CODEX_MODEL not set and codex.config.toml missing/unreadable");
    }
  }
  if (process.env.OPENAI_BASE_URL) {
    console.log(`ℹ️ OPENAI_BASE_URL=${process.env.OPENAI_BASE_URL}`);
  }
}

function main() {
  checkNode();
  checkGitRepo();
  checkEnv();
}

main();
