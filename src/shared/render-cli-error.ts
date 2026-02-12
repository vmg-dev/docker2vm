import { CliUsageError } from "./cli-errors";

export function renderCliError(error: unknown): string {
  if (error instanceof CliUsageError) {
    const lines = [`Error: ${error.message}`];
    if (error.hints.length > 0) {
      lines.push("", "How to fix:");
      for (const hint of error.hints) {
        lines.push(`  - ${hint}`);
      }
    }
    return lines.join("\n");
  }

  if (error instanceof Error) {
    return `Error: ${error.message}`;
  }

  return `Error: ${String(error)}`;
}
