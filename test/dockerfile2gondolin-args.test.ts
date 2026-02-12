import { describe, expect, it } from "bun:test";
import path from "node:path";

import { parseDockerfile2GondolinArgs } from "../src/dockerfile2gondolin/cli/args";

describe("parseDockerfile2GondolinArgs", () => {
  it("parses required options with defaults", () => {
    const parsed = parseDockerfile2GondolinArgs([
      "--file",
      "./Dockerfile",
      "--context",
      ".",
      "--out",
      "./out/app",
    ]);

    expect(parsed.dockerfilePath).toBe(path.resolve("./Dockerfile"));
    expect(parsed.contextPath).toBe(path.resolve("."));
    expect(parsed.outDir).toBe(path.resolve("./out/app"));
    expect(parsed.mode).toBe("rootfs");
    expect(parsed.builder).toBe("docker-buildx");
  });

  it("supports repeatable build args and secrets", () => {
    const parsed = parseDockerfile2GondolinArgs([
      "--file",
      "./Dockerfile",
      "--context",
      ".",
      "--out",
      "./out/app",
      "--build-arg",
      "NODE_ENV=production",
      "--build-arg",
      "API_BASE=https://example.com",
      "--secret",
      "id=npmrc,src=.npmrc",
      "--dry-run",
    ]);

    expect(parsed.buildArgs).toEqual(["NODE_ENV=production", "API_BASE=https://example.com"]);
    expect(parsed.secrets).toEqual(["id=npmrc,src=.npmrc"]);
    expect(parsed.dryRun).toBe(true);
  });

  it("requires --file", () => {
    expect(() => parseDockerfile2GondolinArgs(["--context", ".", "--out", "./out"]))
      .toThrow(/Missing required --file option\./);
  });

  it("rejects unsupported builder", () => {
    expect(() =>
      parseDockerfile2GondolinArgs([
        "--file",
        "./Dockerfile",
        "--context",
        ".",
        "--out",
        "./out",
        "--builder",
        "kaniko",
      ]),
    ).toThrow(/Unsupported builder 'kaniko'\./);
  });
});
