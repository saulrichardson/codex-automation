const transientPatterns = ["stream disconnected", "ECONNRESET", "ENETDOWN", "ETIMEDOUT"];
export async function runWithRetries(thread, prompt, events = [], maxAttempts = 3) {
    let attempt = 0;
    while (true) {
        attempt += 1;
        try {
            const result = await thread.run(prompt, {
                onEvent: (evt) => {
                    events.push(evt);
                },
            });
            return result;
        }
        catch (err) {
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
