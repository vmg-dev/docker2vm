import { afterAll, describe, expect, it } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { VM } from "@earendil-works/gondolin";

type CommandResult = {
  code: number;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
};

type CommandOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
};

const REPO_ROOT = process.cwd();
const IMAGE = process.env.INTEGRATION_IMAGE ?? "busybox:latest";
const PLATFORM = resolveIntegrationPlatform(process.env.INTEGRATION_PLATFORM ?? process.arch);
const ROOTFS_CHECK_PATH = process.env.INTEGRATION_ROOTFS_CHECK_PATH ?? "/bin/sh";
const VM_CHECK_COMMAND = process.env.INTEGRATION_VM_CHECK_COMMAND ?? "echo integration-vm-ok";
const VM_CHECK_EXPECT = process.env.INTEGRATION_VM_CHECK_EXPECT ?? "integration-vm-ok";

const imageSlug = IMAGE.replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `docker2vm-integration-${imageSlug}-`));
const rootfsOutDir = path.join(tempRoot, `${imageSlug}-rootfs`);
const assetsOutDir = path.join(tempRoot, `${imageSlug}-assets`);

afterAll(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("oci2gondolin integration", () => {
  it(`materializes a rootfs image for ${IMAGE}`, async () => {
    const debugfsBinary = requireBinary("debugfs", [
      "/opt/homebrew/opt/e2fsprogs/sbin/debugfs",
      "/usr/local/opt/e2fsprogs/sbin/debugfs",
    ]);

    const result = await runCommand(
      "bun",
      [
        "run",
        "src/bin/oci2gondolin.ts",
        "--image",
        IMAGE,
        "--platform",
        PLATFORM,
        "--mode",
        "rootfs",
        "--out",
        rootfsOutDir,
      ],
      { cwd: REPO_ROOT, timeoutMs: 300_000 },
    );

    assertSuccess(result, "oci2gondolin rootfs conversion");

    const rootfsPath = path.join(rootfsOutDir, "rootfs.ext4");
    const metadataPath = path.join(rootfsOutDir, "meta.json");

    expect(fs.existsSync(rootfsPath)).toBe(true);
    expect(fs.existsSync(metadataPath)).toBe(true);
    expect(fs.existsSync(path.join(rootfsOutDir, "manifest.json"))).toBe(false);

    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8")) as {
      mode: string;
      platform: string;
      source?: { kind?: string; ref?: string };
    };

    expect(metadata.mode).toBe("rootfs");
    expect(metadata.platform).toBe(PLATFORM);
    expect(metadata.source?.kind).toBe("image");

    const debugfsResult = await runCommand(
      debugfsBinary,
      ["-R", `stat ${ROOTFS_CHECK_PATH}`, rootfsPath],
      { timeoutMs: 30_000 },
    );

    assertSuccess(debugfsResult, `debugfs stat ${ROOTFS_CHECK_PATH}`);
    const debugText = `${debugfsResult.stdout}\n${debugfsResult.stderr}`.toLowerCase();
    expect(debugText).not.toContain("file not found by ext2_lookup");
  }, 420_000);

  it(`materializes assets for ${IMAGE} and executes inside a VM`, async () => {
    requireBinary(process.arch === "arm64" ? "qemu-system-aarch64" : "qemu-system-x86_64");

    const result = await runCommand(
      "bun",
      [
        "run",
        "src/bin/oci2gondolin.ts",
        "--image",
        IMAGE,
        "--platform",
        PLATFORM,
        "--mode",
        "assets",
        "--out",
        assetsOutDir,
      ],
      { cwd: REPO_ROOT, timeoutMs: 300_000 },
    );

    assertSuccess(result, "oci2gondolin assets conversion");

    const rootfsPath = path.join(assetsOutDir, "rootfs.ext4");
    const metadataPath = path.join(assetsOutDir, "meta.json");
    const kernelPath = path.join(assetsOutDir, "vmlinuz-virt");
    const initramfsPath = path.join(assetsOutDir, "initramfs.cpio.lz4");
    const manifestPath = path.join(assetsOutDir, "manifest.json");

    expect(fs.existsSync(rootfsPath)).toBe(true);
    expect(fs.existsSync(metadataPath)).toBe(true);
    expect(fs.existsSync(kernelPath)).toBe(true);
    expect(fs.existsSync(initramfsPath)).toBe(true);
    expect(fs.existsSync(manifestPath)).toBe(true);

    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8")) as { mode: string; platform: string };
    expect(metadata.mode).toBe("assets");
    expect(metadata.platform).toBe(PLATFORM);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      assets: { rootfs: string; kernel: string; initramfs: string };
      source: { platform: string };
    };

    expect(manifest.assets.rootfs).toBe("rootfs.ext4");
    expect(manifest.assets.kernel).toBe("vmlinuz-virt");
    expect(manifest.assets.initramfs).toBe("initramfs.cpio.lz4");
    expect(manifest.source.platform).toBe(PLATFORM);

    const originalGuestDir = process.env.GONDOLIN_GUEST_DIR;
    const vmSandbox = resolveVmSandboxOptions();

    let vm: VM | null = null;
    try {
      process.env.GONDOLIN_GUEST_DIR = assetsOutDir;
      vm = await VM.create({ sandbox: vmSandbox });

      const execResult = await vm.exec(["/bin/sh", "-lc", VM_CHECK_COMMAND]);
      expect(execResult.exitCode).toBe(0);
      expect(execResult.stdout).toContain(VM_CHECK_EXPECT);
    } finally {
      await vm?.close().catch(() => {
        // ignore close errors in test teardown
      });

      if (originalGuestDir === undefined) {
        delete process.env.GONDOLIN_GUEST_DIR;
      } else {
        process.env.GONDOLIN_GUEST_DIR = originalGuestDir;
      }
    }
  }, 420_000);
});

function resolveIntegrationPlatform(raw: string): "linux/amd64" | "linux/arm64" {
  const value = raw.trim().toLowerCase();

  if (value === "linux/amd64" || value === "amd64" || value === "x64" || value === "x86_64") {
    return "linux/amd64";
  }

  if (value === "linux/arm64" || value === "arm64" || value === "aarch64") {
    return "linux/arm64";
  }

  throw new Error(
    `Unsupported INTEGRATION_PLATFORM/arch '${raw}'. Expected linux/amd64 or linux/arm64 (or host arch alias).`,
  );
}

function resolveVmSandboxOptions(): { accel?: "tcg"; cpu?: "max" } | undefined {
  if (process.platform !== "linux") {
    return undefined;
  }

  try {
    fs.accessSync("/dev/kvm", fs.constants.R_OK | fs.constants.W_OK);
    return undefined;
  } catch {
    return {
      accel: "tcg",
      cpu: "max",
    };
  }
}

function requireBinary(binary: string, fallbacks: string[] = []): string {
  const candidates = [binary, ...fallbacks];

  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["--help"], { stdio: "ignore" });
    const error = result.error as NodeJS.ErrnoException | undefined;

    if (!error) {
      return candidate;
    }

    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  throw new Error(
    `Missing required binary for integration tests: ${binary}. Checked: ${candidates.join(", ")}`,
  );
}

async function runCommand(
  command: string,
  args: string[],
  options: CommandOptions = {},
): Promise<CommandResult> {
  const timeoutMs = options.timeoutMs ?? 60_000;

  return await new Promise<CommandResult>((resolve, reject) => {
    const env = options.env ? { ...process.env, ...options.env } : process.env;
    const child = spawn(command, args, {
      cwd: options.cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        child.kill("SIGKILL");
      }, 2000).unref();

      reject(
        new Error(
          [
            `Command timed out after ${timeoutMs}ms: ${command} ${args.join(" ")}`,
            "--- stdout ---",
            stdout,
            "--- stderr ---",
            stderr,
          ].join("\n"),
        ),
      );
    }, timeoutMs);

    child.on("error", (error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code, signal) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolve({
        code: code ?? 1,
        signal,
        stdout,
        stderr,
      });
    });
  });
}

function assertSuccess(result: CommandResult, label: string): void {
  if (result.code === 0) {
    return;
  }

  throw new Error(
    [
      `${label} failed (exit code ${result.code}${result.signal ? `, signal ${result.signal}` : ""})`,
      "--- stdout ---",
      result.stdout,
      "--- stderr ---",
      result.stderr,
    ].join("\n"),
  );
}
