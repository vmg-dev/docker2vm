import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { CliUsageError } from "../../shared/cli-errors";

export function ensureDirectory(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function removePathIfExists(targetPath: string): void {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

export function fileExists(targetPath: string): boolean {
  return fs.existsSync(targetPath);
}

export function assertFileExists(filePath: string, label: string): void {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new CliUsageError(`${label} not found: ${filePath}`, [
      `Verify that ${label.toLowerCase()} exists and is a regular file.`,
    ]);
  }
}

export function assertDirectoryExists(dirPath: string, label: string): void {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    throw new CliUsageError(`${label} not found: ${dirPath}`, [
      `Verify that ${label.toLowerCase()} exists and is a directory.`,
    ]);
  }
}

export function getCacheRoot(): string {
  const xdgCache = process.env.XDG_CACHE_HOME;
  if (xdgCache && xdgCache.trim().length > 0) {
    return path.resolve(xdgCache, "docker2vm");
  }

  return path.resolve(os.homedir(), ".cache", "docker2vm");
}

export function getBlobCachePath(digest: string): string {
  const [algorithm, hex] = digest.split(":");
  return path.join(getCacheRoot(), "blobs", algorithm, hex);
}

export function resolveInsideRoot(rootDir: string, relativePath: string): string {
  const absolutePath = path.resolve(rootDir, relativePath);
  const normalizedRoot = path.resolve(rootDir);
  if (absolutePath !== normalizedRoot && !absolutePath.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new CliUsageError(`Refusing path outside extraction root: ${relativePath}`, [
      "The archive appears to contain a path traversal entry.",
    ]);
  }
  return absolutePath;
}

export function ensureParentsAreNotSymlinks(rootDir: string, absolutePath: string): void {
  const normalizedRoot = path.resolve(rootDir);
  const normalizedTarget = path.resolve(absolutePath);

  if (normalizedTarget !== normalizedRoot && !normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new CliUsageError(`Refusing path outside extraction root: ${absolutePath}`, [
      "The archive appears to contain a path traversal entry.",
    ]);
  }

  const relative = path.relative(normalizedRoot, normalizedTarget);
  const parts = relative.split(path.sep).filter((segment) => segment.length > 0);

  let current = normalizedRoot;
  for (let i = 0; i < parts.length - 1; i += 1) {
    current = path.join(current, parts[i]);
    if (!fs.existsSync(current)) {
      continue;
    }

    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) {
      throw new CliUsageError(`Refusing to follow symlink parent '${current}'.`, [
        "Layer extraction was blocked to prevent writing outside the rootfs tree.",
      ]);
    }
  }
}

export function atomicWriteFile(targetPath: string, data: Buffer): void {
  const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, data);
  fs.renameSync(tempPath, targetPath);
}

export function listDirectorySafely(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const stat = fs.lstatSync(dirPath);
  if (!stat.isDirectory()) {
    return [];
  }

  return fs.readdirSync(dirPath);
}
