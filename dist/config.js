import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import toml from "@iarna/toml";
async function readCodexConfig(configPath) {
    try {
        const raw = await fs.readFile(configPath, "utf8");
        return toml.parse(raw);
    }
    catch (err) {
        if (err?.code === "ENOENT")
            return undefined;
        throw new Error(`Failed to read Codex config at ${configPath}: ${String(err?.message ?? err)}`);
    }
}
export async function loadConfig(repoRoot) {
    dotenv.config({ path: path.join(repoRoot, ".env") });
    const configPath = process.env.CODEX_CONFIG_PATH ?? path.join(repoRoot, "codex.config.toml");
    const codexConfig = await readCodexConfig(configPath);
    const defaultModel = process.env.CODEX_MODEL ?? codexConfig?.model;
    if (!defaultModel) {
        throw new Error("CODEX_MODEL is required (set in env or codex.config.toml). No fallback is provided.");
    }
    const defaultReasoningEffort = process.env.CODEX_REASONING_EFFORT ??
        codexConfig?.model_reasoning_effort ??
        "high";
    const threadOptionsBase = {
        model: defaultModel,
        modelReasoningEffort: defaultReasoningEffort,
    };
    if (codexConfig?.sandbox_mode !== undefined) {
        threadOptionsBase.sandboxMode = codexConfig.sandbox_mode;
    }
    if (codexConfig?.approval_policy !== undefined) {
        threadOptionsBase.approvalPolicy = codexConfig.approval_policy;
    }
    if (codexConfig?.sandbox_workspace_write?.network_access !== undefined) {
        threadOptionsBase.networkAccessEnabled = codexConfig.sandbox_workspace_write.network_access;
    }
    if (codexConfig?.features?.web_search_request !== undefined) {
        threadOptionsBase.webSearchEnabled = codexConfig.features.web_search_request;
    }
    const apiKey = process.env.CODEX_API_KEY;
    if (!apiKey) {
        throw new Error("CODEX_API_KEY is required (set in env or .env)");
    }
    const baseURL = process.env.CODEX_BASE_URL ?? process.env.OPENAI_BASE_URL;
    return { codexConfig, threadOptionsBase, apiKey, baseURL };
}
export function threadOptionsForCwd(base, cwd) {
    return { ...base, workingDirectory: cwd };
}
