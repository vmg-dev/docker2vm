# 05 — Open Questions

## 1) Runtime injection strategy
How should `sandboxd`/`sandboxfs`/`sandboxssh` be injected?
- copy from known Gondolin base assets
- or package alongside converter and inject directly

## 2) Init ownership
Should converted images reuse Gondolin init scripts by default, or attempt to preserve container entrypoint semantics directly in init?

## 3) `USER` behavior
For non-root container users, should converter:
- preserve user exactly if present
- auto-create missing user
- fallback to root with warning

## 4) Full assets vs rootfs-only default
Which mode should be default for better UX?
- `assets` is easiest to run from CLI
- `rootfs` is simpler if caller already controls kernel/initramfs

## 5) Backend policy for Dockerfile wrapper
Should initial wrapper support only `docker buildx`, or also standalone `buildctl` on day one?

## 6) Distribution model
Should this live as:
- separate repo/tool (preferred for isolation)
- subpackage within Gondolin monorepo

## 7) Security posture
Do we need mandatory signature/cosign verification in v1, or treat as optional policy hook?

## 8) Metadata handoff
How should entrypoint/cmd/env/workdir/user metadata be passed to callers?
- JSON sidecar only
- generated launcher script
- direct VM helper API in separate SDK package
