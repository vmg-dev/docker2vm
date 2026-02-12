import fs from "node:fs";
import path from "node:path";

import { CliUsageError } from "../../shared/cli-errors";
import { isGzipLayerMediaType, isUncompressedLayerMediaType } from "../oci-media-types";
import { extractBaseRootfsTree } from "../materialize/runtime-injection";
import type { AppliedRootfs, PulledImage, RuntimeMetadata } from "../types";
import {
  ensureDirectory,
  ensureParentsAreNotSymlinks,
  listDirectorySafely,
  resolveInsideRoot,
} from "../utils/fs";
import { createTempDir } from "../utils/temp";
import {
  decompressLayerBuffer,
  parseTarBuffer,
  readTarFile,
  sanitizeTarPath,
  type TarEntry,
} from "../utils/tar";

export async function applyLayers(pulled: PulledImage): Promise<AppliedRootfs> {
  const workDir = createTempDir("oci2gondolin-rootfs-");
  const rootfsDir = path.join(workDir, "rootfs");
  ensureDirectory(rootfsDir);

  await extractBaseRootfsTree(rootfsDir);

  for (const layer of pulled.layers) {
    applyLayer(rootfsDir, layer.blobPath, layer.descriptor.mediaType);
  }

  return {
    descriptor: pulled.descriptor,
    config: pulled.config,
    runtimeMetadata: extractRuntimeMetadata(pulled.config),
    rootfsDir,
    tempPaths: [...pulled.tempPaths, workDir],
  };
}

function applyLayer(rootfsDir: string, layerBlobPath: string, mediaType: string): void {
  const compressedLayer = readTarFile(layerBlobPath);

  let compression: "gzip" | "none";
  if (isGzipLayerMediaType(mediaType)) {
    compression = "gzip";
  } else if (isUncompressedLayerMediaType(mediaType)) {
    compression = "none";
  } else {
    throw new CliUsageError(`Unsupported layer media type '${mediaType}'.`, [
      "Supported layer media types are tar and tar+gzip.",
    ]);
  }

  const tarBuffer = decompressLayerBuffer(compressedLayer, compression);
  const entries = parseTarBuffer(tarBuffer);
  const temporaryPermissionJournal = new Map<string, number>();

  try {
    for (const entry of entries) {
      applyTarEntry(rootfsDir, entry, temporaryPermissionJournal);
    }
  } finally {
    restoreTemporaryDirectoryPermissions(temporaryPermissionJournal);
  }
}

function applyTarEntry(
  rootfsDir: string,
  entry: TarEntry,
  temporaryPermissionJournal: Map<string, number>,
): void {
  const relativePath = sanitizeTarPath(entry.name);
  if (!relativePath) {
    return;
  }

  const posixPath = relativePath.replace(/\\/g, "/");
  const basename = path.posix.basename(posixPath);
  const dirname = path.posix.dirname(posixPath);

  if (basename.startsWith(".wh.")) {
    applyWhiteout(rootfsDir, dirname, basename, temporaryPermissionJournal);
    return;
  }

  const targetPath = resolveInsideRoot(rootfsDir, posixPath);
  ensureParentsAreNotSymlinks(rootfsDir, targetPath);

  const parentDir = path.dirname(targetPath);
  ensureWritableDirectoryAndResolvedTarget(rootfsDir, parentDir, temporaryPermissionJournal);

  if (entry.type === 5) {
    prepareTarget(rootfsDir, targetPath, true, temporaryPermissionJournal);
    ensureDirectory(targetPath);
    applyModeIfPresent(targetPath, entry.mode);
    return;
  }

  if (entry.type === 2) {
    removePathForLayer(rootfsDir, targetPath, temporaryPermissionJournal);
    ensureDirectory(parentDir);
    fs.symlinkSync(entry.linkName, targetPath);
    return;
  }

  if (entry.type === 1) {
    const linkRelative = sanitizeTarPath(entry.linkName);
    if (!linkRelative) {
      return;
    }

    const linkTargetPath = resolveInsideRoot(rootfsDir, linkRelative);
    ensureParentsAreNotSymlinks(rootfsDir, linkTargetPath);

    if (!fs.existsSync(linkTargetPath)) {
      return;
    }

    removePathForLayer(rootfsDir, targetPath, temporaryPermissionJournal);
    ensureDirectory(parentDir);
    try {
      fs.linkSync(linkTargetPath, targetPath);
    } catch {
      fs.copyFileSync(linkTargetPath, targetPath);
    }
    return;
  }

  if (entry.type === 0) {
    removePathForLayer(rootfsDir, targetPath, temporaryPermissionJournal);
    ensureDirectory(parentDir);
    fs.writeFileSync(targetPath, entry.content ?? Buffer.alloc(0));
    applyModeIfPresent(targetPath, entry.mode);
  }
}

function applyWhiteout(
  rootfsDir: string,
  dirname: string,
  basename: string,
  temporaryPermissionJournal: Map<string, number>,
): void {
  const parentRelative = dirname === "." ? "" : dirname;
  const parentPath = resolveInsideRoot(rootfsDir, parentRelative);
  ensureParentsAreNotSymlinks(rootfsDir, parentPath);
  ensureWritableDirectoryAndResolvedTarget(rootfsDir, parentPath, temporaryPermissionJournal);

  if (basename === ".wh..wh..opq") {
    const entries = listDirectorySafely(parentPath);
    for (const child of entries) {
      const childPath = path.join(parentPath, child);
      removePathForLayer(rootfsDir, childPath, temporaryPermissionJournal);
    }
    return;
  }

  const targetName = basename.slice(4);
  if (!targetName) {
    return;
  }

  const targetRelative = parentRelative
    ? path.posix.join(parentRelative, targetName)
    : targetName;

  const targetPath = resolveInsideRoot(rootfsDir, targetRelative);
  ensureParentsAreNotSymlinks(rootfsDir, targetPath);
  removePathForLayer(rootfsDir, targetPath, temporaryPermissionJournal);
}

function prepareTarget(
  rootfsDir: string,
  targetPath: string,
  isDirectory: boolean,
  temporaryPermissionJournal: Map<string, number>,
): void {
  if (!pathExists(targetPath)) {
    return;
  }

  const stat = fs.lstatSync(targetPath);
  if (isDirectory && stat.isDirectory()) {
    return;
  }

  removePathForLayer(rootfsDir, targetPath, temporaryPermissionJournal);
}

function pathExists(targetPath: string): boolean {
  try {
    fs.lstatSync(targetPath);
    return true;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function removePathForLayer(
  rootfsDir: string,
  targetPath: string,
  temporaryPermissionJournal: Map<string, number>,
): void {
  if (!pathExists(targetPath)) {
    return;
  }

  ensureWritableDirectoryAndResolvedTarget(
    rootfsDir,
    path.dirname(targetPath),
    temporaryPermissionJournal,
  );

  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== "EACCES" && err.code !== "EPERM") {
      throw error;
    }

    ensureWritableTree(targetPath, temporaryPermissionJournal);
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
}

function ensureWritableDirectoryAndResolvedTarget(
  rootfsDir: string,
  directoryPath: string,
  temporaryPermissionJournal: Map<string, number>,
): void {
  ensureWritableDirectoryChain(rootfsDir, directoryPath, temporaryPermissionJournal);

  if (!pathExists(directoryPath)) {
    return;
  }

  try {
    const resolvedDirectory = fs.realpathSync.native(directoryPath);
    ensureWritableDirectoryChain(rootfsDir, resolvedDirectory, temporaryPermissionJournal);
  } catch {
    // best effort
  }
}

function ensureWritableDirectoryChain(
  rootfsDir: string,
  directoryPath: string,
  temporaryPermissionJournal: Map<string, number>,
): void {
  const rootAliasPath = path.resolve(rootfsDir);
  let normalizedRoot = rootAliasPath;

  try {
    normalizedRoot = path.resolve(fs.realpathSync.native(rootfsDir));
  } catch {
    // best effort
  }

  let normalizedDirectory = path.resolve(directoryPath);

  if (
    normalizedDirectory !== normalizedRoot &&
    !normalizedDirectory.startsWith(`${normalizedRoot}${path.sep}`)
  ) {
    if (
      normalizedRoot !== rootAliasPath &&
      (normalizedDirectory === rootAliasPath ||
        normalizedDirectory.startsWith(`${rootAliasPath}${path.sep}`))
    ) {
      normalizedDirectory = path.join(
        normalizedRoot,
        path.relative(rootAliasPath, normalizedDirectory),
      );
    } else {
      return;
    }
  }

  makeDirectoryOwnerWritable(normalizedRoot, temporaryPermissionJournal);

  const relative = path.relative(normalizedRoot, normalizedDirectory);
  if (!relative || relative === ".") {
    return;
  }

  let current = normalizedRoot;
  for (const segment of relative.split(path.sep).filter((item) => item.length > 0)) {
    current = path.join(current, segment);
    makeDirectoryOwnerWritable(current, temporaryPermissionJournal);
  }
}

function ensureWritableTree(targetPath: string, temporaryPermissionJournal: Map<string, number>): void {
  if (!fs.existsSync(targetPath)) {
    return;
  }

  const stat = fs.lstatSync(targetPath);
  if (stat.isDirectory()) {
    makeDirectoryOwnerWritable(targetPath, temporaryPermissionJournal);

    const children = fs.readdirSync(targetPath);
    for (const child of children) {
      ensureWritableTree(path.join(targetPath, child), temporaryPermissionJournal);
    }
  }
}

function makeDirectoryOwnerWritable(
  directoryPath: string,
  temporaryPermissionJournal: Map<string, number>,
): void {
  if (!fs.existsSync(directoryPath)) {
    return;
  }

  const stat = fs.lstatSync(directoryPath);
  if (!stat.isDirectory()) {
    return;
  }

  const currentMode = stat.mode & 0o7777;
  const writableMode = currentMode | 0o700;

  if (currentMode === writableMode) {
    return;
  }

  if (!temporaryPermissionJournal.has(directoryPath)) {
    temporaryPermissionJournal.set(directoryPath, currentMode);
  }

  try {
    fs.chmodSync(directoryPath, writableMode);
  } catch {
    // best effort; if chmod fails we'll surface the original filesystem error later
  }
}

function restoreTemporaryDirectoryPermissions(temporaryPermissionJournal: Map<string, number>): void {
  const entries = Array.from(temporaryPermissionJournal.entries()).sort(
    ([pathA], [pathB]) => pathB.length - pathA.length,
  );

  for (const [directoryPath, originalMode] of entries) {
    if (!fs.existsSync(directoryPath)) {
      continue;
    }

    const stat = fs.lstatSync(directoryPath);
    if (!stat.isDirectory()) {
      continue;
    }

    try {
      fs.chmodSync(directoryPath, originalMode);
    } catch {
      // best effort
    }
  }
}

function applyModeIfPresent(targetPath: string, mode: number): void {
  const normalizedMode = mode & 0o7777;
  if (normalizedMode === 0) {
    return;
  }

  try {
    fs.chmodSync(targetPath, normalizedMode);
  } catch {
    // best-effort on systems with restricted chmod behavior
  }
}

function extractRuntimeMetadata(config: PulledImage["config"]): RuntimeMetadata {
  const runtimeConfig = config.config ?? {};

  return {
    entrypoint: Array.isArray(runtimeConfig.Entrypoint) ? runtimeConfig.Entrypoint : [],
    cmd: Array.isArray(runtimeConfig.Cmd) ? runtimeConfig.Cmd : [],
    env: Array.isArray(runtimeConfig.Env) ? runtimeConfig.Env : [],
    workdir: typeof runtimeConfig.WorkingDir === "string" ? runtimeConfig.WorkingDir : "",
    user: typeof runtimeConfig.User === "string" ? runtimeConfig.User : "",
  };
}

export const __test = {
  extractRuntimeMetadata,
  applyWhiteout,
  prepareTarget,
};
