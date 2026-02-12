#!/usr/bin/env bun
import { runOci2Gondolin } from "../commands/oci2gondolin";

async function main(): Promise<void> {
  const exitCode = await runOci2Gondolin(process.argv.slice(2));
  process.exit(exitCode);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
