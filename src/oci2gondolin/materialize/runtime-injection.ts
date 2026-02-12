import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { CliUsageError } from "../../shared/cli-errors";
import { resolveGondolinGuestAssets } from "../../shared/gondolin-assets";

type RuntimeFileSpec = {
  sourcePathInRootfs: string;
  targetRelativePath: string;
  mode: number;
};

type RuntimeDirectorySpec = {
  sourcePathInRootfs: string;
  targetRelativePath: string;
};

const REQUIRED_RUNTIME_FILES: RuntimeFileSpec[] = [
  {
    sourcePathInRootfs: "/init",
    targetRelativePath: "init",
    mode: 0o755,
  },
  {
    sourcePathInRootfs: "/bin/kmod",
    targetRelativePath: "bin/kmod",
    mode: 0o755,
  },
  {
    sourcePathInRootfs: "/usr/lib/libcrypto.so.3",
    targetRelativePath: "usr/lib/libcrypto.so.3",
    mode: 0o644,
  },
  {
    sourcePathInRootfs: "/usr/lib/liblzma.so.5.8.2",
    targetRelativePath: "usr/lib/liblzma.so.5.8.2",
    mode: 0o644,
  },
  {
    sourcePathInRootfs: "/usr/lib/libz.so.1.3.1",
    targetRelativePath: "usr/lib/libz.so.1.3.1",
    mode: 0o644,
  },
  {
    sourcePathInRootfs: "/usr/lib/libzstd.so.1.5.7",
    targetRelativePath: "usr/lib/libzstd.so.1.5.7",
    mode: 0o644,
  },
  {
    sourcePathInRootfs: "/usr/bin/sandboxd",
    targetRelativePath: "usr/bin/sandboxd",
    mode: 0o755,
  },
  {
    sourcePathInRootfs: "/usr/bin/sandboxfs",
    targetRelativePath: "usr/bin/sandboxfs",
    mode: 0o755,
  },
  {
    sourcePathInRootfs: "/usr/bin/sandboxssh",
    targetRelativePath: "usr/bin/sandboxssh",
    mode: 0o755,
  },
];

const LOADER_CANDIDATE_PATHS = ["/lib/ld-musl-aarch64.so.1", "/lib/ld-musl-x86_64.so.1"];

const REQUIRED_RUNTIME_DIRECTORIES: RuntimeDirectorySpec[] = [
  {
    sourcePathInRootfs: "/lib/modules",
    targetRelativePath: "lib/modules",
  },
];

const DEBUGFS_CANDIDATES = [
  "debugfs",
  "/opt/homebrew/opt/e2fsprogs/sbin/debugfs",
  "/opt/homebrew/opt/e2fsprogs/bin/debugfs",
  "/usr/local/opt/e2fsprogs/sbin/debugfs",
  "/usr/local/opt/e2fsprogs/bin/debugfs",
];

export interface RuntimeInjectionResult {
  baseRootfsPath: string;
  injectedFiles: string[];
  injectedDirectories: string[];
}

export async function extractBaseRootfsTree(destinationDir: string): Promise<string> {
  const guestAssets = await resolveGondolinGuestAssets();
  const baseRootfsPath = guestAssets.rootfsPath;

  if (!fs.existsSync(baseRootfsPath)) {
    throw new CliUsageError("Gondolin base rootfs.ext4 was not found.", [
      `Expected path: ${baseRootfsPath}`,
      "Guest assets should be downloaded automatically via @earendil-works/gondolin; verify network access and retry.",
    ]);
  }

  const debugfsCmd = findDebugfsCommand();
  fs.mkdirSync(destinationDir, { recursive: true });

  const result = spawnSync(debugfsCmd, ["-R", `rdump / ${destinationDir}`, baseRootfsPath], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    throw new CliUsageError("Failed to extract base Gondolin rootfs tree.", [
      `Command: ${debugfsCmd} -R \"rdump / ${destinationDir}\" ${baseRootfsPath}`,
      result.stderr?.trim() || result.stdout?.trim() || "Unknown debugfs failure.",
      "Ensure e2fsprogs is installed and gondolin guest assets are intact.",
    ]);
  }

  return baseRootfsPath;
}

export async function injectGondolinRuntime(rootfsDir: string): Promise<RuntimeInjectionResult> {
  const guestAssets = await resolveGondolinGuestAssets();
  const baseRootfsPath = guestAssets.rootfsPath;

  if (!fs.existsSync(baseRootfsPath)) {
    throw new CliUsageError("Gondolin base rootfs.ext4 was not found.", [
      `Expected path: ${baseRootfsPath}`,
      "Guest assets should be downloaded automatically via @earendil-works/gondolin; verify network access and retry.",
    ]);
  }

  const debugfsCmd = findDebugfsCommand();
  const injectedFiles: string[] = [];
  const injectedDirectories: string[] = [];

  const loaderSourcePath = resolveExistingPathInExt4(
    debugfsCmd,
    baseRootfsPath,
    LOADER_CANDIDATE_PATHS,
    "musl dynamic loader",
  );
  const loaderFileName = path.posix.basename(loaderSourcePath);

  const runtimeFiles: RuntimeFileSpec[] = [
    ...REQUIRED_RUNTIME_FILES,
    {
      sourcePathInRootfs: loaderSourcePath,
      targetRelativePath: `lib/${loaderFileName}`,
      mode: 0o755,
    },
  ];

  for (const runtimeDirectory of REQUIRED_RUNTIME_DIRECTORIES) {
    const finalPath = path.join(rootfsDir, runtimeDirectory.targetRelativePath);
    dumpDirectoryFromExt4(
      debugfsCmd,
      baseRootfsPath,
      runtimeDirectory.sourcePathInRootfs,
      finalPath,
      rootfsDir,
    );
    injectedDirectories.push(finalPath);
  }

  for (const runtimeFile of runtimeFiles) {
    const finalPath = path.join(rootfsDir, runtimeFile.targetRelativePath);
    ensureParentDirectory(rootfsDir, path.dirname(finalPath));

    dumpFileFromExt4(debugfsCmd, baseRootfsPath, runtimeFile.sourcePathInRootfs, finalPath, rootfsDir);

    try {
      fs.chmodSync(finalPath, runtimeFile.mode);
    } catch {
      // best effort
    }

    injectedFiles.push(finalPath);
  }

  ensureRuntimeDirectory(rootfsDir, "etc/ssl/certs");

  ensureSymlink(rootfsDir, "sbin/modprobe", "../bin/kmod");
  ensureSymlink(rootfsDir, "sbin/insmod", "../bin/kmod");

  const muslLibcSymlinkName = deriveMuslLibcSymlinkName(loaderFileName);
  if (muslLibcSymlinkName) {
    ensureSymlink(rootfsDir, `lib/${muslLibcSymlinkName}`, loaderFileName);
  }

  ensureSymlink(rootfsDir, "usr/lib/liblzma.so.5", "liblzma.so.5.8.2");
  ensureSymlink(rootfsDir, "usr/lib/libz.so.1", "libz.so.1.3.1");
  ensureSymlink(rootfsDir, "usr/lib/libzstd.so.1", "libzstd.so.1.5.7");

  return {
    baseRootfsPath,
    injectedFiles,
    injectedDirectories,
  };
}

function resolveExistingPathInExt4(
  debugfsCmd: string,
  ext4Path: string,
  candidates: string[],
  label: string,
): string {
  for (const candidate of candidates) {
    if (pathExistsInExt4(debugfsCmd, ext4Path, candidate)) {
      return candidate;
    }
  }

  throw new CliUsageError(`Failed to locate required ${label} in base rootfs.`, [
    `Searched paths: ${candidates.join(", ")}`,
    `Base rootfs: ${ext4Path}`,
    "Ensure gondolin guest assets are complete for your host architecture.",
  ]);
}

function pathExistsInExt4(debugfsCmd: string, ext4Path: string, sourcePath: string): boolean {
  const result = spawnSync(debugfsCmd, ["-R", `stat ${sourcePath}`, ext4Path], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    return false;
  }

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  return !/file not found by ext2_lookup/i.test(output);
}

function deriveMuslLibcSymlinkName(loaderFileName: string): string | undefined {
  const match = /^ld-musl-(.+)\.so\.1$/.exec(loaderFileName);
  if (!match) {
    return undefined;
  }

  return `libc.musl-${match[1]}.so.1`;
}

function dumpDirectoryFromExt4(
  debugfsCmd: string,
  ext4Path: string,
  sourcePath: string,
  destinationPath: string,
  rootfsDir: string,
): void {
  const destinationParent = path.dirname(destinationPath);

  removePathForInjection(rootfsDir, destinationPath);
  ensureParentDirectory(rootfsDir, destinationParent);

  const debugfsDestinationParent = resolvePathForExtraction(rootfsDir, destinationParent);

  const result = spawnSync(
    debugfsCmd,
    ["-R", `rdump ${sourcePath} ${debugfsDestinationParent}`, ext4Path],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  if (result.status !== 0 || !pathExists(destinationPath)) {
    throw new CliUsageError(`Failed to extract runtime directory '${sourcePath}' from base rootfs.`, [
      `Command: ${debugfsCmd} -R \"rdump ${sourcePath} ${debugfsDestinationParent}\" ${ext4Path}`,
      result.stderr?.trim() || result.stdout?.trim() || "Unknown debugfs failure.",
      "Ensure e2fsprogs is installed and gondolin guest assets are intact.",
    ]);
  }
}

function dumpFileFromExt4(
  debugfsCmd: string,
  ext4Path: string,
  sourcePath: string,
  destinationPath: string,
  rootfsDir: string,
): void {
  removePathForInjection(rootfsDir, destinationPath);

  const destinationParent = path.dirname(destinationPath);
  ensureParentDirectory(rootfsDir, destinationParent);

  const debugfsDestinationParent = resolvePathForExtraction(rootfsDir, destinationParent);
  const debugfsDestinationPath = path.join(debugfsDestinationParent, path.basename(destinationPath));

  const result = spawnSync(
    debugfsCmd,
    ["-R", `dump -p ${sourcePath} ${debugfsDestinationPath}`, ext4Path],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  if (result.status !== 0 || !pathExists(destinationPath)) {
    throw new CliUsageError(`Failed to extract runtime file '${sourcePath}' from base rootfs.`, [
      `Command: ${debugfsCmd} -R \"dump -p ${sourcePath} ${debugfsDestinationPath}\" ${ext4Path}`,
      result.stderr?.trim() || result.stdout?.trim() || "Unknown debugfs failure.",
      "Ensure e2fsprogs is installed and gondolin guest assets are intact.",
    ]);
  }
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

function removePathForInjection(rootfsDir: string, targetPath: string): void {
  if (!pathExists(targetPath)) {
    return;
  }

  ensureWritableDirectoryAndResolvedTarget(rootfsDir, path.dirname(targetPath));

  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== "EACCES" && err.code !== "EPERM") {
      throw error;
    }

    ensureWritableTree(targetPath);
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
}

function ensureWritableTree(targetPath: string): void {
  if (!pathExists(targetPath)) {
    return;
  }

  const stat = fs.lstatSync(targetPath);
  if (!stat.isDirectory()) {
    return;
  }

  makeDirectoryOwnerWritable(targetPath);

  for (const child of fs.readdirSync(targetPath)) {
    ensureWritableTree(path.join(targetPath, child));
  }
}

function makeDirectoryOwnerWritable(directoryPath: string): void {
  if (!pathExists(directoryPath)) {
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

  try {
    fs.chmodSync(directoryPath, writableMode);
  } catch {
    // best effort
  }
}

function ensureWritableDirectoryAndResolvedTarget(rootfsDir: string, directoryPath: string): void {
  ensureWritableDirectoryChain(rootfsDir, directoryPath);

  if (!pathExists(directoryPath)) {
    return;
  }

  try {
    const resolved = fs.realpathSync.native(directoryPath);
    ensureWritableDirectoryChain(rootfsDir, resolved);
  } catch {
    // best effort
  }
}

function ensureWritableDirectoryChain(rootfsDir: string, directoryPath: string): void {
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

  makeDirectoryOwnerWritable(normalizedRoot);

  const relative = path.relative(normalizedRoot, normalizedDirectory);
  if (!relative || relative === ".") {
    return;
  }

  let current = normalizedRoot;
  for (const segment of relative.split(path.sep).filter((item) => item.length > 0)) {
    current = path.join(current, segment);
    makeDirectoryOwnerWritable(current);
  }
}

function resolvePathForExtraction(rootfsDir: string, targetPath: string): string {
  const rootAliasPath = path.resolve(rootfsDir);
  let normalizedRoot = rootAliasPath;

  try {
    normalizedRoot = path.resolve(fs.realpathSync.native(rootfsDir));
  } catch {
    // best effort
  }

  if (pathExists(targetPath)) {
    try {
      const resolved = fs.realpathSync.native(targetPath);
      const normalizedResolved = path.resolve(resolved);
      if (
        normalizedResolved === normalizedRoot ||
        normalizedResolved.startsWith(`${normalizedRoot}${path.sep}`)
      ) {
        return normalizedResolved;
      }
    } catch {
      // best effort fallback below
    }
  }

  const normalizedTarget = path.resolve(targetPath);
  if (
    normalizedRoot !== rootAliasPath &&
    (normalizedTarget === rootAliasPath || normalizedTarget.startsWith(`${rootAliasPath}${path.sep}`))
  ) {
    return path.join(normalizedRoot, path.relative(rootAliasPath, normalizedTarget));
  }

  return targetPath;
}

function ensureParentDirectory(rootfsDir: string, directoryPath: string): void {
  ensureWritableDirectoryAndResolvedTarget(rootfsDir, path.dirname(directoryPath));
  ensureWritableDirectoryAndResolvedTarget(rootfsDir, directoryPath);

  try {
    fs.mkdirSync(directoryPath, { recursive: true });
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== "EEXIST") {
      throw error;
    }
  }
}

function ensureSymlink(rootfsDir: string, targetRelativePath: string, symlinkTarget: string): void {
  const finalPath = path.join(rootfsDir, targetRelativePath);
  ensureParentDirectory(rootfsDir, path.dirname(finalPath));
  removePathForInjection(rootfsDir, finalPath);
  fs.symlinkSync(symlinkTarget, finalPath);
}

function ensureRuntimeDirectory(rootfsDir: string, targetRelativePath: string): void {
  const finalPath = path.join(rootfsDir, targetRelativePath);

  if (pathExists(finalPath)) {
    const stat = fs.lstatSync(finalPath);
    if (!stat.isDirectory()) {
      removePathForInjection(rootfsDir, finalPath);
    }
  }

  ensureParentDirectory(rootfsDir, finalPath);

  try {
    fs.mkdirSync(finalPath, { recursive: true });
  } catch {
    // best effort
  }
}

function findDebugfsCommand(): string {
  for (const candidate of DEBUGFS_CANDIDATES) {
    const result = spawnSync(candidate, ["-V"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (result.status === 0 || result.status === 1) {
      return candidate;
    }
  }

  throw new CliUsageError("Required command 'debugfs' was not found.", [
    "Install e2fsprogs.",
    "macOS: brew install e2fsprogs",
    "Linux: sudo apt install e2fsprogs",
    "If installed but not on PATH, expose debugfs from your e2fsprogs installation.",
  ]);
}
