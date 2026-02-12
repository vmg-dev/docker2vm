# macOS setup guide

This guide is for running `docker2vm` on macOS (Apple Silicon or Intel).

`docker2vm` includes a pinned Gondolin runtime dependency (`@earendil-works/gondolin@0.2.1`) to resolve guest assets during conversion.

## 1) Install required tools

Install tools using their official docs/download pages:

- Bun: https://bun.com/
- QEMU: https://www.qemu.org/download/
- e2fsprogs: https://e2fsprogs.sourceforge.net/

If you want Dockerfile conversion (`dockerfile2gondolin`), also install Docker Desktop:
- https://docs.docker.com/desktop/setup/install/mac-install/

## 2) Optional: add `e2fsprogs` binaries to `PATH`

With Homebrew, `e2fsprogs` is often keg-only. `docker2vm` checks common Homebrew locations automatically, so a PATH change is usually **not required** for normal usage.

If you want to run `mke2fs` / `debugfs` manually in your shell:

```bash
export PATH="$(brew --prefix e2fsprogs)/sbin:$PATH"
```

To persist it, add that `export PATH=...` line to your shell profile (`~/.zshrc`, `~/.bashrc`, `~/.profile`, etc.).

## 3) Optional: install Gondolin CLI (for running generated assets)

`docker2vm` is tested with `@earendil-works/gondolin@0.2.1` and can fetch guest assets automatically during conversion.

Gondolin CLI docs:
- https://earendil-works.github.io/gondolin/cli/

Package page:
- https://www.npmjs.com/package/@earendil-works/gondolin

## 4) Verify toolchain

```bash
bun --version
qemu-system-aarch64 --version || qemu-system-x86_64 --version
"$(brew --prefix e2fsprogs)/sbin/mke2fs" -V
"$(brew --prefix e2fsprogs)/sbin/debugfs" -V
gondolin --help >/dev/null
```

## 5) Validate from source checkout

```bash
bun run test
bun run typecheck
bun run build
```

## 6) Choose the build platform

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

## 7) Run integration + smoke checks

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

`docker2vm` should find common Homebrew locations automatically. If your install uses a custom prefix, either add it to `PATH` or point `GONDOLIN_GUEST_DIR` to prepared assets and verify `e2fsprogs` binaries are installed.

### Case-sensitive filename conflicts during conversion

Some images include paths that conflict on case-insensitive filesystems.

Use a case-sensitive APFS location for temporary work/output (for example, a case-sensitive volume) and retry.
