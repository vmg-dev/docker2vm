# docker2vm

`docker2vm` converts OCI container images (or Dockerfiles via BuildKit) into VM-compatible outputs. Today, the runtime materialization target is [Gondolin](https://github.com/earendil-works/gondolin).

It follows an OCI-first flow inspired by "Docker without Docker":

- resolve/pull an OCI image
- apply layers to a root filesystem
- inject Gondolin runtime glue (init/sandbox binaries/modules)
- materialize `rootfs.ext4` (and optionally full guest assets)
- run with Gondolin

## Why this exists

Docker containers share the host kernel. Gondolin runs workloads inside a VM, so we need to convert container artifacts into a bootable guest rootfs while keeping Gondolin's kernel/init/runtime contract.

## Current features

- `oci2gondolin` core converter
  - input: `--image`, `--oci-layout`, `--oci-tar` (exactly one)
  - platform: `linux/amd64`, `linux/arm64`
  - modes: `rootfs`, `assets`
  - dry-run planning
- `dockerfile2gondolin` thin wrapper
  - builds Dockerfile to OCI tar (BuildKit) and delegates to `oci2gondolin`
- secure-ish layer handling
  - digest verification
  - path traversal checks
  - symlink-parent protections
  - OCI whiteout handling
- Gondolin runtime integration
  - base rootfs extraction
  - runtime file/module injection
  - compatibility symlinks
- CI + E2E smoke test (GitHub Actions)

## Requirements

- Bun >= 1.2
- `e2fsprogs` (`mke2fs`, `debugfs`)
- QEMU (for runtime smoke checks via `gondolin exec`)
- Docker (only required for `dockerfile2gondolin`)

macOS helpers:

```bash
brew install e2fsprogs qemu
```

Ubuntu helpers:

```bash
sudo apt-get install -y e2fsprogs qemu-system-x86
```

## Platform setup guides

- [macOS guide](./docs/macos.md)
- [Linux guide](./docs/linux.md)

## Install

```bash
bun install
```

## Quickstart

### 1) Validate

```bash
bun test
bun run typecheck
bun run build
```

### 1b) Run integration tests

```bash
bun run test:integration
```

The CI integration matrix currently validates:

- `alpine:3.20`
- `debian:bookworm-slim`
- `ubuntu:24.04`
- `fedora:41`
- `archlinux:latest`

For each distro row, tests run a distro-specific probe command (for example `/etc/debian_version`, `/etc/fedora-release`, etc.) and also assert that probe does **not** match on the base Gondolin guest image.

### Choosing the build platform (`--platform`)

`--platform` selects which OCI image variant to convert, and should match the architecture you plan to run in Gondolin.

- Apple Silicon / arm64 Linux hosts: `linux/arm64`
- Intel / amd64 hosts: `linux/amd64`
- If omitted, `oci2gondolin` defaults from host arch (`x64 -> linux/amd64`, `arm64 -> linux/arm64`).

For helper scripts:

- `e2e:smoke` uses `PLATFORM`
- integration tests use `INTEGRATION_PLATFORM`

Cross-arch builds are possible at image-selection time, but for reliable runtime execution you should use a platform that matches the runtime guest architecture.

### 2) Convert image -> assets

```bash
bun run oci2gondolin -- \
  --image busybox:latest \
  --platform linux/arm64 \
  --mode assets \
  --out ./out/busybox-assets
```

### 3) Run with Gondolin

```bash
GONDOLIN_GUEST_DIR=./out/busybox-assets bunx gondolin exec -- /bin/busybox echo hello
```

## Dockerfile flow

Create a Dockerfile and convert it through BuildKit:

```bash
cat > /tmp/Dockerfile.demo <<'EOF'
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends cowsay && rm -rf /var/lib/apt/lists/*
CMD ["/bin/sh"]
EOF

bun run dockerfile2gondolin -- \
  --file /tmp/Dockerfile.demo \
  --context /tmp \
  --platform linux/arm64 \
  --mode assets \
  --out ./out/demo-assets
```

Then run:

```bash
GONDOLIN_GUEST_DIR=./out/demo-assets bunx gondolin exec -- /usr/games/cowsay "hello"
```

## End-to-end smoke test

Local/CI smoke test script:

```bash
bun run e2e:smoke
```

Optional env overrides:

- `PLATFORM` (default auto-detected from host arch)
- `IMAGE` (default `busybox:latest`)
- `OUT_DIR` (default `./out/e2e-busybox-assets`)

Example:

```bash
PLATFORM=linux/amd64 IMAGE=busybox:latest bun run e2e:smoke
```

## CLI summary

### `oci2gondolin`

```text
oci2gondolin (--image REF | --oci-layout PATH | --oci-tar PATH) [options]

--platform linux/amd64|linux/arm64
--mode rootfs|assets
--out PATH
--dry-run
```

### `dockerfile2gondolin`

```text
dockerfile2gondolin --file PATH --context PATH --out PATH [options]

--platform linux/amd64|linux/arm64
--mode rootfs|assets
--builder docker-buildx|buildctl
--target NAME
--build-arg KEY=VALUE  (repeatable)
--secret SPEC          (repeatable)
--dry-run
```

## Architecture overview

1. **Resolver**: pick correct manifest for requested platform
2. **Puller**: fetch blobs + verify digest
3. **Layer apply**: unpack tar layers in order with whiteouts
4. **Materialize**:
   - emit `rootfs.ext4`
   - emit `meta.json`
   - in `assets` mode also copy kernel/initramfs and write `manifest.json`

## Repo notes

- This repo is standalone; Gondolin core is not modified.
- Gondolin upstream repository: https://github.com/earendil-works/gondolin
- `out/` is generated output and ignored by git.
