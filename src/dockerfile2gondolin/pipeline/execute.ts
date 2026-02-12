import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";

import { CliUsageError } from "../../shared/cli-errors";
import { executeConversion } from "../../oci2gondolin/pipeline/execute";
import type { Oci2GondolinOptions } from "../../oci2gondolin/types";
import { assertDirectoryExists, assertFileExists } from "../../oci2gondolin/utils/fs";
import { cleanupPaths, createTempDir } from "../../oci2gondolin/utils/temp";
import type { Dockerfile2GondolinOptions, Dockerfile2GondolinResult } from "../types";

export async function executeDockerfileWrapper(
  options: Dockerfile2GondolinOptions,
): Promise<Dockerfile2GondolinResult> {
  assertFileExists(options.dockerfilePath, "Dockerfile");
  assertDirectoryExists(options.contextPath, "Docker build context directory");

  const tempDir = createTempDir("dockerfile2gondolin-");
  const ociTarPath = path.join(tempDir, "image.oci.tar");

  try {
    if (options.builder === "docker-buildx") {
      ensureCommandAvailable("docker", ["buildx", "version"], "docker buildx backend");
      await runDockerBuildx(options, ociTarPath);
    } else {
      ensureCommandAvailable("buildctl", ["--version"], "buildctl backend");
      await runBuildctl(options, ociTarPath);
    }

    if (!fs.existsSync(ociTarPath)) {
      throw new CliUsageError("BuildKit finished but OCI tar output was not found.", [
        `Expected file: ${ociTarPath}`,
        "Check BuildKit output configuration and logs.",
      ]);
    }

    const conversionOptions: Oci2GondolinOptions = {
      source: {
        kind: "oci-tar",
        path: ociTarPath,
      },
      platform: options.platform,
      mode: options.mode,
      outDir: options.outDir,
      dryRun: false,
    };

    const conversion = await executeConversion(conversionOptions);

    return {
      command: "dockerfile2gondolin",
      builder: options.builder,
      ociTarTemporaryPath: ociTarPath,
      ociTarDeletedAfterRun: true,
      conversion,
    };
  } finally {
    cleanupPaths([tempDir]);
  }
}

async function runDockerBuildx(options: Dockerfile2GondolinOptions, ociTarPath: string): Promise<void> {
  const temporaryBuilderName = `dockerfile2gondolin-${randomUUID().slice(0, 8)}`;

  try {
    await runCommand(
      "docker",
      ["buildx", "create", "--name", temporaryBuilderName, "--driver", "docker-container"],
      "docker buildx create",
    );

    const args = [
      "buildx",
      "build",
      "--builder",
      temporaryBuilderName,
      "--file",
      options.dockerfilePath,
      "--platform",
      options.platform,
      "--output",
      `type=oci,dest=${ociTarPath}`,
      "--provenance=false",
    ];

    if (options.target) {
      args.push("--target", options.target);
    }

    for (const buildArg of options.buildArgs) {
      assertBuildArg(buildArg);
      args.push("--build-arg", buildArg);
    }

    for (const secret of options.secrets) {
      args.push("--secret", secret);
    }

    args.push(options.contextPath);

    await runCommand("docker", args, "docker buildx build");
  } finally {
    // Best-effort cleanup. Ignore errors if builder already gone.
    spawnSync("docker", ["buildx", "rm", temporaryBuilderName], {
      stdio: ["ignore", "ignore", "ignore"],
      encoding: "utf8",
    });
  }
}

async function runBuildctl(options: Dockerfile2GondolinOptions, ociTarPath: string): Promise<void> {
  const dockerfileDir = path.dirname(options.dockerfilePath);
  const dockerfileName = path.basename(options.dockerfilePath);

  const args = [
    "build",
    "--frontend",
    "dockerfile.v0",
    "--local",
    `context=${options.contextPath}`,
    "--local",
    `dockerfile=${dockerfileDir}`,
    "--opt",
    `filename=${dockerfileName}`,
    "--opt",
    `platform=${options.platform}`,
    "--output",
    `type=oci,dest=${ociTarPath}`,
  ];

  if (options.target) {
    args.push("--opt", `target=${options.target}`);
  }

  for (const buildArg of options.buildArgs) {
    assertBuildArg(buildArg);
    const [key, value] = splitBuildArg(buildArg);
    args.push("--opt", `build-arg:${key}=${value}`);
  }

  for (const secret of options.secrets) {
    args.push("--secret", secret);
  }

  await runCommand("buildctl", args, "buildctl build");
}

function ensureCommandAvailable(
  command: string,
  versionArgs: string[],
  label: string,
): void {
  const result = spawnSync(command, versionArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    throw new CliUsageError(`Required ${label} is not available.`, [
      `Command check failed: ${command} ${versionArgs.join(" ")}`,
      result.stderr?.trim() || result.stdout?.trim() || "Command not found.",
      "Install and configure the requested backend, then retry.",
    ]);
  }
}

async function runCommand(command: string, args: string[], label: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: process.env,
    });

    child.on("error", (error) => {
      reject(
        new CliUsageError(`Failed to start ${label}.`, [
          error instanceof Error ? error.message : String(error),
        ]),
      );
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new CliUsageError(`${label} failed.`, [
          `Command exited with status ${code ?? "unknown"}.`,
          "Review BuildKit output above for the failing Dockerfile step.",
        ]),
      );
    });
  });
}

function assertBuildArg(value: string): void {
  if (!value.includes("=")) {
    throw new CliUsageError(`Invalid --build-arg '${value}'.`, [
      "Build args must be in KEY=VALUE format.",
    ]);
  }
}

function splitBuildArg(value: string): [string, string] {
  const idx = value.indexOf("=");
  return [value.slice(0, idx), value.slice(idx + 1)];
}
