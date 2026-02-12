import type { ConversionResult, Oci2GondolinOptions } from "../types";
import { applyLayers } from "../layer-apply";
import { materializeOutput } from "../materialize";
import { pullAndVerifyImage } from "../puller";
import { resolveImageDescriptor } from "../resolver";
import { cleanupPaths } from "../utils/temp";

export async function executeConversion(options: Oci2GondolinOptions): Promise<ConversionResult> {
  const cleanupTargets: string[] = [];

  try {
    const descriptor = await resolveImageDescriptor(options.source, options.platform);
    cleanupTargets.push(...descriptor.tempPaths);

    const pulled = await pullAndVerifyImage(descriptor);
    cleanupTargets.push(...pulled.tempPaths);

    const applied = await applyLayers(pulled);
    cleanupTargets.push(...applied.tempPaths);

    const materialized = await materializeOutput(applied, options);

    return {
      command: "oci2gondolin",
      source: options.source,
      sourceDigest: descriptor.sourceDigest,
      platform: options.platform,
      mode: options.mode,
      outDir: materialized.outDir,
      rootfsPath: materialized.rootfsPath,
      metadataPath: materialized.metadataPath,
      assetManifestPath: materialized.assetManifestPath,
      files: materialized.files,
    };
  } finally {
    cleanupPaths(cleanupTargets);
  }
}
