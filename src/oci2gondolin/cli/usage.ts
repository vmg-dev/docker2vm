export function oci2GondolinUsage(): string {
  return [
    "Usage:",
    "  oci2gondolin (--image REF | --oci-layout PATH | --oci-tar PATH) [options]",
    "",
    "Options:",
    "  --image REF           OCI image reference (e.g. ghcr.io/org/app:latest)",
    "  --oci-layout PATH     OCI image layout directory",
    "  --oci-tar PATH        OCI image archive (.tar)",
    "  --platform PLATFORM   Target platform (linux/amd64 or linux/arm64)",
    "  --mode MODE           Output mode: rootfs | assets (default: rootfs)",
    "  --out PATH            Output directory (required)",
    "  --dry-run             Print a structured conversion plan and exit",
    "  --help, -h            Show this help",
    "",
    "Examples:",
    "  oci2gondolin --image ghcr.io/org/app:latest --platform linux/arm64 --mode assets --out ./out/app --dry-run",
    "  oci2gondolin --oci-tar ./app.oci.tar --out ./out/rootfs --mode rootfs --dry-run"
  ].join("\n");
}
