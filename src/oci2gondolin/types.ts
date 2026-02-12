export type OutputMode = "rootfs" | "assets";

export type SupportedPlatform = "linux/amd64" | "linux/arm64";

export type OciInputSource =
  | {
      kind: "image";
      ref: string;
    }
  | {
      kind: "oci-layout";
      path: string;
    }
  | {
      kind: "oci-tar";
      path: string;
    };

export interface Oci2GondolinOptions {
  source: OciInputSource;
  platform: SupportedPlatform;
  mode: OutputMode;
  outDir: string;
  dryRun: boolean;
}

export type OciLayerMediaType =
  | "application/vnd.oci.image.layer.v1.tar"
  | "application/vnd.oci.image.layer.v1.tar+gzip"
  | "application/vnd.docker.image.rootfs.diff.tar"
  | "application/vnd.docker.image.rootfs.diff.tar.gzip";

export interface OciDescriptor {
  mediaType: string;
  digest: string;
  size: number;
  platform?: {
    os?: string;
    architecture?: string;
    variant?: string;
  };
  annotations?: Record<string, string>;
}

export interface OciImageConfig {
  architecture?: string;
  os?: string;
  config?: {
    Entrypoint?: string[];
    Cmd?: string[];
    Env?: string[];
    WorkingDir?: string;
    User?: string;
  };
}

export interface RuntimeMetadata {
  entrypoint: string[];
  cmd: string[];
  env: string[];
  workdir: string;
  user: string;
}

export interface ResolvedImageDescriptor {
  source: OciInputSource;
  platform: SupportedPlatform;
  manifestDescriptor: OciDescriptor;
  configDescriptor: OciDescriptor;
  layerDescriptors: OciDescriptor[];
  sourceDigest: string;
  sourceDetails:
    | {
        kind: "registry";
        registry: string;
        repository: string;
        reference: string;
      }
    | {
        kind: "layout";
        layoutPath: string;
      };
  tempPaths: string[];
}

export interface PulledLayer {
  descriptor: OciDescriptor;
  blobPath: string;
}

export interface PulledImage {
  descriptor: ResolvedImageDescriptor;
  configBlobPath: string;
  config: OciImageConfig;
  layers: PulledLayer[];
  tempPaths: string[];
}

export interface AppliedRootfs {
  descriptor: ResolvedImageDescriptor;
  config: OciImageConfig;
  runtimeMetadata: RuntimeMetadata;
  rootfsDir: string;
  tempPaths: string[];
}

export interface MaterializedOutput {
  outDir: string;
  mode: OutputMode;
  rootfsPath: string;
  metadataPath: string;
  assetManifestPath?: string;
  files: string[];
}

export interface ConversionResult {
  command: "oci2gondolin";
  source: OciInputSource;
  sourceDigest: string;
  platform: SupportedPlatform;
  mode: OutputMode;
  outDir: string;
  rootfsPath: string;
  metadataPath: string;
  assetManifestPath?: string;
  files: string[];
}

export interface PipelineStep {
  id: string;
  stage: "resolver" | "puller" | "layer-apply" | "materialize";
  description: string;
  implementation: "implemented" | "planned";
}

export interface Oci2GondolinDryRunPlan {
  command: "oci2gondolin";
  dryRun: true;
  source: OciInputSource;
  platform: SupportedPlatform;
  mode: OutputMode;
  outDir: string;
  steps: PipelineStep[];
}
