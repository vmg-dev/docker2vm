import path from "node:path";

import { normalizePlatform } from "../../oci2gondolin/cli/args";
import type { OutputMode } from "../../oci2gondolin/types";
import { CliHelpRequested, CliUsageError } from "../../shared/cli-errors";
import type { BuilderBackend, Dockerfile2GondolinOptions } from "../types";

type RawArgs = {
  file?: string;
  context?: string;
  out?: string;
  platform?: string;
  mode?: string;
  builder?: string;
  target?: string;
  buildArgs: string[];
  secrets: string[];
  dryRun: boolean;
};

function splitLongOption(token: string): { flag: string; inlineValue: string | undefined } {
  if (!token.startsWith("--")) {
    return { flag: token, inlineValue: undefined };
  }

  const equalsIndex = token.indexOf("=");
  if (equalsIndex === -1) {
    return { flag: token, inlineValue: undefined };
  }

  return {
    flag: token.slice(0, equalsIndex),
    inlineValue: token.slice(equalsIndex + 1),
  };
}

function readValue(
  argv: string[],
  index: number,
  flag: string,
  inlineValue: string | undefined
): { value: string; nextIndex: number } {
  if (inlineValue !== undefined) {
    if (inlineValue.trim().length === 0) {
      throw new CliUsageError(`${flag} cannot be empty.`, [`Provide a non-empty value for ${flag}.`]);
    }

    return { value: inlineValue, nextIndex: index };
  }

  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new CliUsageError(`${flag} requires a value.`, [`Example: ${flag} <value>`]);
  }

  return { value, nextIndex: index + 1 };
}

function setOnce(raw: RawArgs, key: keyof RawArgs, value: string, flag: string): void {
  const existing = raw[key];
  if (typeof existing === "string") {
    throw new CliUsageError(`${flag} was provided more than once.`, [
      `Pass ${flag} only once. Received '${existing}' and '${value}'.`,
    ]);
  }

  (raw as Record<string, unknown>)[key] = value;
}

function normalizeMode(mode: string | undefined): OutputMode {
  if (!mode) {
    return "rootfs";
  }

  const normalized = mode.trim().toLowerCase();
  if (normalized !== "rootfs" && normalized !== "assets") {
    throw new CliUsageError(`Unsupported mode '${mode}'.`, [
      "Supported values are: rootfs, assets.",
    ]);
  }

  return normalized as OutputMode;
}

function normalizeBuilder(builder: string | undefined): BuilderBackend {
  if (!builder) {
    return "docker-buildx";
  }

  const normalized = builder.trim().toLowerCase();
  if (normalized !== "docker-buildx" && normalized !== "buildctl") {
    throw new CliUsageError(`Unsupported builder '${builder}'.`, [
      "Supported values are: docker-buildx, buildctl.",
    ]);
  }

  return normalized as BuilderBackend;
}

export function parseDockerfile2GondolinArgs(argv: string[]): Dockerfile2GondolinOptions {
  const raw: RawArgs = {
    buildArgs: [],
    secrets: [],
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const { flag, inlineValue } = splitLongOption(token);

    switch (flag) {
      case "--help":
      case "-h":
        throw new CliHelpRequested();

      case "--dry-run":
        if (inlineValue !== undefined) {
          throw new CliUsageError("--dry-run does not accept a value.", [
            "Use --dry-run as a standalone flag.",
          ]);
        }
        raw.dryRun = true;
        break;

      case "--file": {
        const result = readValue(argv, i, flag, inlineValue);
        setOnce(raw, "file", result.value, flag);
        i = result.nextIndex;
        break;
      }

      case "--context": {
        const result = readValue(argv, i, flag, inlineValue);
        setOnce(raw, "context", result.value, flag);
        i = result.nextIndex;
        break;
      }

      case "--out": {
        const result = readValue(argv, i, flag, inlineValue);
        setOnce(raw, "out", result.value, flag);
        i = result.nextIndex;
        break;
      }

      case "--platform": {
        const result = readValue(argv, i, flag, inlineValue);
        setOnce(raw, "platform", result.value, flag);
        i = result.nextIndex;
        break;
      }

      case "--mode": {
        const result = readValue(argv, i, flag, inlineValue);
        setOnce(raw, "mode", result.value, flag);
        i = result.nextIndex;
        break;
      }

      case "--builder": {
        const result = readValue(argv, i, flag, inlineValue);
        setOnce(raw, "builder", result.value, flag);
        i = result.nextIndex;
        break;
      }

      case "--target": {
        const result = readValue(argv, i, flag, inlineValue);
        setOnce(raw, "target", result.value, flag);
        i = result.nextIndex;
        break;
      }

      case "--build-arg": {
        const result = readValue(argv, i, flag, inlineValue);
        raw.buildArgs.push(result.value);
        i = result.nextIndex;
        break;
      }

      case "--secret": {
        const result = readValue(argv, i, flag, inlineValue);
        raw.secrets.push(result.value);
        i = result.nextIndex;
        break;
      }

      default:
        if (token.startsWith("-")) {
          throw new CliUsageError(`Unknown option '${token}'.`, [
            "Run dockerfile2gondolin --help to see supported options.",
          ]);
        }

        throw new CliUsageError(`Unexpected positional argument '${token}'.`, [
          "Use only named options.",
        ]);
    }
  }

  if (!raw.file) {
    throw new CliUsageError("Missing required --file option.", [
      "Point to your Dockerfile path (e.g. --file ./Dockerfile).",
    ]);
  }

  if (!raw.context) {
    throw new CliUsageError("Missing required --context option.", [
      "Set the Docker build context (e.g. --context .).",
    ]);
  }

  if (!raw.out) {
    throw new CliUsageError("Missing required --out option.", [
      "Set the destination directory for generated artifacts.",
    ]);
  }

  return {
    dockerfilePath: path.resolve(raw.file),
    contextPath: path.resolve(raw.context),
    outDir: path.resolve(raw.out),
    mode: normalizeMode(raw.mode),
    platform: normalizePlatform(raw.platform),
    builder: normalizeBuilder(raw.builder),
    target: raw.target,
    buildArgs: raw.buildArgs,
    secrets: raw.secrets,
    dryRun: raw.dryRun,
  };
}
