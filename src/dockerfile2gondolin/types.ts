import type { ConversionResult, OutputMode, SupportedPlatform } from "../oci2gondolin/types";

export type BuilderBackend = "docker-buildx" | "buildctl";

export interface Dockerfile2GondolinOptions {
  dockerfilePath: string;
  contextPath: string;
  outDir: string;
  mode: OutputMode;
  platform: SupportedPlatform;
  builder: BuilderBackend;
  target?: string;
  buildArgs: string[];
  secrets: string[];
  dryRun: boolean;
}

export interface Dockerfile2GondolinDryRunPlan {
  command: "dockerfile2gondolin";
  dryRun: true;
  builder: BuilderBackend;
  dockerfilePath: string;
  contextPath: string;
  platform: SupportedPlatform;
  mode: OutputMode;
  outDir: string;
  steps: Array<{
    id: string;
    stage: "wrapper" | "buildkit" | "oci2gondolin";
    description: string;
    implementation: "implemented" | "planned";
  }>;
}

export interface Dockerfile2GondolinResult {
  command: "dockerfile2gondolin";
  builder: BuilderBackend;
  ociTarTemporaryPath: string;
  ociTarDeletedAfterRun: true;
  conversion: ConversionResult;
}
