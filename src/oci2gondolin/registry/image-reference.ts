import { CliUsageError } from "../../shared/cli-errors";

export interface ParsedImageReference {
  original: string;
  registry: string;
  registryApiHost: string;
  repository: string;
  reference: string;
  tag?: string;
  digest?: string;
}

const DEFAULT_REGISTRY = "docker.io";
const DEFAULT_TAG = "latest";

export function parseImageReference(input: string): ParsedImageReference {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new CliUsageError("--image cannot be empty.", [
      "Pass a valid image reference such as busybox:latest or ghcr.io/org/app:tag.",
    ]);
  }

  if (trimmed.includes("://")) {
    throw new CliUsageError(`Invalid image reference '${input}'.`, [
      "Do not include a URL scheme.",
      "Use format: [registry/]repo[:tag] or [registry/]repo@sha256:<digest>.",
    ]);
  }

  let digest: string | undefined;
  let nameWithOptionalTag = trimmed;

  const atIndex = trimmed.lastIndexOf("@");
  if (atIndex >= 0) {
    digest = trimmed.slice(atIndex + 1);
    nameWithOptionalTag = trimmed.slice(0, atIndex);

    if (!digest) {
      throw new CliUsageError(`Invalid image reference '${input}'.`, [
        "Image digest after '@' cannot be empty.",
      ]);
    }
  }

  if (!nameWithOptionalTag) {
    throw new CliUsageError(`Invalid image reference '${input}'.`, [
      "Missing repository name.",
    ]);
  }

  const slashIndex = nameWithOptionalTag.indexOf("/");
  const firstSegment = slashIndex === -1 ? nameWithOptionalTag : nameWithOptionalTag.slice(0, slashIndex);

  let registry = DEFAULT_REGISTRY;
  let repositoryWithTag = nameWithOptionalTag;

  // Registry prefixes are only valid when a slash is present, e.g.:
  // - ghcr.io/org/app:tag
  // - localhost:5000/repo:tag
  if (slashIndex !== -1 && isRegistrySegment(firstSegment)) {
    registry = firstSegment;
    repositoryWithTag = nameWithOptionalTag.slice(firstSegment.length + 1);
  }

  if (!repositoryWithTag) {
    throw new CliUsageError(`Invalid image reference '${input}'.`, [
      "Missing repository path after registry.",
    ]);
  }

  let tag: string | undefined;
  const lastColon = repositoryWithTag.lastIndexOf(":");
  if (lastColon >= 0) {
    const lastSlash = repositoryWithTag.lastIndexOf("/");
    if (lastColon > lastSlash) {
      tag = repositoryWithTag.slice(lastColon + 1);
      repositoryWithTag = repositoryWithTag.slice(0, lastColon);

      if (!tag) {
        throw new CliUsageError(`Invalid image reference '${input}'.`, [
          "Tag cannot be empty.",
        ]);
      }
    }
  }

  if (!repositoryWithTag) {
    throw new CliUsageError(`Invalid image reference '${input}'.`, [
      "Repository cannot be empty.",
    ]);
  }

  let repository = repositoryWithTag;
  if (registry === DEFAULT_REGISTRY && !repository.includes("/")) {
    repository = `library/${repository}`;
  }

  const reference = digest ?? tag ?? DEFAULT_TAG;

  return {
    original: input,
    registry,
    registryApiHost: registry === DEFAULT_REGISTRY ? "registry-1.docker.io" : registry,
    repository,
    reference,
    tag,
    digest,
  };
}

function isRegistrySegment(segment: string): boolean {
  return segment.includes(".") || segment.includes(":") || segment === "localhost";
}
