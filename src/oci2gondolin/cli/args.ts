import path from "node:path";

import { CliHelpRequested, CliUsageError } from "../../shared/cli-errors";
import type { Oci2GondolinOptions, OciInputSource, OutputMode, SupportedPlatform } from "../types";

type RawArgs = {
  image?: string;
  ociLayout?: string;
  ociTar?: string;
  platform?: string;
  mode?: string;
  out?: string;
  dryRun: boolean;
};

export function defaultPlatformForArch(arch: NodeJS.Architecture): SupportedPlatform | null {
  if (arch === "x64") {
    return "linux/amd64";
  }

  if (arch === "arm64") {
    return "linux/arm64";
  }

  return null;
}

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

    return {
      value: inlineValue,
      nextIndex: index,
    };
  }

  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new CliUsageError(`${flag} requires a value.`, [`Example: ${flag} <value>`]);
  }

  return {
    value,
    nextIndex: index + 1,
  };
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
      "Example: --mode rootfs",
    ]);
  }

  return normalized as OutputMode;
}

export function normalizePlatform(platform: string | undefined): SupportedPlatform {
  if (!platform) {
    const detected = defaultPlatformForArch(process.arch);
    if (!detected) {
      throw new CliUsageError(
        `Unable to infer a default platform from host architecture '${process.arch}'.`,
        ["Pass --platform linux/amd64 or --platform linux/arm64 explicitly."],
      );
    }

    return detected;
  }

  const normalized = platform.trim().toLowerCase();

  if (normalized === "amd64" || normalized === "arm64") {
    return `linux/${normalized}` as SupportedPlatform;
  }

  const parts = normalized.split("/");
  if (parts.length !== 2) {
    throw new CliUsageError(`Invalid platform format '${platform}'.`, [
      "Use linux/amd64 or linux/arm64.",
      "Short forms amd64 and arm64 are also accepted.",
    ]);
  }

  const [os, arch] = parts;
  if (os !== "linux") {
    throw new CliUsageError(`Unsupported platform OS '${os}'.`, [
      "Only Linux OCI images are supported in MVP.",
      "Use --platform linux/amd64 or --platform linux/arm64.",
    ]);
  }

  if (arch !== "amd64" && arch !== "arm64") {
    throw new CliUsageError(`Unsupported platform architecture '${arch}'.`, [
      "MVP currently supports only amd64 and arm64.",
      "Use --platform linux/amd64 or --platform linux/arm64.",
    ]);
  }

  return `${os}/${arch}` as SupportedPlatform;
}

function resolveSource(raw: RawArgs): OciInputSource {
  const sourceOptions: Array<OciInputSource> = [];

  if (raw.image) {
    sourceOptions.push({ kind: "image", ref: raw.image });
  }

  if (raw.ociLayout) {
    sourceOptions.push({
      kind: "oci-layout",
      path: path.resolve(raw.ociLayout),
    });
  }

  if (raw.ociTar) {
    sourceOptions.push({
      kind: "oci-tar",
      path: path.resolve(raw.ociTar),
    });
  }

  if (sourceOptions.length === 0) {
    throw new CliUsageError(
      "Exactly one input source is required.",
      [
        "Pass one of: --image, --oci-layout, --oci-tar.",
        "Example: oci2gondolin --image ghcr.io/org/app:latest --out ./out --dry-run",
      ],
    );
  }

  if (sourceOptions.length > 1) {
    const provided = sourceOptions.map((item) => item.kind).join(", ");
    throw new CliUsageError("Input source flags are mutually exclusive.", [
      `Received multiple sources: ${provided}.`,
      "Pass exactly one of: --image, --oci-layout, --oci-tar.",
    ]);
  }

  return sourceOptions[0];
}

export function parseOci2GondolinArgs(argv: string[]): Oci2GondolinOptions {
  const raw: RawArgs = {
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const { flag, inlineValue } = splitLongOption(token);

    switch (flag) {
      case "--help":
      case "-h":
        throw new CliHelpRequested();

      case "--dry-run": {
        if (inlineValue !== undefined) {
          throw new CliUsageError("--dry-run does not accept a value.", [
            "Use --dry-run as a standalone flag.",
          ]);
        }

        raw.dryRun = true;
        break;
      }

      case "--image": {
        const result = readValue(argv, i, flag, inlineValue);
        setOnce(raw, "image", result.value, flag);
        i = result.nextIndex;
        break;
      }

      case "--oci-layout": {
        const result = readValue(argv, i, flag, inlineValue);
        setOnce(raw, "ociLayout", result.value, flag);
        i = result.nextIndex;
        break;
      }

      case "--oci-tar": {
        const result = readValue(argv, i, flag, inlineValue);
        setOnce(raw, "ociTar", result.value, flag);
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

      case "--out": {
        const result = readValue(argv, i, flag, inlineValue);
        setOnce(raw, "out", result.value, flag);
        i = result.nextIndex;
        break;
      }

      default:
        if (token.startsWith("-")) {
          throw new CliUsageError(`Unknown option '${token}'.`, [
            "Run oci2gondolin --help to see supported options.",
          ]);
        }

        throw new CliUsageError(`Unexpected positional argument '${token}'.`, [
          "This command accepts only named flags.",
          "Run oci2gondolin --help for examples.",
        ]);
    }
  }

  const source = resolveSource(raw);

  if (!raw.out) {
    throw new CliUsageError("Missing required --out option.", [
      "Specify where output files should be written.",
      "Example: --out ./out/my-image",
    ]);
  }

  return {
    source,
    platform: normalizePlatform(raw.platform),
    mode: normalizeMode(raw.mode),
    outDir: path.resolve(raw.out),
    dryRun: raw.dryRun,
  };
}
