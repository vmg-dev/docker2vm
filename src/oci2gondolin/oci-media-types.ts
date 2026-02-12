import type { OciLayerMediaType } from "./types";

export const OCI_IMAGE_INDEX_MEDIA_TYPE = "application/vnd.oci.image.index.v1+json";
export const OCI_IMAGE_MANIFEST_MEDIA_TYPE = "application/vnd.oci.image.manifest.v1+json";
export const OCI_IMAGE_CONFIG_MEDIA_TYPE = "application/vnd.oci.image.config.v1+json";

export const DOCKER_MANIFEST_LIST_MEDIA_TYPE = "application/vnd.docker.distribution.manifest.list.v2+json";
export const DOCKER_MANIFEST_V2_MEDIA_TYPE = "application/vnd.docker.distribution.manifest.v2+json";
export const DOCKER_CONFIG_MEDIA_TYPE = "application/vnd.docker.container.image.v1+json";

export const SUPPORTED_LAYER_MEDIA_TYPES: ReadonlySet<string> = new Set<OciLayerMediaType>([
  "application/vnd.oci.image.layer.v1.tar",
  "application/vnd.oci.image.layer.v1.tar+gzip",
  "application/vnd.docker.image.rootfs.diff.tar",
  "application/vnd.docker.image.rootfs.diff.tar.gzip",
]);

export const MANIFEST_ACCEPT_HEADER = [
  OCI_IMAGE_INDEX_MEDIA_TYPE,
  OCI_IMAGE_MANIFEST_MEDIA_TYPE,
  DOCKER_MANIFEST_LIST_MEDIA_TYPE,
  DOCKER_MANIFEST_V2_MEDIA_TYPE,
].join(", ");

export function isManifestListMediaType(mediaType: string | undefined): boolean {
  return mediaType === OCI_IMAGE_INDEX_MEDIA_TYPE || mediaType === DOCKER_MANIFEST_LIST_MEDIA_TYPE;
}

export function isManifestMediaType(mediaType: string | undefined): boolean {
  return mediaType === OCI_IMAGE_MANIFEST_MEDIA_TYPE || mediaType === DOCKER_MANIFEST_V2_MEDIA_TYPE;
}

export function isSupportedConfigMediaType(mediaType: string | undefined): boolean {
  return mediaType === OCI_IMAGE_CONFIG_MEDIA_TYPE || mediaType === DOCKER_CONFIG_MEDIA_TYPE;
}

export function isGzipLayerMediaType(mediaType: string | undefined): boolean {
  return (
    mediaType === "application/vnd.oci.image.layer.v1.tar+gzip" ||
    mediaType === "application/vnd.docker.image.rootfs.diff.tar.gzip"
  );
}

export function isUncompressedLayerMediaType(mediaType: string | undefined): boolean {
  return (
    mediaType === "application/vnd.oci.image.layer.v1.tar" ||
    mediaType === "application/vnd.docker.image.rootfs.diff.tar"
  );
}
