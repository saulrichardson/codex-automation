import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import toml from "@iarna/toml";
import { Codex, type ModelReasoningEffort } from "@openai/codex-sdk";

type StartThreadOptions = Parameters<Codex["startThread"]>[0];

async function readCodexConfig(configPath: string): Promise<Record<string, any> | undefined> {
  try {
    const raw = await fs.readFile(configPath, "utf8");
    return toml.parse(raw) as Record<string, any>;
  } catch (err: any) {
    if (err?.code === "ENOENT") return undefined;
    throw new Error(`Failed to read Codex config at ${configPath}: ${String(err?.message ?? err)}`);
  }
}

export interface LoadedConfig {
  threadOptionsBase: StartThreadOptions;
  apiKey: string;
  baseUrl?: string;
}

export async function loadConfig(repoRoot: string): Promise<LoadedConfig> {
  dotenv.config({ path: path.join(repoRoot, ".env") });

  const configPath = process.env.CODEX_CONFIG_PATH ?? path.join(repoRoot, "codex.config.toml");
  const codexConfig = await readCodexConfig(configPath);

  const defaultModel = process.env.CODEX_MODEL ?? (codexConfig?.model as string | undefined);
  if (!defaultModel) {
    throw new Error(
      "CODEX_MODEL is required (set in env or codex.config.toml). No fallback is provided."
    );
  }
  const defaultReasoningEffort =
    (process.env.CODEX_REASONING_EFFORT as ModelReasoningEffort | undefined) ??
    (codexConfig?.model_reasoning_effort as ModelReasoningEffort | undefined) ??
    ("high" as ModelReasoningEffort);

  const threadOptionsBase: StartThreadOptions = {
    model: defaultModel,
    modelReasoningEffort: defaultReasoningEffort,
  };

  if (codexConfig?.sandbox_mode !== undefined) {
    (threadOptionsBase as any).sandboxMode = codexConfig.sandbox_mode;
  }
  if (codexConfig?.approval_policy !== undefined) {
    (threadOptionsBase as any).approvalPolicy = codexConfig.approval_policy;
  }
  if (codexConfig?.sandbox_workspace_write?.network_access !== undefined) {
    (threadOptionsBase as any).networkAccessEnabled = codexConfig.sandbox_workspace_write.network_access;
  }
  if (codexConfig?.features?.web_search_request !== undefined) {
    (threadOptionsBase as any).webSearchEnabled = codexConfig.features.web_search_request;
  }

  const apiKey = process.env.CODEX_API_KEY;
  if (!apiKey) {
    throw new Error(
      "CODEX_API_KEY is required (set in env or .env). This workflow does not fall back to `codex login` credentials."
    );
  }

  const baseUrl = process.env.CODEX_BASE_URL ?? process.env.OPENAI_BASE_URL;

  return { threadOptionsBase, apiKey, baseUrl };
}

export function threadOptionsForCwd(base: StartThreadOptions, cwd: string): StartThreadOptions {
  return { ...base, workingDirectory: cwd };
}
