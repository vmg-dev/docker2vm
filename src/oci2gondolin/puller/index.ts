import fs from "node:fs";
import path from "node:path";

import { CliUsageError } from "../../shared/cli-errors";
import { createRegistryClient } from "../registry/client";
import type { ParsedImageReference } from "../registry/image-reference";
import type { OciImageConfig, PulledImage, ResolvedImageDescriptor } from "../types";
import { assertFileDigest, parseDigest } from "../utils/digest";
import { assertFileExists, ensureDirectory, getBlobCachePath } from "../utils/fs";

export async function pullAndVerifyImage(descriptor: ResolvedImageDescriptor): Promise<PulledImage> {
  const registryClient =
    descriptor.sourceDetails.kind === "registry"
      ? createRegistryClient(createParsedReferenceFromSource(descriptor.sourceDetails))
      : null;

  const configBlobPath = await materializeBlob(descriptor, descriptor.configDescriptor.digest, registryClient);
  const configJson = parseConfigBlob(configBlobPath);

  const layers = [];
  for (const layerDescriptor of descriptor.layerDescriptors) {
    const blobPath = await materializeBlob(descriptor, layerDescriptor.digest, registryClient);
    layers.push({
      descriptor: layerDescriptor,
      blobPath,
    });
  }

  return {
    descriptor,
    configBlobPath,
    config: configJson,
    layers,
    tempPaths: descriptor.tempPaths,
  };
}

async function materializeBlob(
  descriptor: ResolvedImageDescriptor,
  digest: string,
  registryClient: ReturnType<typeof createRegistryClient> | null,
): Promise<string> {
  const parsedDigest = parseDigest(digest);
  const cachePath = getBlobCachePath(`${parsedDigest.algorithm}:${parsedDigest.hex}`);
  ensureDirectory(path.dirname(cachePath));

  if (fs.existsSync(cachePath)) {
    assertFileDigest(cachePath, digest);
    return cachePath;
  }

  if (descriptor.sourceDetails.kind === "layout") {
    const sourceBlobPath = path.join(
      descriptor.sourceDetails.layoutPath,
      "blobs",
      parsedDigest.algorithm,
      parsedDigest.hex,
    );

    assertFileExists(sourceBlobPath, `blob ${digest}`);
    assertFileDigest(sourceBlobPath, digest);
    fs.copyFileSync(sourceBlobPath, cachePath);
    assertFileDigest(cachePath, digest);
    return cachePath;
  }

  if (!registryClient) {
    throw new CliUsageError("Registry client is not initialized for image source.", []);
  }

  await registryClient.fetchBlobToFile(digest, cachePath);
  assertFileDigest(cachePath, digest);
  return cachePath;
}

function parseConfigBlob(configBlobPath: string): OciImageConfig {
  const raw = fs.readFileSync(configBlobPath, "utf8");
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new CliUsageError("Failed to parse OCI config blob JSON.", [
      error instanceof Error ? error.message : String(error),
      `Blob path: ${configBlobPath}`,
    ]);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new CliUsageError("OCI config blob JSON must be an object.", [
      `Blob path: ${configBlobPath}`,
    ]);
  }

  return parsed as OciImageConfig;
}

function createParsedReferenceFromSource(source: {
  registry: string;
  repository: string;
  reference: string;
}): ParsedImageReference {
  return {
    original: `${source.registry}/${source.repository}:${source.reference}`,
    registry: source.registry,
    registryApiHost: source.registry,
    repository: source.repository,
    reference: source.reference,
  };
}
