# 01 — `oci2gondolin` Spec

## Objective
Convert an OCI image into a Gondolin-compatible boot artifact set that can be loaded via:

- `VM.create({ sandbox: { rootDiskPath, ... } })` (rootfs-only output), or
- `GONDOLIN_GUEST_DIR=<asset-dir>` / `sandbox.imagePath=<asset-dir>` (full bundle output)

## Constraints
- No changes to Gondolin runtime APIs required for MVP
- Keep host-side extraction secure (no path traversal, no symlink escapes)
- Ensure output keeps Gondolin guest contract required by `vm.exec`

## Inputs
Support at least these sources:

1. `--image <ref>` (registry image reference)
2. `--oci-layout <path>` (OCI layout directory)
3. `--oci-tar <path>` (OCI archive)

## Outputs
### Mode A: `rootfs`
Output files:
- `rootfs.ext4`
- `meta.json` (source digest, platform, entrypoint/cmd/env/workdir/user)

### Mode B: `assets`
Output directory:
- `vmlinuz-virt`
- `initramfs.cpio.lz4`
- `rootfs.ext4`
- `manifest.json`

`assets` mode copies kernel/initramfs from a selected Gondolin base bundle, then injects converted rootfs.

## CLI (proposed)
```bash
oci2gondolin --image ghcr.io/org/app:latest \
  --platform linux/arm64 \
  --out ./out/app-assets \
  --mode assets

oci2gondolin --oci-tar ./app.oci.tar \
  --out ./out/app-rootfs \
  --mode rootfs
```

## Functional pipeline
1. Parse source + platform
2. Resolve OCI manifest (single or index)
3. Download/read blobs + verify digest
4. Apply layers in order with whiteout handling
5. Materialize merged rootfs tree
6. Inject Gondolin runtime requirements
7. Build `rootfs.ext4`
8. Emit metadata + optional full assets bundle

## Runtime compatibility contract
For Gondolin SDK features to work, output rootfs must include:
- `sandboxd` available and started by init
- `sandboxfs` available if VFS mount behavior is expected
- init flow compatible with Gondolin initramfs handoff (`switch_root /init`) unless full custom initramfs is supplied

## MVP scope
- Linux images only
- `amd64` + `arm64`
- gzip-compressed layers required
- whiteouts supported
- private registry auth via standard bearer token flow

## Out of scope (initially)
- Windows containers
- non-Linux platforms
- advanced runtime translation (`HEALTHCHECK`, `STOPSIGNAL`, cgroups tuning)
- full parity with Docker runtime semantics
