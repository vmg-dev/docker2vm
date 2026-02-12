# macOS setup guide

This guide is for running `docker2vm` on macOS (Apple Silicon or Intel).

## 1) Install required tools

```bash
brew install bun qemu e2fsprogs
```

If you want Dockerfile conversion (`dockerfile2gondolin`), also install Docker Desktop.

## 2) Ensure `mke2fs` and `debugfs` are on `PATH`

`e2fsprogs` is often keg-only on macOS.

### Apple Silicon (`/opt/homebrew`)

```bash
echo 'export PATH="/opt/homebrew/opt/e2fsprogs/sbin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### Intel (`/usr/local`)

```bash
echo 'export PATH="/usr/local/opt/e2fsprogs/sbin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

## 3) Verify toolchain

```bash
bun --version
qemu-system-aarch64 --version || qemu-system-x86_64 --version
mke2fs -V
debugfs -V
```

## 4) Install dependencies and validate

```bash
bun install
bun run test
bun run typecheck
bun run build
```

## 5) Choose the build platform

Use a platform that matches the architecture you will run in Gondolin.

- Apple Silicon (`uname -m` => `arm64`): use `linux/arm64`
- Intel Mac (`uname -m` => `x86_64`): use `linux/amd64`

`oci2gondolin` defaults automatically from host arch if `--platform` is omitted, but passing it explicitly is recommended.

Example:

```bash
bun run oci2gondolin -- \
  --image busybox:latest \
  --platform linux/arm64 \
  --mode assets \
  --out ./out/busybox-assets
```

## 6) Run integration + smoke checks

Apple Silicon:

```bash
INTEGRATION_PLATFORM=linux/arm64 bun run test:integration
PLATFORM=linux/arm64 bun run e2e:smoke
```

Intel Mac:

```bash
INTEGRATION_PLATFORM=linux/amd64 bun run test:integration
PLATFORM=linux/amd64 bun run e2e:smoke
```

## Troubleshooting

### `mke2fs` / `debugfs` not found

Confirm PATH includes the `e2fsprogs` `sbin` directory shown above.

### Case-sensitive filename conflicts during conversion

Some images include paths that conflict on case-insensitive filesystems.

Use a case-sensitive APFS location for temporary work/output (for example, a case-sensitive volume) and retry.
