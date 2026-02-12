#!/usr/bin/env bun
import { runDockerfile2Gondolin } from "../commands/dockerfile2gondolin";

async function main(): Promise<void> {
  const exitCode = await runDockerfile2Gondolin(process.argv.slice(2));
  process.exit(exitCode);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
