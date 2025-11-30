import { Codex } from "@openai/codex-sdk";

const transientPatterns = ["stream disconnected", "ECONNRESET", "ENETDOWN", "ETIMEDOUT"];

type Thread = ReturnType<Codex["startThread"]>;

export async function runWithRetries(
  thread: Thread,
  prompt: string,
  events: any[] = [],
  maxAttempts = 3
) {
  let attempt = 0;
  while (true) {
    attempt += 1;
    try {
      const result = await (thread as any).run(prompt, {
        onEvent: (evt: any) => {
          events.push(evt);
        },
      });
      return result;
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      const transient = transientPatterns.some((p) => msg.includes(p));
      if (!transient || attempt >= maxAttempts) {
        throw err;
      }
      const backoffMs = 500 * attempt;
      await new Promise((r) => setTimeout(r, backoffMs));
      events.length = 0;
    }
  }
}
