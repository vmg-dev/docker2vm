import type { Oci2GondolinDryRunPlan, Oci2GondolinOptions, PipelineStep } from "../types";

const PIPELINE_STEPS: PipelineStep[] = [
  {
    id: "resolve-manifest",
    stage: "resolver",
    description: "Resolve OCI manifest (or index) for the requested platform.",
    implementation: "implemented",
  },
  {
    id: "fetch-and-verify-blobs",
    stage: "puller",
    description: "Download/read config and layer blobs and verify sha256 digests.",
    implementation: "implemented",
  },
  {
    id: "apply-layers",
    stage: "layer-apply",
    description: "Apply ordered layers with whiteout semantics and secure extraction checks.",
    implementation: "implemented",
  },
  {
    id: "inject-runtime-and-build-ext4",
    stage: "materialize",
    description: "Inject Gondolin runtime files and build rootfs.ext4.",
    implementation: "implemented",
  },
  {
    id: "emit-output",
    stage: "materialize",
    description: "Emit mode-specific metadata and optional assets bundle.",
    implementation: "implemented",
  },
];

export function buildDryRunPlan(options: Oci2GondolinOptions): Oci2GondolinDryRunPlan {
  return {
    command: "oci2gondolin",
    dryRun: true,
    source: options.source,
    platform: options.platform,
    mode: options.mode,
    outDir: options.outDir,
    steps: PIPELINE_STEPS,
  };
}
