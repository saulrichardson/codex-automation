import fs from "node:fs/promises";
import path from "node:path";
export async function ensureDir(dir) {
    await fs.mkdir(dir, { recursive: true });
}
export async function readIfExists(filePath) {
    try {
        return await fs.readFile(filePath, "utf8");
    }
    catch (err) {
        if (err?.code === "ENOENT")
            return undefined;
        throw err;
    }
}
export async function writeJson(filePath, data) {
    const dir = path.dirname(filePath);
    await ensureDir(dir);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}
