import { describe, expect, it } from "bun:test";

import { parseImageReference } from "../src/oci2gondolin/registry/image-reference";

describe("parseImageReference", () => {
  it("parses docker hub short reference", () => {
    const parsed = parseImageReference("busybox:latest");

    expect(parsed.registry).toBe("docker.io");
    expect(parsed.registryApiHost).toBe("registry-1.docker.io");
    expect(parsed.repository).toBe("library/busybox");
    expect(parsed.reference).toBe("latest");
  });

  it("parses explicit registry and repository", () => {
    const parsed = parseImageReference("ghcr.io/org/app:1.2.3");

    expect(parsed.registry).toBe("ghcr.io");
    expect(parsed.registryApiHost).toBe("ghcr.io");
    expect(parsed.repository).toBe("org/app");
    expect(parsed.reference).toBe("1.2.3");
  });

  it("parses digest references", () => {
    const parsed = parseImageReference(
      "ghcr.io/org/app@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    );

    expect(parsed.digest).toBe(
      "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    );
    expect(parsed.reference).toBe(parsed.digest);
  });

  it("defaults tag to latest when omitted", () => {
    const parsed = parseImageReference("busybox");
    expect(parsed.reference).toBe("latest");
  });
});
