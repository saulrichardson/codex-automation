type LogLevel = "info" | "warn" | "error";

function format(level: LogLevel, context: string, message: string): string {
  return `[${context}] ${level.toUpperCase()} ${message}`;
}

export function createLogger(context: string) {
  return {
    info: (msg: string) => console.log(format("info", context, msg)),
    warn: (msg: string) => console.warn(format("warn", context, msg)),
    error: (msg: string) => console.error(format("error", context, msg)),
  };
}
