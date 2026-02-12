import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

import { CliUsageError } from "../../shared/cli-errors";
import { ensureDirectory, ensureParentsAreNotSymlinks, resolveInsideRoot } from "./fs";

export interface TarEntry {
  name: string;
  type: number;
  mode: number;
  size: number;
  linkName: string;
  content: Buffer | null;
}

export function parseTarBuffer(buffer: Buffer): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;

  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);

    if (header.every((byte) => byte === 0)) {
      break;
    }

    const name = readTarString(header, 0, 100);
    const mode = parseInt(readTarString(header, 100, 8), 8) || 0;
    const size = parseInt(readTarString(header, 124, 12), 8) || 0;
    const typeFlag = header[156];
    const linkName = readTarString(header, 157, 100);

    const magic = readTarString(header, 257, 6);
    let fullName = name;
    if (magic === "ustar" || magic === "ustar\0") {
      const prefix = readTarString(header, 345, 155);
      if (prefix) {
        fullName = `${prefix}/${name}`;
      }
    }

    // Ignore PAX headers for now.
    if (typeFlag === 0x78 || typeFlag === 0x67) {
      const blocks = Math.ceil(size / 512);
      offset += 512 + blocks * 512;
      continue;
    }

    const type =
      typeFlag === 0 || typeFlag === 0x30
        ? 0
        : typeFlag === 0x35
          ? 5
          : typeFlag === 0x32
            ? 2
            : typeFlag === 0x31
              ? 1
              : typeFlag;

    offset += 512;

    let content: Buffer | null = null;
    if (size > 0) {
      content = Buffer.from(buffer.subarray(offset, offset + size));
      offset += Math.ceil(size / 512) * 512;
    }

    entries.push({
      name: fullName,
      type,
      mode,
      size,
      linkName,
      content,
    });
  }

  return entries;
}

export function readTarFile(filePath: string): Buffer {
  return fs.readFileSync(filePath);
}

export function readTarOrTarGzFile(filePath: string): Buffer {
  const compressed = fs.readFileSync(filePath);
  if (looksLikeGzip(compressed)) {
    return zlib.gunzipSync(compressed);
  }
  return compressed;
}

export function decompressLayerBuffer(buffer: Buffer, compression: "gzip" | "none"): Buffer {
  if (compression === "none") {
    return buffer;
  }

  if (!looksLikeGzip(buffer)) {
    throw new CliUsageError("Layer is expected to be gzip-compressed, but gzip header was not found.", [
      "Ensure the image uses gzip-compressed layers.",
    ]);
  }

  return zlib.gunzipSync(buffer);
}

export function extractTarToDirectory(entries: TarEntry[], destDir: string): void {
  const root = path.resolve(destDir);
  ensureDirectory(root);

  for (const entry of entries) {
    const relative = sanitizeTarPath(entry.name);
    if (!relative) {
      continue;
    }

    const target = resolveInsideRoot(root, relative);
    ensureParentsAreNotSymlinks(root, target);

    if (entry.type === 5) {
      prepareExtractionTarget(target, true);
      ensureDirectory(target);
      continue;
    }

    if (entry.type === 2) {
      prepareExtractionTarget(target, false);
      ensureDirectory(path.dirname(target));
      fs.symlinkSync(entry.linkName, target);
      continue;
    }

    if (entry.type === 1) {
      const linkRelative = sanitizeTarPath(entry.linkName);
      if (!linkRelative) {
        continue;
      }

      const linkTarget = resolveInsideRoot(root, linkRelative);
      ensureParentsAreNotSymlinks(root, linkTarget);

      if (!fs.existsSync(linkTarget)) {
        continue;
      }

      prepareExtractionTarget(target, false);
      ensureDirectory(path.dirname(target));
      fs.linkSync(linkTarget, target);
      continue;
    }

    if (entry.type === 0 && entry.content) {
      prepareExtractionTarget(target, false);
      ensureDirectory(path.dirname(target));
      fs.writeFileSync(target, entry.content);
      try {
        const mode = entry.mode & 0o7777;
        if (mode !== 0) {
          fs.chmodSync(target, mode);
        }
      } catch {
        // best-effort mode restore
      }
      continue;
    }

    // Ignore unsupported entry types.
  }
}

export function sanitizeTarPath(rawPath: string): string | null {
  if (!rawPath || rawPath === ".") {
    return null;
  }

  const normalizedSlashes = rawPath.replace(/\\/g, "/");
  let stripped = normalizedSlashes.replace(/^\/+/, "");
  while (stripped.startsWith("./")) {
    stripped = stripped.slice(2);
  }

  if (!stripped || stripped === ".") {
    return null;
  }

  const normalized = path.posix.normalize(stripped);
  if (normalized === "." || normalized === "") {
    return null;
  }

  if (normalized.startsWith("../") || normalized === "..") {
    throw new CliUsageError(`Refusing archive entry with path traversal: '${rawPath}'.`, [
      "The archive appears to contain unsafe paths.",
    ]);
  }

  return normalized;
}

function prepareExtractionTarget(target: string, isDirectory: boolean): void {
  if (!fs.existsSync(target)) {
    return;
  }

  const stat = fs.lstatSync(target);
  if (isDirectory && stat.isDirectory()) {
    return;
  }

  if (stat.isDirectory()) {
    fs.rmSync(target, { recursive: true, force: true });
    return;
  }

  fs.unlinkSync(target);
}

function looksLikeGzip(buffer: Buffer): boolean {
  return buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
}

function readTarString(buffer: Buffer, offset: number, length: number): string {
  const slice = buffer.subarray(offset, offset + length);
  const nullIndex = slice.indexOf(0);
  const end = nullIndex === -1 ? length : nullIndex;
  return slice.subarray(0, end).toString("utf8");
}
