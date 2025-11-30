export function buildWorkPrompt(taskInstructions) {
    return [
        "You are an autonomous coding agent working in this repository.",
        "Task instructions:",
        "```",
        taskInstructions,
        "```",
        "Work as comprehensively as you reasonably can to complete the task.",
        "You may edit files and run commands.",
        "At the end, explain what you did and what you're unsure about.",
        "Do not write summary/validation files yet.",
    ].join("\n\n");
}
export function buildPlanPrompt() {
    return [
        "Write two files in the repository:",
        "1. codex/work-summary.md: summarize what you did and any open questions.",
        "2. codex/validation-plan.md: numbered checklist a validator can follow.",
        "After writing the files, reply with a brief confirmation (not the full file contents).",
    ].join("\n\n");
}
export function buildValidationPrompt(taskInstructions, validationPlan) {
    return [
        "You are the validator agent. You did not perform the work.",
        "Original task instructions (source of truth):",
        "```",
        taskInstructions,
        "```",
        "First-pass validation plan (guidance only—verify independently):",
        "```",
        validationPlan,
        "```",
        "Validate whether the approach and work done actually accomplish the original instructions. Use the plan for structure but do not trust its claims—inspect files and run commands yourself, refining the plan if needed.",
        "Write your validation report to codex/validation-report.md. Include: a clear ACCEPT/REJECT verdict against the original instructions, numbered issues, and recommended follow-ups.",
        "After writing the file, reply with a brief confirmation (not the full report).",
    ].join("\n\n");
}
export function buildReflectionPrompt(validationReport) {
    return [
        "Validator report:",
        "```",
        validationReport,
        "```",
        "You are the original worker. Briefly react: state whether you agree, what fixes or follow-ups you would prioritize, and any clarifications. Keep it concise.",
    ].join("\n\n");
}
