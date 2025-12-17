const transientPatterns = ["stream disconnected", "ECONNRESET", "ENETDOWN", "ETIMEDOUT"];
export async function runWithRetries(thread, prompt, events = [], maxAttempts = 3) {
    let attempt = 0;
    while (true) {
        attempt += 1;
        try {
            events.length = 0;
            const { events: stream } = await thread.runStreamed(prompt);
            const items = [];
            let finalResponse = "";
            let usage = null;
            for await (const evt of stream) {
                events.push(evt);
                if (evt.type === "item.completed") {
                    items.push(evt.item);
                    if (evt.item.type === "agent_message") {
                        finalResponse = evt.item.text;
                    }
                }
                else if (evt.type === "turn.completed") {
                    usage = evt.usage;
                }
                else if (evt.type === "turn.failed") {
                    throw new Error(evt.error.message);
                }
                else if (evt.type === "error") {
                    throw new Error(evt.message);
                }
            }
            return { items, finalResponse, usage };
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
