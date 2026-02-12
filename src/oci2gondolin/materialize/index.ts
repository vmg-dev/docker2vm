import fs from "node:fs";
import path from "node:path";

import type { AppliedRootfs, MaterializedOutput, Oci2GondolinOptions } from "../types";
import { sha256File } from "../utils/digest";
import { resolveGondolinGuestAssets } from "../../shared/gondolin-assets";
import { ensureDirectory } from "../utils/fs";
import { createExt4FromDirectory } from "./ext4";
import { injectGondolinRuntime } from "./runtime-injection";

const ROOTFS_FILENAME = "rootfs.ext4";
const META_FILENAME = "meta.json";
const ASSET_MANIFEST_FILENAME = "manifest.json";
const KERNEL_FILENAME = "vmlinuz-virt";
const INITRAMFS_FILENAME = "initramfs.cpio.lz4";

export async function materializeOutput(
  applied: AppliedRootfs,
  options: Oci2GondolinOptions,
): Promise<MaterializedOutput> {
  const outDir = options.outDir;
  ensureDirectory(outDir);

  const injectionResult = await injectGondolinRuntime(applied.rootfsDir);

  const rootfsPath = path.join(outDir, ROOTFS_FILENAME);
  createExt4FromDirectory(applied.rootfsDir, rootfsPath, "gondolin-root");

  const metadataPath = path.join(outDir, META_FILENAME);
  const metadata = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: applied.descriptor.source,
    sourceDigest: applied.descriptor.sourceDigest,
    platform: applied.descriptor.platform,
    mode: options.mode,
    runtime: applied.runtimeMetadata,
    runtimeInjection: {
      baseRootfsPath: injectionResult.baseRootfsPath,
      injectedFiles: injectionResult.injectedFiles.map((item) => path.relative(applied.rootfsDir, item)),
      injectedDirectories: injectionResult.injectedDirectories.map((item) =>
        path.relative(applied.rootfsDir, item),
      ),
    },
  };

  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

  const files = [rootfsPath, metadataPath];
  let assetManifestPath: string | undefined;

  if (options.mode === "assets") {
    const baseAssets = await resolveGondolinGuestAssets();
    const kernelPath = path.join(outDir, KERNEL_FILENAME);
    const initramfsPath = path.join(outDir, INITRAMFS_FILENAME);

    fs.copyFileSync(baseAssets.kernelPath, kernelPath);
    fs.copyFileSync(baseAssets.initrdPath, initramfsPath);

    const assetManifest = {
      version: 1,
      buildTime: new Date().toISOString(),
      assets: {
        kernel: KERNEL_FILENAME,
        initramfs: INITRAMFS_FILENAME,
        rootfs: ROOTFS_FILENAME,
      },
      checksums: {
        kernel: sha256File(kernelPath),
        initramfs: sha256File(initramfsPath),
        rootfs: sha256File(rootfsPath),
      },
      source: {
        digest: applied.descriptor.sourceDigest,
        platform: applied.descriptor.platform,
      },
      runtime: applied.runtimeMetadata,
    };

    assetManifestPath = path.join(outDir, ASSET_MANIFEST_FILENAME);
    fs.writeFileSync(assetManifestPath, JSON.stringify(assetManifest, null, 2));

    files.push(kernelPath, initramfsPath, assetManifestPath);
  }

  return {
    outDir,
    mode: options.mode,
    rootfsPath,
    metadataPath,
    assetManifestPath,
    files,
  };
}
