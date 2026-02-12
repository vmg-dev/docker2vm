import fs from "node:fs";
import path from "node:path";

import { CliUsageError } from "../../shared/cli-errors";
import {
  DOCKER_MANIFEST_LIST_MEDIA_TYPE,
  DOCKER_MANIFEST_V2_MEDIA_TYPE,
  OCI_IMAGE_INDEX_MEDIA_TYPE,
  OCI_IMAGE_MANIFEST_MEDIA_TYPE,
  SUPPORTED_LAYER_MEDIA_TYPES,
  isManifestListMediaType,
  isManifestMediaType,
  isSupportedConfigMediaType,
} from "../oci-media-types";
import { createRegistryClient } from "../registry/client";
import { parseImageReference } from "../registry/image-reference";
import type {
  OciDescriptor,
  OciInputSource,
  ResolvedImageDescriptor,
  SupportedPlatform,
} from "../types";
import { assertDirectoryExists, assertFileExists, ensureDirectory } from "../utils/fs";
import { parseDigest } from "../utils/digest";
import { createTempDir } from "../utils/temp";
import { extractTarToDirectory, parseTarBuffer, readTarOrTarGzFile } from "../utils/tar";

type ImageManifestDocument = {
  schemaVersion: number;
  mediaType?: string;
  config: OciDescriptor;
  layers: OciDescriptor[];
};

type ImageIndexDocument = {
  schemaVersion: number;
  mediaType?: string;
  manifests: OciDescriptor[];
};

export async function resolveImageDescriptor(
  source: OciInputSource,
  platform: SupportedPlatform,
): Promise<ResolvedImageDescriptor> {
  switch (source.kind) {
    case "image":
      return resolveFromRegistryImage(source, platform);

    case "oci-layout":
      return resolveFromOciLayout(source, platform, []);

    case "oci-tar": {
      assertFileExists(source.path, "OCI tar archive");

      const extractedLayoutDir = createTempDir("oci2gondolin-layout-");
      ensureDirectory(extractedLayoutDir);

      const tarBuffer = readTarOrTarGzFile(source.path);
      const entries = parseTarBuffer(tarBuffer);
      extractTarToDirectory(entries, extractedLayoutDir);

      const layoutSource: OciInputSource = {
        kind: "oci-layout",
        path: extractedLayoutDir,
      };

      return resolveFromOciLayout(layoutSource, platform, [extractedLayoutDir]);
    }
  }
}

async function resolveFromRegistryImage(
  source: Extract<OciInputSource, { kind: "image" }>,
  platform: SupportedPlatform,
): Promise<ResolvedImageDescriptor> {
  const parsedRef = parseImageReference(source.ref);
  const client = createRegistryClient(parsedRef);

  const topLevelManifest = await client.fetchManifest(parsedRef.reference);
  const topLevelJson = safeParseJson(topLevelManifest.body.toString("utf8"), "registry manifest");

  let selectedManifestDescriptor = topLevelManifest.descriptor;
  let selectedManifestJson = topLevelJson;

  if (isManifestListMediaType(topLevelManifest.mediaType)) {
    const index = asImageIndexDocument(topLevelJson, "registry manifest index");
    selectedManifestDescriptor = selectManifestForPlatform(index.manifests, platform);

    const resolvedManifest = await client.fetchManifest(selectedManifestDescriptor.digest);
    selectedManifestJson = safeParseJson(
      resolvedManifest.body.toString("utf8"),
      `manifest ${selectedManifestDescriptor.digest}`,
    );

    if (!isManifestMediaType(resolvedManifest.mediaType)) {
      throw new CliUsageError(`Unsupported resolved manifest media type '${resolvedManifest.mediaType}'.`, [
        "Expected an OCI or Docker v2 image manifest.",
      ]);
    }
  } else if (!isManifestMediaType(topLevelManifest.mediaType)) {
    throw new CliUsageError(`Unsupported manifest media type '${topLevelManifest.mediaType}'.`, [
      "Expected an OCI/Docker manifest or manifest list.",
    ]);
  }

  const manifest = asImageManifestDocument(selectedManifestJson, "registry image manifest");
  validateManifestContents(manifest);

  return {
    source,
    platform,
    manifestDescriptor: {
      ...selectedManifestDescriptor,
      mediaType: selectedManifestDescriptor.mediaType || OCI_IMAGE_MANIFEST_MEDIA_TYPE,
    },
    configDescriptor: manifest.config,
    layerDescriptors: manifest.layers,
    sourceDigest: selectedManifestDescriptor.digest,
    sourceDetails: {
      kind: "registry",
      registry: parsedRef.registryApiHost,
      repository: parsedRef.repository,
      reference: parsedRef.reference,
    },
    tempPaths: [],
  };
}

function resolveFromOciLayout(
  source: Extract<OciInputSource, { kind: "oci-layout" }>,
  platform: SupportedPlatform,
  tempPaths: string[],
): ResolvedImageDescriptor {
  assertDirectoryExists(source.path, "OCI layout directory");

  const indexPath = path.join(source.path, "index.json");
  assertFileExists(indexPath, "OCI layout index.json");

  const indexRaw = fs.readFileSync(indexPath, "utf8");
  const indexJson = safeParseJson(indexRaw, "OCI layout index.json");
  const index = asImageIndexDocument(indexJson, "OCI layout index");

  if (!Array.isArray(index.manifests) || index.manifests.length === 0) {
    throw new CliUsageError("OCI layout index has no manifests.", [
      `Path: ${indexPath}`,
      "Ensure the OCI layout is complete and valid.",
    ]);
  }

  const topDescriptor = selectManifestForPlatform(index.manifests, platform);
  const resolvedManifestDescriptor = resolveManifestDescriptorFromLayout(source.path, topDescriptor, platform);
  const manifestBlob = readLayoutBlob(source.path, resolvedManifestDescriptor.digest).toString("utf8");
  const manifestJson = safeParseJson(manifestBlob, `manifest ${resolvedManifestDescriptor.digest}`);
  const manifest = asImageManifestDocument(manifestJson, "OCI image manifest");
  validateManifestContents(manifest);

  return {
    source,
    platform,
    manifestDescriptor: resolvedManifestDescriptor,
    configDescriptor: manifest.config,
    layerDescriptors: manifest.layers,
    sourceDigest: resolvedManifestDescriptor.digest,
    sourceDetails: {
      kind: "layout",
      layoutPath: source.path,
    },
    tempPaths,
  };
}

function resolveManifestDescriptorFromLayout(
  layoutPath: string,
  descriptor: OciDescriptor,
  platform: SupportedPlatform,
): OciDescriptor {
  if (isManifestMediaType(descriptor.mediaType)) {
    return descriptor;
  }

  if (!isManifestListMediaType(descriptor.mediaType)) {
    throw new CliUsageError(`Unsupported descriptor media type '${descriptor.mediaType}'.`, [
      "Expected OCI manifest or OCI index descriptor in layout.",
    ]);
  }

  const indexBlob = readLayoutBlob(layoutPath, descriptor.digest).toString("utf8");
  const indexJson = safeParseJson(indexBlob, `index ${descriptor.digest}`);
  const nestedIndex = asImageIndexDocument(indexJson, `index ${descriptor.digest}`);
  const nestedDescriptor = selectManifestForPlatform(nestedIndex.manifests, platform);
  return resolveManifestDescriptorFromLayout(layoutPath, nestedDescriptor, platform);
}

function readLayoutBlob(layoutPath: string, digest: string): Buffer {
  const parsed = parseDigest(digest);
  const blobPath = path.join(layoutPath, "blobs", parsed.algorithm, parsed.hex);
  assertFileExists(blobPath, `blob ${digest}`);
  return fs.readFileSync(blobPath);
}

function safeParseJson(raw: string, label: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new CliUsageError(`Failed to parse ${label} JSON.`, [
      error instanceof Error ? error.message : String(error),
    ]);
  }
}

function asImageIndexDocument(value: unknown, label: string): ImageIndexDocument {
  if (!value || typeof value !== "object") {
    throw new CliUsageError(`Invalid ${label}: expected object.`, []);
  }

  const candidate = value as Partial<ImageIndexDocument>;
  if (candidate.schemaVersion !== 2 || !Array.isArray(candidate.manifests)) {
    throw new CliUsageError(`Invalid ${label}: expected schemaVersion 2 with manifests array.`, []);
  }

  return candidate as ImageIndexDocument;
}

function asImageManifestDocument(value: unknown, label: string): ImageManifestDocument {
  if (!value || typeof value !== "object") {
    throw new CliUsageError(`Invalid ${label}: expected object.`, []);
  }

  const candidate = value as Partial<ImageManifestDocument>;
  if (candidate.schemaVersion !== 2 || !candidate.config || !Array.isArray(candidate.layers)) {
    throw new CliUsageError(`Invalid ${label}: expected schemaVersion 2 with config and layers.`, []);
  }

  return candidate as ImageManifestDocument;
}

function selectManifestForPlatform(descriptors: OciDescriptor[], platform: SupportedPlatform): OciDescriptor {
  const [targetOs, targetArch] = platform.split("/");

  if (descriptors.length === 1 && !descriptors[0].platform) {
    return descriptors[0];
  }

  const exactMatch = descriptors.find((descriptor) => {
    const platformInfo = descriptor.platform;
    if (!platformInfo) {
      return false;
    }

    return platformInfo.os === targetOs && platformInfo.architecture === targetArch;
  });

  if (exactMatch) {
    return exactMatch;
  }

  const available = descriptors
    .map((descriptor) => {
      if (!descriptor.platform) {
        return "(unknown)";
      }

      const os = descriptor.platform.os ?? "?";
      const arch = descriptor.platform.architecture ?? "?";
      const variant = descriptor.platform.variant ? `/${descriptor.platform.variant}` : "";
      return `${os}/${arch}${variant}`;
    })
    .join(", ");

  throw new CliUsageError(`No manifest matched requested platform '${platform}'.`, [
    `Available platforms: ${available || "none"}`,
    "Use --platform with one of the available values.",
  ]);
}

function validateManifestContents(manifest: ImageManifestDocument): void {
  if (!isSupportedConfigMediaType(manifest.config.mediaType)) {
    throw new CliUsageError(`Unsupported config media type '${manifest.config.mediaType}'.`, [
      "Expected OCI or Docker image config media type.",
    ]);
  }

  for (const layer of manifest.layers) {
    if (!SUPPORTED_LAYER_MEDIA_TYPES.has(layer.mediaType)) {
      throw new CliUsageError(`Unsupported layer media type '${layer.mediaType}'.`, [
        "This converter currently supports tar and tar+gzip layer media types.",
      ]);
    }
  }
}

export const __test = {
  safeParseJson,
  selectManifestForPlatform,
  asImageIndexDocument,
  asImageManifestDocument,
  resolveManifestDescriptorFromLayout,
  validateManifestContents,
  parseImageReference,
  mediaTypes: {
    OCI_IMAGE_INDEX_MEDIA_TYPE,
    OCI_IMAGE_MANIFEST_MEDIA_TYPE,
    DOCKER_MANIFEST_LIST_MEDIA_TYPE,
    DOCKER_MANIFEST_V2_MEDIA_TYPE,
  },
};
