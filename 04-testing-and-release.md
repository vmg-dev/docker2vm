# 04 — Testing and Release Plan

## Test matrix

## Unit tests
- Image ref parsing
- Manifest/index platform selection
- Digest verification
- Whiteout handling logic
- Secure extraction path checks

## Integration tests
- Public image conversion (alpine, debian-slim, distroless-like)
- Converted rootfs boots in Gondolin and can execute command
- Entry point/env/workdir metadata captured correctly

## Regression/security tests
- Path traversal tar entries
- Symlink overwrite attempts
- Duplicate file/dir collisions across layers

## Performance checks
- Cold pull timing vs warm cache timing
- Output rootfs size sanity checks
- Repeated conversion correctness with cache hits

## Release criteria
- `oci2gondolin` stable CLI + docs
- `dockerfile2gondolin` wrapper stable for at least one backend (`buildx`)
- deterministic outputs for pinned digests
- passing integration suite on macOS + Linux hosts

## Versioning/release strategy
- Start at `0.x`
- publish CLI artifacts and npm package (if Node-based)
- include compatibility table:
  - supported Gondolin versions
  - supported host OS
  - supported target architectures
