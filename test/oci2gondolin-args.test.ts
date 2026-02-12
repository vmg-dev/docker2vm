import { describe, expect, it } from "bun:test";
import path from "node:path";

import { defaultPlatformForArch, parseOci2GondolinArgs } from "../src/oci2gondolin/cli/args";

describe("parseOci2GondolinArgs", () => {
  it("parses --image source with explicit options", () => {
    const parsed = parseOci2GondolinArgs([
      "--image",
      "ghcr.io/org/app:latest",
      "--platform",
      "linux/arm64",
      "--mode",
      "assets",
      "--out",
      "./out/app",
      "--dry-run",
    ]);

    expect(parsed.source).toEqual({
      kind: "image",
      ref: "ghcr.io/org/app:latest",
    });
    expect(parsed.platform).toBe("linux/arm64");
    expect(parsed.mode).toBe("assets");
    expect(parsed.outDir).toBe(path.resolve("./out/app"));
    expect(parsed.dryRun).toBe(true);
  });

  it("parses --oci-layout source and applies defaults", () => {
    const parsed = parseOci2GondolinArgs(["--oci-layout", "./layout", "--out", "./out/rootfs"]);

    expect(parsed.source).toEqual({
      kind: "oci-layout",
      path: path.resolve("./layout"),
    });
    const inferredPlatform = defaultPlatformForArch(process.arch);
    if (!inferredPlatform) {
      throw new Error(`No default platform mapping for arch: ${process.arch}`);
    }

    expect(parsed.mode).toBe("rootfs");
    expect(parsed.platform).toBe(inferredPlatform);
    expect(parsed.dryRun).toBe(false);
  });

  it("requires exactly one input source", () => {
    expect(() => parseOci2GondolinArgs(["--out", "./out"])).toThrow(
      /Exactly one input source is required\./,
    );
  });

  it("rejects multiple input source flags", () => {
    expect(() =>
      parseOci2GondolinArgs([
        "--image",
        "ghcr.io/org/app:latest",
        "--oci-tar",
        "./app.tar",
        "--out",
        "./out",
      ]),
    ).toThrow(/Input source flags are mutually exclusive\./);
  });

  it("requires --out", () => {
    expect(() => parseOci2GondolinArgs(["--image", "ghcr.io/org/app:latest"])).toThrow(
      /Missing required --out option\./,
    );
  });

  it("rejects unsupported mode", () => {
    expect(() =>
      parseOci2GondolinArgs([
        "--image",
        "ghcr.io/org/app:latest",
        "--mode",
        "bundle",
        "--out",
        "./out",
      ]),
    ).toThrow(/Unsupported mode 'bundle'\./);
  });

  it("accepts short platform architecture values", () => {
    const parsed = parseOci2GondolinArgs([
      "--image",
      "ghcr.io/org/app:latest",
      "--platform",
      "amd64",
      "--out",
      "./out",
    ]);

    expect(parsed.platform).toBe("linux/amd64");
  });

  it("rejects unsupported platform architecture", () => {
    expect(() =>
      parseOci2GondolinArgs([
        "--image",
        "ghcr.io/org/app:latest",
        "--platform",
        "linux/s390x",
        "--out",
        "./out",
      ]),
    ).toThrow(/Unsupported platform architecture 's390x'\./);
  });
});
