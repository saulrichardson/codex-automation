function format(level, context, message) {
    return `[${context}] ${level.toUpperCase()} ${message}`;
}
export function createLogger(context) {
    return {
        info: (msg) => console.log(format("info", context, msg)),
        warn: (msg) => console.warn(format("warn", context, msg)),
        error: (msg) => console.error(format("error", context, msg)),
    };
}
