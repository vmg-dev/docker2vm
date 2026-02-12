import fs from "node:fs";
import crypto from "node:crypto";

import { CliUsageError } from "../../shared/cli-errors";

export type ParsedDigest = {
  algorithm: string;
  hex: string;
};

export function parseDigest(value: string): ParsedDigest {
  const parts = value.split(":");
  if (parts.length !== 2) {
    throw new CliUsageError(`Invalid digest '${value}'.`, [
      "Expected digest format: sha256:<hex>",
    ]);
  }

  const [algorithm, hex] = parts;
  if (!algorithm || !hex) {
    throw new CliUsageError(`Invalid digest '${value}'.`, [
      "Expected digest format: sha256:<hex>",
    ]);
  }

  if (algorithm !== "sha256") {
    throw new CliUsageError(`Unsupported digest algorithm '${algorithm}'.`, [
      "Only sha256 digests are supported in this version.",
    ]);
  }

  if (!/^[a-fA-F0-9]{64}$/.test(hex)) {
    throw new CliUsageError(`Invalid sha256 digest '${value}'.`, [
      "Digest hex must be exactly 64 hexadecimal characters.",
    ]);
  }

  return {
    algorithm,
    hex: hex.toLowerCase(),
  };
}

export function formatSha256Digest(hex: string): string {
  return `sha256:${hex.toLowerCase()}`;
}

export function sha256Buffer(buffer: Buffer): string {
  const hash = crypto.createHash("sha256");
  hash.update(buffer);
  return hash.digest("hex");
}

export function sha256File(filePath: string): string {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(filePath, "r");
  const chunk = Buffer.allocUnsafe(1024 * 1024);

  try {
    while (true) {
      const read = fs.readSync(fd, chunk, 0, chunk.length, null);
      if (read <= 0) {
        break;
      }
      hash.update(chunk.subarray(0, read));
    }
  } finally {
    fs.closeSync(fd);
  }

  return hash.digest("hex");
}

export function assertFileDigest(filePath: string, expectedDigest: string): void {
  const parsed = parseDigest(expectedDigest);
  const actualHex = sha256File(filePath);
  if (actualHex !== parsed.hex) {
    throw new CliUsageError(
      `Digest mismatch for blob ${expectedDigest}.`,
      [
        `Expected sha256:${parsed.hex}`,
        `Actual   sha256:${actualHex}`,
        "Clear cache and retry if the local blob may be corrupted.",
      ],
    );
  }
}
