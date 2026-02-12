export function dockerfile2GondolinUsage(): string {
  return [
    "Usage:",
    "  dockerfile2gondolin --file PATH --context PATH --out PATH [options]",
    "",
    "Options:",
    "  --file PATH          Dockerfile path (required)",
    "  --context PATH       Build context path (required)",
    "  --out PATH           Output directory (required)",
    "  --platform PLATFORM  Target platform (linux/amd64 or linux/arm64)",
    "  --mode MODE          Output mode: rootfs | assets (default: rootfs)",
    "  --builder NAME       Build backend: docker-buildx | buildctl (default: docker-buildx)",
    "  --target NAME        Dockerfile target stage",
    "  --build-arg KV       Build arg in KEY=VALUE format (repeatable)",
    "  --secret SPEC        Secret passthrough (repeatable)",
    "  --dry-run            Print wrapper plan and exit",
    "  --help, -h           Show this help",
    "",
    "Examples:",
    "  dockerfile2gondolin --file ./Dockerfile --context . --out ./out/app --platform linux/arm64 --mode assets",
    "  dockerfile2gondolin --file ./Dockerfile --context . --out ./out/app --builder buildctl"
  ].join("\n");
}
