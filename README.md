# Gondolin Image Tools

External OCI-first tooling that converts container artifacts into Gondolin-bootable images **without modifying Gondolin core**.

## Status

Implemented and working:

- ✅ `oci2gondolin` core converter
  - input sources: `--image`, `--oci-layout`, `--oci-tar` (exactly one)
  - platform selection (`linux/amd64`, `linux/arm64`, plus short forms)
  - output modes: `rootfs`, `assets`
  - structured dry-run plans
  - actionable validation + runtime errors
- ✅ OCI resolver/puller for public registries (Bearer token flow)
- ✅ digest verification + local blob cache
- ✅ layer apply engine (tar+gzip, whiteouts, secure extraction checks)
- ✅ materialization
  - ext4 image creation (`rootfs.ext4`)
  - metadata emission (`meta.json`)
  - assets output (`vmlinuz-virt`, `initramfs.cpio.lz4`, `rootfs.ext4`, `manifest.json`)
- ✅ `dockerfile2gondolin` thin wrapper
  - BuildKit via `docker buildx` (temp docker-container builder)
  - BuildKit via `buildctl`
  - delegates conversion to `oci2gondolin`
- ✅ unit tests for argument parsing/validation

## Requirements

- Bun 1.2+
- Docker (for `dockerfile2gondolin`)
- `e2fsprogs` (`mke2fs`, `debugfs`) for rootfs creation/injection
- (optional runtime verification) `@earendil-works/gondolin` CLI + QEMU

macOS helpers:

```bash
brew install e2fsprogs qemu
```

## Install

```bash
bun install
```

## Quickstart

### 1) Validate build + tests

```bash
bun test
bun run typecheck
bun run build
```

### 2) Convert BusyBox image to Gondolin assets

```bash
bun run oci2gondolin -- \
  --image busybox:latest \
  --platform linux/arm64 \
  --mode assets \
  --out ./out/busybox-assets
```

### 3) Run with Gondolin package

```bash
GONDOLIN_GUEST_DIR=./out/busybox-assets bunx gondolin exec -- /bin/busybox echo hello
```

### 4) Dockerfile -> Gondolin (wrapper)

```bash
bun run dockerfile2gondolin -- \
  --file ./Dockerfile.busybox \
  --context . \
  --platform linux/arm64 \
  --mode assets \
  --out ./out/busybox-from-dockerfile
```

Then:

```bash
GONDOLIN_GUEST_DIR=./out/busybox-from-dockerfile bunx gondolin exec -- /bin/busybox echo wrapper-ok
```

## Distro smoke matrix (arm64)

Validated with `gondolin exec`:

- Alpine (`alpine:3.20`)
- Debian (`debian:bookworm-slim`)
- Ubuntu (`ubuntu:24.04`)
- Fedora (`fedora:latest`)
- Arch Linux ARM (`menci/archlinuxarm:latest`)

### macOS note (case-sensitive temp workspace)

Some images (notably Arch/Fedora) include case-sensitive filesystem paths that conflict on default case-insensitive macOS volumes. Use a case-sensitive temp mount and point `TMPDIR` at it when converting:

```bash
CASE_ROOT=$(mktemp -d)
IMG="$CASE_ROOT/oci2gondolin-casefs.sparseimage"
MP="$CASE_ROOT/mount"
mkdir -p "$MP"

hdiutil create -size 8g -type SPARSE -fs 'Case-sensitive APFS' -volname Oci2GondolinCase "$IMG"
hdiutil attach "$IMG" -mountpoint "$MP" -nobrowse

TMPDIR="$MP" bun run oci2gondolin -- --image menci/archlinuxarm:latest --platform linux/arm64 --mode assets --out ./out/arch-assets
GONDOLIN_GUEST_DIR=./out/arch-assets bunx gondolin exec -- /bin/sh -lc 'cat /etc/os-release | head -n 2'

hdiutil detach "$MP"
rm -rf "$CASE_ROOT"
```

## Dry-run examples

```bash
bun run oci2gondolin -- --image busybox:latest --out ./out/plan --dry-run
bun run dockerfile2gondolin -- --file ./Dockerfile --context . --out ./out/plan --dry-run
```

## Commands

### `oci2gondolin`

- Input source (exactly one):
  - `--image <ref>`
  - `--oci-layout <path>`
  - `--oci-tar <path>`
- `--platform linux/amd64|linux/arm64` (or `amd64|arm64`)
- `--mode rootfs|assets` (default: `rootfs`)
- `--out <path>` (required)
- `--dry-run`

### `dockerfile2gondolin`

- `--file <path>` (required)
- `--context <path>` (required)
- `--out <path>` (required)
- `--platform linux/amd64|linux/arm64`
- `--mode rootfs|assets`
- `--builder docker-buildx|buildctl`
- `--target <stage>`
- `--build-arg KEY=VALUE` (repeatable)
- `--secret ...` (repeatable)
- `--dry-run`

## Architecture

- `oci2gondolin` contains the converter pipeline (resolver/puller/layer-apply/materialize)
- converter applies OCI layers on top of an extracted Gondolin base rootfs to preserve runtime compatibility (`sandboxd`, `sandboxfs`, init flow)
- `dockerfile2gondolin` is a wrapper layer around BuildKit + `oci2gondolin`
- gondolin core remains external/unmodified

## Planning docs

- [`01-oci2gondolin-spec.md`](./01-oci2gondolin-spec.md)
- [`02-dockerfile2gondolin-wrapper.md`](./02-dockerfile2gondolin-wrapper.md)
- [`03-implementation-phases.md`](./03-implementation-phases.md)
- [`04-testing-and-release.md`](./04-testing-and-release.md)
- [`05-open-questions.md`](./05-open-questions.md)
