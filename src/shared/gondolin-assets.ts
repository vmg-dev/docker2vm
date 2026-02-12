import path from "node:path";

import { ensureGuestAssets } from "@earendil-works/gondolin";

import { CliUsageError } from "./cli-errors";

export const TESTED_GONDOLIN_VERSION = "0.2.1";

export interface GondolinGuestAssets {
  assetDir: string;
  kernelPath: string;
  initrdPath: string;
  rootfsPath: string;
}

export async function resolveGondolinGuestAssets(): Promise<GondolinGuestAssets> {
  try {
    const assets = await ensureGuestAssets();

    return {
      assetDir: path.dirname(assets.rootfsPath),
      kernelPath: assets.kernelPath,
      initrdPath: assets.initrdPath,
      rootfsPath: assets.rootfsPath,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    throw new CliUsageError("Failed to resolve Gondolin guest assets.", [
      message,
      `Ensure @earendil-works/gondolin@${TESTED_GONDOLIN_VERSION} is installed.`,
      "To use custom assets, set GONDOLIN_GUEST_DIR to a directory containing kernel/initramfs/rootfs assets.",
    ]);
  }
}
