# Linux setup guide

This guide is for running `docker2vm` on Linux hosts.

`docker2vm` includes a pinned Gondolin runtime dependency (`@earendil-works/gondolin@0.2.1`) to resolve guest assets during conversion.

## 1) Install required tools

Install tools using their official docs/download pages:

- Bun: https://bun.com/
- QEMU: https://www.qemu.org/download/
- e2fsprogs: https://e2fsprogs.sourceforge.net/

If you want Dockerfile conversion (`dockerfile2gondolin`), also install Docker + Buildx:

- Docker: https://docs.docker.com/get-docker/
- Buildx: https://docs.docker.com/build/buildx/install/

## 2) Optional: install Gondolin CLI (for running generated assets)

`docker2vm` is tested with `@earendil-works/gondolin@0.2.1` and can fetch guest assets automatically during conversion.

Use Gondolin CLI install docs:

- https://earendil-works.github.io/gondolin/cli/
- Package page: https://www.npmjs.com/package/@earendil-works/gondolin

## 3) Verify toolchain

```bash
bun --version
qemu-system-x86_64 --version
mke2fs -V
debugfs -V
gondolin --help >/dev/null
```

## 4) Validate from source checkout

```bash
bun run test
bun run typecheck
bun run build
```

## 5) Choose the build platform

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

## 6) Run integration + smoke checks

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
