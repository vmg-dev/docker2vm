import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { CliUsageError } from "./cli-errors";

export const TESTED_GONDOLIN_VERSION = "0.2.1";

export interface GondolinGuestAssets {
  assetDir: string;
  kernelPath: string;
  initrdPath: string;
  rootfsPath: string;
}

type AssetFileNames = {
  kernel: string;
  initramfs: string;
  rootfs: string;
};

const DEFAULT_FILE_NAMES: AssetFileNames = {
  kernel: "vmlinuz-virt",
  initramfs: "initramfs.cpio.lz4",
  rootfs: "rootfs.ext4",
};

export function resolveGondolinGuestAssets(): GondolinGuestAssets {
  const explicitDir = process.env.GONDOLIN_GUEST_DIR;
  if (explicitDir && explicitDir.trim().length > 0) {
    return loadAssetsFromDirectory(path.resolve(explicitDir), "GONDOLIN_GUEST_DIR");
  }

  for (const candidateDir of discoverCachedGuestAssetDirectories()) {
    const loaded = tryLoadAssetsFromDirectory(candidateDir);
    if (loaded) {
      return loaded;
    }
  }

  throw new CliUsageError("Gondolin guest assets were not found.", [
    "Install gondolin CLI separately (tested with @earendil-works/gondolin@0.2.1).",
    "Run once to populate guest assets: gondolin exec -- /bin/true",
    "Or set GONDOLIN_GUEST_DIR to a directory containing: vmlinuz-virt, initramfs.cpio.lz4, rootfs.ext4.",
    "Expected cache location: ~/.cache/gondolin/<version>/",
  ]);
}

function discoverCachedGuestAssetDirectories(): string[] {
  const cacheBase = process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache");
  const gondolinCacheRoot = path.resolve(cacheBase, "gondolin");

  if (!fs.existsSync(gondolinCacheRoot)) {
    return [];
  }

  const dirs = fs
    .readdirSync(gondolinCacheRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(gondolinCacheRoot, entry.name));

  dirs.sort((a, b) => compareCacheDirectoryPriority(path.basename(a), path.basename(b)));

  return dirs;
}

function compareCacheDirectoryPriority(a: string, b: string): number {
  const parsedA = parseSemverTag(a);
  const parsedB = parseSemverTag(b);

  if (parsedA && parsedB) {
    for (let i = 0; i < parsedA.length; i += 1) {
      if (parsedA[i] !== parsedB[i]) {
        return parsedB[i] - parsedA[i];
      }
    }
    return 0;
  }

  if (parsedA) {
    return -1;
  }

  if (parsedB) {
    return 1;
  }

  return b.localeCompare(a);
}

function parseSemverTag(value: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());
  if (!match) {
    return null;
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function tryLoadAssetsFromDirectory(candidateDir: string): GondolinGuestAssets | null {
  try {
    return loadAssetsFromDirectory(candidateDir, "cache");
  } catch {
    return null;
  }
}

function loadAssetsFromDirectory(assetDir: string, source: "GONDOLIN_GUEST_DIR" | "cache"): GondolinGuestAssets {
  const fileNames = resolveAssetFileNames(assetDir);

  const kernelPath = path.join(assetDir, fileNames.kernel);
  const initrdPath = path.join(assetDir, fileNames.initramfs);
  const rootfsPath = path.join(assetDir, fileNames.rootfs);

  const missing = [
    [fileNames.kernel, kernelPath],
    [fileNames.initramfs, initrdPath],
    [fileNames.rootfs, rootfsPath],
  ]
    .filter(([, filePath]) => !fs.existsSync(filePath))
    .map(([name]) => name);

  if (missing.length > 0) {
    const hint =
      source === "GONDOLIN_GUEST_DIR"
        ? "Verify GONDOLIN_GUEST_DIR points to a valid gondolin guest asset directory."
        : "Run 'gondolin exec -- /bin/true' to download guest assets into the cache.";

    throw new CliUsageError("Gondolin guest assets are incomplete.", [
      `Directory: ${assetDir}`,
      `Missing files: ${missing.join(", ")}`,
      hint,
    ]);
  }

  return {
    assetDir,
    kernelPath,
    initrdPath,
    rootfsPath,
  };
}

function resolveAssetFileNames(assetDir: string): AssetFileNames {
  const manifestPath = path.join(assetDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    return DEFAULT_FILE_NAMES;
  }

  try {
    const raw = fs.readFileSync(manifestPath, "utf8");
    const parsed = JSON.parse(raw) as {
      assets?: {
        kernel?: unknown;
        initramfs?: unknown;
        rootfs?: unknown;
      };
    };

    const kernel = typeof parsed.assets?.kernel === "string" ? parsed.assets.kernel : DEFAULT_FILE_NAMES.kernel;
    const initramfs =
      typeof parsed.assets?.initramfs === "string"
        ? parsed.assets.initramfs
        : DEFAULT_FILE_NAMES.initramfs;
    const rootfs = typeof parsed.assets?.rootfs === "string" ? parsed.assets.rootfs : DEFAULT_FILE_NAMES.rootfs;

    return {
      kernel,
      initramfs,
      rootfs,
    };
  } catch {
    return DEFAULT_FILE_NAMES;
  }
}
