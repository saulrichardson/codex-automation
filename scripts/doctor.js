#!/usr/bin/env node
const { execSync } = require('node:child_process');
const semver = require('semver');

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exitCode = 1;
}

function checkNode() {
  const version = process.version; // vXX
  if (!semver.satisfies(version, '>=18.0.0')) {
    fail(`Node ${version} found, need >=18`);
  } else {
    console.log(`✅ Node ${version}`);
  }
}

function checkGitRepo() {
  try {
    const out = execSync('git rev-parse --is-inside-work-tree', { stdio: 'pipe' }).toString().trim();
    if (out !== 'true') throw new Error('not in git repo');
    console.log('✅ Git repository detected');
  } catch (err) {
    fail('Not inside a git repository');
  }
}

function checkEnv() {
  if (!process.env.CODEX_API_KEY) {
    fail('CODEX_API_KEY not set');
  } else {
    console.log('✅ CODEX_API_KEY present');
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
