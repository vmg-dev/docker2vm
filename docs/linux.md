# Linux setup guide

This guide is for running `docker2vm` on Linux hosts.

## 1) Install required tools

### Ubuntu / Debian

```bash
sudo apt-get update
sudo apt-get install -y curl unzip e2fsprogs qemu-system-x86
```

Install Bun:

```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
```

If you want Dockerfile conversion (`dockerfile2gondolin`), install Docker and Buildx.

## 2) Verify toolchain

```bash
bun --version
qemu-system-x86_64 --version
mke2fs -V
debugfs -V
```

## 3) Install dependencies and validate

```bash
bun install
bun run test
bun run typecheck
bun run build
```

## 4) Choose the build platform

Use a platform that matches the architecture you will run in Gondolin.

- `uname -m` => `x86_64` or `amd64`: use `linux/amd64`
- `uname -m` => `aarch64` or `arm64`: use `linux/arm64`

`oci2gondolin` defaults automatically from host arch if `--platform` is omitted, but passing it explicitly is recommended.

Example:

```bash
bun run oci2gondolin -- \
  --image busybox:latest \
  --platform linux/amd64 \
  --mode assets \
  --out ./out/busybox-assets
```

## 5) Run integration + smoke checks

amd64 host:

```bash
INTEGRATION_PLATFORM=linux/amd64 bun run test:integration
PLATFORM=linux/amd64 bun run e2e:smoke
```

arm64 host:

```bash
INTEGRATION_PLATFORM=linux/arm64 bun run test:integration
PLATFORM=linux/arm64 bun run e2e:smoke
```

## Notes on virtualization performance

- If `/dev/kvm` is available, QEMU can use hardware acceleration.
- If `/dev/kvm` is unavailable (common in CI), the project falls back to TCG emulation (slower but functional).

## Troubleshooting

### `sandbox_stopped` / VM exits quickly

Confirm QEMU is installed and that you are using a platform that matches your host and assets.

### `mke2fs` or `debugfs` missing

Reinstall `e2fsprogs` and verify the commands are available in your shell.
