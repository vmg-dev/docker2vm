import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function createTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function cleanupPaths(paths: string[]): void {
  for (const targetPath of paths) {
    try {
      fs.rmSync(targetPath, { recursive: true, force: true });
    } catch {
      // ignore cleanup failures
    }
  }
}
