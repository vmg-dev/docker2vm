import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { CliUsageError } from "../../shared/cli-errors";

const MKE2FS_CANDIDATES = [
  "mke2fs",
  "mkfs.ext4",
  "/opt/homebrew/opt/e2fsprogs/sbin/mke2fs",
  "/opt/homebrew/opt/e2fsprogs/bin/mke2fs",
  "/opt/homebrew/opt/e2fsprogs/sbin/mkfs.ext4",
  "/opt/homebrew/opt/e2fsprogs/bin/mkfs.ext4",
  "/usr/local/opt/e2fsprogs/sbin/mke2fs",
  "/usr/local/opt/e2fsprogs/bin/mke2fs",
  "/usr/local/opt/e2fsprogs/sbin/mkfs.ext4",
  "/usr/local/opt/e2fsprogs/bin/mkfs.ext4",
];

export function createExt4FromDirectory(
  rootfsDir: string,
  outPath: string,
  label: string,
  fixedSizeMb?: number,
): void {
  const mkfsCmd = findMke2fsCommand();
  const sizeMb = fixedSizeMb ?? estimateRootfsSizeMb(rootfsDir);

  ensureTreeReadableForCurrentUser(rootfsDir);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.rmSync(outPath, { force: true });

  const args = [
    "-t",
    "ext4",
    "-d",
    rootfsDir,
    "-L",
    label,
    "-m",
    "0",
    "-F",
    outPath,
    `${sizeMb}M`,
  ];

  const result = spawnSync(mkfsCmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    throw new CliUsageError("Failed to create rootfs.ext4 image.", [
      `Command: ${mkfsCmd} ${args.join(" ")}`,
      result.stderr?.trim() || result.stdout?.trim() || "Unknown mke2fs failure.",
    ]);
  }
}

export function findMke2fsCommand(): string {
  for (const candidate of MKE2FS_CANDIDATES) {
    const result = spawnSync(candidate, ["-V"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (result.status === 0 || result.status === 1) {
      // mke2fs -V can return non-zero depending on build, so accept both 0 and 1.
      return candidate;
    }
  }

  throw new CliUsageError("Required command 'mke2fs' was not found.", [
    "Install e2fsprogs.",
    "macOS: brew install e2fsprogs",
    "Linux: sudo apt install e2fsprogs",
    "If installed but not on PATH, expose mke2fs from your e2fsprogs installation.",
  ]);
}

function ensureTreeReadableForCurrentUser(rootfsDir: string): void {
  try {
    const stat = fs.lstatSync(rootfsDir);
    if (stat.isDirectory()) {
      const mode = stat.mode & 0o7777;
      const readableMode = mode | 0o500;
      if (mode !== readableMode) {
        fs.chmodSync(rootfsDir, readableMode);
      }
    }
  } catch {
    // best effort
  }

  walkDirectory(rootfsDir, (entryPath, stats) => {
    const mode = stats.mode & 0o7777;

    let readableMode = mode;
    if (stats.isDirectory()) {
      readableMode = mode | 0o500;
    } else if (stats.isFile()) {
      readableMode = mode | 0o400;
    }

    if (mode === readableMode) {
      return;
    }

    try {
      fs.chmodSync(entryPath, readableMode);
    } catch {
      // best effort
    }
  });
}

function estimateRootfsSizeMb(rootfsDir: string): number {
  let totalBytes = 0;

  walkDirectory(rootfsDir, (filePath, stats) => {
    if (stats.isFile()) {
      totalBytes += stats.size;
    } else if (stats.isDirectory()) {
      totalBytes += 4096;
    } else if (stats.isSymbolicLink()) {
      totalBytes += 256;
    }
  });

  const bytesWithOverhead = Math.ceil(totalBytes * 1.35) + 32 * 1024 * 1024;
  const sizeMb = Math.ceil(bytesWithOverhead / (1024 * 1024));

  return Math.max(sizeMb, 96);
}

function walkDirectory(
  dirPath: string,
  visit: (entryPath: string, stats: fs.Stats) => void,
): void {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    const stats = fs.lstatSync(entryPath);
    visit(entryPath, stats);

    if (entry.isDirectory()) {
      walkDirectory(entryPath, visit);
    }
  }
}
