import type { Dockerfile2GondolinDryRunPlan, Dockerfile2GondolinOptions } from "../types";

export function buildDockerfileWrapperPlan(
  options: Dockerfile2GondolinOptions,
): Dockerfile2GondolinDryRunPlan {
  return {
    command: "dockerfile2gondolin",
    dryRun: true,
    builder: options.builder,
    dockerfilePath: options.dockerfilePath,
    contextPath: options.contextPath,
    platform: options.platform,
    mode: options.mode,
    outDir: options.outDir,
    steps: [
      {
        id: "validate-buildkit-backend",
        stage: "wrapper",
        description: "Validate requested BuildKit backend availability.",
        implementation: "implemented",
      },
      {
        id: "build-dockerfile-to-oci",
        stage: "buildkit",
        description: "Run BuildKit (buildx/buildctl) to emit an OCI tar archive.",
        implementation: "implemented",
      },
      {
        id: "invoke-oci2gondolin",
        stage: "oci2gondolin",
        description: "Invoke the oci2gondolin core pipeline with the generated OCI tar.",
        implementation: "implemented",
      },
      {
        id: "emit-summary",
        stage: "wrapper",
        description: "Emit concise summary of build + conversion outputs.",
        implementation: "implemented",
      },
    ],
  };
}
